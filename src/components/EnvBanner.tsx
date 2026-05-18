/**
 * Fase 26 · Banner de entorno (Staging / Preview).
 *
 * Se muestra ÚNICAMENTE cuando `NEXT_PUBLIC_ENV` != 'production'. Evita
 * confusiones del tipo "creí que estaba en prod" al operar en staging.
 *
 * Setup:
 *   - Producción (erp.simtechgt.com): NEXT_PUBLIC_ENV=production → no banner.
 *   - Staging/preview: NEXT_PUBLIC_ENV=staging → banner amarillo arriba.
 *   - Local dev: NEXT_PUBLIC_ENV no seteado → banner azul "LOCAL DEV".
 *
 * Configurar en Vercel → Project Settings → Environment Variables.
 */

const ENV = process.env.NEXT_PUBLIC_ENV ?? 'local';

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
