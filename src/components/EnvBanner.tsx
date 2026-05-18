/**
 * Fase 26 · Banner de entorno (Staging / Preview).
 *
 * Se muestra ÚNICAMENTE cuando el entorno != 'production'. Evita
 * confusiones del tipo "creí que estaba en prod" al operar en staging.
 *
 * Resolución del entorno (en orden de prioridad):
 *   1. VERCEL_ENV (auto-seteado por Vercel: 'production' / 'preview' / 'development').
 *      Este es el SOURCE OF TRUTH cuando estamos en Vercel — no requiere
 *      configuración manual y siempre es correcto.
 *   2. NEXT_PUBLIC_ENV (manual override, útil para custom values como 'staging').
 *   3. Fallback 'local' (cuando estamos en dev local sin Vercel).
 *
 * NOTA: el componente es Server Component (no tiene 'use client') por eso
 * puede leer VERCEL_ENV (variable server-only). Si en el futuro se migra
 * a Client Component, hay que cambiar a NEXT_PUBLIC_VERCEL_ENV (Vercel
 * también la expone, pero requiere setup separado).
 */

const ENV =
  process.env.VERCEL_ENV ??
  process.env.NEXT_PUBLIC_ENV ??
  'local';

interface BannerConfig {
  label: string;
  bg: string;
  text: string;
}

const CONFIG: Record<string, BannerConfig | null> = {
  production: null,
  staging: { label: 'STAGING — datos de prueba, NO usar para operación real', bg: 'bg-amber-400', text: 'text-amber-950' },
  preview: { label: 'PREVIEW — branch de prueba', bg: 'bg-indigo-400', text: 'text-indigo-950' },
  local: { label: 'LOCAL DEV', bg: 'bg-blue-400', text: 'text-blue-950' },
};

export function EnvBanner() {
  const cfg = CONFIG[ENV] ?? CONFIG.local;
  if (!cfg) return null;
  return (
    <div
      role="status"
      aria-label={`Ambiente: ${cfg.label}`}
      className={`${cfg.bg} ${cfg.text} text-center text-xs font-bold py-1 px-3 tracking-wide`}
    >
      ⚠ {cfg.label}
    </div>
  );
}
