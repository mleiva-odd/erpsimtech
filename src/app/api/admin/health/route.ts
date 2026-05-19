import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';
import { getEmailProvider } from '@/lib/email';
import { observability } from '@/lib/observability';

/**
 * GET /api/admin/health
 *
 * Health check DETALLADO solo para SUPER_ADMIN. A diferencia de /api/health
 * (que es público y devuelve solo "up/down"), este endpoint expone status
 * de cada subsistema y configuración para que el operador identifique
 * rápidamente qué falla.
 *
 * NUNCA expone valores de secrets — solo si están seteados (bool).
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CheckResult {
  ok: boolean;
  detail?: string;
  /** Latencia del check en milisegundos. */
  latencyMs?: number;
}

interface ConfigFlag {
  name: string;
  /** True si la env var está definida (no expone el valor). */
  set: boolean;
  /** Marca informativa, no afecta el ok del sistema. */
  note?: string;
}

interface HealthReport {
  ts: string;
  status: 'ok' | 'degraded' | 'error';
  deploy: {
    /** VERCEL_GIT_COMMIT_SHA si está disponible. */
    commit?: string;
    /** VERCEL_ENV ("production" | "preview" | "development") o NODE_ENV. */
    env: string;
    /** VERCEL_URL si disponible. */
    url?: string;
    /** Region de Vercel. */
    region?: string;
  };
  checks: {
    database: CheckResult;
    email: CheckResult;
    sentry: CheckResult;
  };
  config: ConfigFlag[];
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

function checkEmail(): CheckResult {
  try {
    const provider = getEmailProvider();
    const isReal = provider.name !== 'console';
    return {
      ok: true,
      detail: isReal
        ? `Activo: ${provider.name}`
        : 'Console (sin envío real — configurar RESEND_API_KEY + EMAIL_FROM)',
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

function checkSentry(): CheckResult {
  const enabled = observability.isEnabled();
  return {
    ok: true,
    detail: enabled
      ? 'Activo (SENTRY_DSN + production)'
      : 'Deshabilitado (faltan SENTRY_DSN o NODE_ENV != production)',
  };
}

function buildConfigReport(): ConfigFlag[] {
  const flags: ConfigFlag[] = [
    {
      name: 'DATABASE_URL',
      set: Boolean(process.env.DATABASE_URL),
      note: 'Requerida — conexión Prisma',
    },
    {
      name: 'NEXTAUTH_SECRET',
      set: Boolean(process.env.NEXTAUTH_SECRET),
      note: 'Requerida — firma de JWTs',
    },
    {
      name: 'NEXTAUTH_URL',
      set: Boolean(process.env.NEXTAUTH_URL),
      note: 'Requerida en prod — define dominio canónico',
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      note: 'Requerida si se usa Supabase Storage',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      note: 'Requerida server-side para Storage admin',
    },
    {
      name: 'SENTRY_DSN',
      set: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
      note: 'Opcional — sin DSN los errores solo van a logs',
    },
    {
      name: 'RESEND_API_KEY',
      set: Boolean(process.env.RESEND_API_KEY),
      note: 'Opcional — sin clave los emails solo se loguean',
    },
    {
      name: 'EMAIL_FROM',
      set: Boolean(process.env.EMAIL_FROM),
      note: 'Requerida si RESEND_API_KEY está activa',
    },
    {
      name: 'NEXT_PUBLIC_SITE_URL',
      set: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      note: 'Opcional — fallback a erp.simtechgt.com',
    },
  ];
  return flags;
}

export async function GET() {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  // Solo SUPER_ADMIN puede ver detalle operacional.
  if (tenant.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Solo SUPER_ADMIN puede acceder a este endpoint' },
      { status: 403 },
    );
  }

  try {
    const ts = new Date().toISOString();
    const database = await checkDatabase();
    const email = checkEmail();
    const sentry = checkSentry();

    const anyDown = !database.ok || !email.ok;
    const status: HealthReport['status'] = anyDown
      ? !database.ok
        ? 'error'
        : 'degraded'
      : 'ok';

    const report: HealthReport = {
      ts,
      status,
      deploy: {
        commit:
          process.env.VERCEL_GIT_COMMIT_SHA ??
          process.env.SENTRY_RELEASE ??
          undefined,
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        url: process.env.VERCEL_URL ?? undefined,
        region: process.env.VERCEL_REGION ?? undefined,
      },
      checks: { database, email, sentry },
      config: buildConfigReport(),
    };

    return NextResponse.json(report, {
      status: status === 'error' ? 503 : 200,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/health GET');
  }
}
