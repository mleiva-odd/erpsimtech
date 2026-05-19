/**
 * Fase 26 · Smoke tests post-deploy.
 *
 * Valida endpoints críticos después de un deploy a producción/stage.
 * Cada chequeo es independiente y se reporta con status visual.
 *
 * Uso:
 *   npm run smoke                                       # usa prod
 *   npm run smoke -- --url https://staging.simtechgt.com
 *   BASE_URL=https://erp.simtechgt.com npm run smoke
 *
 * Exit codes:
 *   0 · todos los checks pasaron
 *   1 · al menos uno falló
 *
 * NO sustituye e2e Playwright. Es un health check liviano (~5 seg) para
 * confirmar que el deploy no rompió endpoints básicos. Si éste falla,
 * NO investigues más — rollback inmediato.
 */

const DEFAULT_BASE_URL = process.env.BASE_URL ?? 'https://erp.simtechgt.com';
const TIMEOUT_MS = 10_000;

interface Check {
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'HEAD';
  expectStatus: number | number[];
  /** Validación opcional del body JSON. */
  validateJson?: (json: unknown) => string | null;
}

const CHECKS: Check[] = [
  {
    name: 'Health check (DB up)',
    path: '/api/health',
    method: 'GET',
    expectStatus: 200,
    validateJson: (json) => {
      const j = json as { status?: string; db?: string };
      if (j.status !== 'ok') return `status='${j.status}' (esperado 'ok')`;
      if (j.db !== 'up') return `db='${j.db}' (esperado 'up')`;
      return null;
    },
  },
  {
    name: 'Landing / Login page renderiza',
    path: '/login',
    method: 'GET',
    expectStatus: 200,
  },
  {
    name: 'NextAuth CSRF endpoint disponible',
    path: '/api/auth/csrf',
    method: 'GET',
    expectStatus: 200,
    validateJson: (json) => {
      const j = json as { csrfToken?: string };
      if (!j.csrfToken || j.csrfToken.length < 16) {
        return 'csrfToken vacío o muy corto';
      }
      return null;
    },
  },
  {
    name: 'NextAuth session endpoint (sin auth devuelve null)',
    path: '/api/auth/session',
    method: 'GET',
    expectStatus: 200,
  },

  // ─── Fase 31b · Auth recovery flow ───
  {
    name: 'Forgot password page renderiza',
    path: '/forgot-password',
    method: 'GET',
    expectStatus: 200,
  },
  {
    name: 'Reset password page renderiza (sin token muestra error)',
    path: '/reset-password',
    method: 'GET',
    expectStatus: 200,
  },

  // ─── Fase 32 · Páginas legales públicas ───
  {
    name: 'Términos y condiciones disponibles',
    path: '/legal/terms',
    method: 'GET',
    expectStatus: 200,
  },
  {
    name: 'Política de privacidad disponible',
    path: '/legal/privacy',
    method: 'GET',
    expectStatus: 200,
  },
  {
    name: 'Página de soporte disponible',
    path: '/legal/support',
    method: 'GET',
    expectStatus: 200,
  },

  // ─── Fase 36 · SEO ───
  {
    name: 'robots.txt servido',
    path: '/robots.txt',
    method: 'GET',
    expectStatus: 200,
  },
  {
    name: 'sitemap.xml servido',
    path: '/sitemap.xml',
    method: 'GET',
    expectStatus: 200,
  },

  // ─── Fase 37 · Admin health (debe rechazar sin auth) ───
  {
    name: 'Admin health rechaza sin auth (401)',
    path: '/api/admin/health',
    method: 'GET',
    expectStatus: 401,
  },

  // ─── Fase 38 · Cron maintenance (debe rechazar GET y POST sin secret) ───
  {
    name: 'Cron maintenance rechaza GET con 405',
    path: '/api/cron/maintenance',
    method: 'GET',
    expectStatus: 405,
  },
  {
    name: 'Cron maintenance rechaza POST sin Bearer (401 ó 503)',
    path: '/api/cron/maintenance',
    method: 'POST',
    // 401 si CRON_SECRET está configurado, 503 si no.
    expectStatus: [401, 503],
  },
];

interface CheckResult {
  name: string;
  ok: boolean;
  durationMs: number;
  detail: string;
}

async function runCheck(baseUrl: string, check: Check): Promise<CheckResult> {
  const start = Date.now();
  const url = `${baseUrl}${check.path}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: check.method,
      signal: controller.signal,
      headers: { 'User-Agent': 'simtech-smoke-test/1.0' },
    });
    clearTimeout(timer);

    const expected = Array.isArray(check.expectStatus)
      ? check.expectStatus
      : [check.expectStatus];
    if (!expected.includes(res.status)) {
      return {
        name: check.name,
        ok: false,
        durationMs: Date.now() - start,
        detail: `HTTP ${res.status} (esperado ${expected.join('/')})`,
      };
    }

    if (check.validateJson) {
      const json = (await res.json().catch(() => null)) as unknown;
      if (json === null) {
        return {
          name: check.name,
          ok: false,
          durationMs: Date.now() - start,
          detail: 'Body no es JSON válido',
        };
      }
      const error = check.validateJson(json);
      if (error) {
        return {
          name: check.name,
          ok: false,
          durationMs: Date.now() - start,
          detail: `JSON inválido: ${error}`,
        };
      }
    }

    return {
      name: check.name,
      ok: true,
      durationMs: Date.now() - start,
      detail: `HTTP ${res.status} OK`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: check.name,
      ok: false,
      durationMs: Date.now() - start,
      detail: msg.includes('aborted') ? `Timeout (>${TIMEOUT_MS}ms)` : msg,
    };
  }
}

function parseArgs(): { baseUrl: string } {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf('--url');
  if (urlIdx >= 0 && args[urlIdx + 1]) {
    return { baseUrl: args[urlIdx + 1].replace(/\/$/, '') };
  }
  return { baseUrl: DEFAULT_BASE_URL.replace(/\/$/, '') };
}

async function main(): Promise<void> {
  const { baseUrl } = parseArgs();
  console.log(`\n🔍 Smoke test contra ${baseUrl}\n`);

  const results = await Promise.all(CHECKS.map((c) => runCheck(baseUrl, c)));

  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    const label = r.ok ? 'OK' : 'FAIL';
    const time = `${r.durationMs}ms`.padStart(6);
    console.log(`  ${icon} [${label}] ${time}  ${r.name}`);
    if (!r.ok) {
      console.log(`           ${r.detail}`);
      failed += 1;
    }
  }

  const totalTime = results.reduce((acc, r) => acc + r.durationMs, 0);
  console.log(`\n${failed === 0 ? '✓' : '✗'} ${results.length - failed}/${results.length} checks pasaron (${totalTime}ms)\n`);

  if (failed > 0) {
    console.error(`❌ ${failed} chequeo(s) fallaron. Considerá rollback inmediato.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal en smoke test:', err);
  process.exit(1);
});
