'use client';

/**
 * Fase 26 · Banner de entorno (Staging / Preview).
 *
 * Se muestra ÚNICAMENTE cuando NO estamos en producción. Evita confusiones
 * del tipo "creí que estaba en prod" al operar en staging.
 *
 * Resolución del entorno por HOSTNAME del navegador (100% confiable, no
 * depende de env vars que Vercel pueda fallar en inyectar):
 *   - erp.simtechgt.com           → production (sin banner)
 *   - *.vercel.app                → preview (banner indigo)
 *   - localhost / 127.0.0.1       → local (banner azul)
 *   - cualquier otro              → unknown (banner rojo, llamado a investigar)
 *
 * Si en el futuro hay un dominio de staging real, agregarlo al PRODUCTION_HOSTS.
 *
 * Renderiza null durante el primer paint (SSR) para evitar flash de banner
 * incorrecto. Después del mount en cliente, decide qué banner mostrar.
 */

import { useSyncExternalStore } from 'react';

const PRODUCTION_HOSTS = new Set<string>([
  'erp.simtechgt.com',
  // Agregar otros dominios de prod acá si se montan más.
]);

interface BannerConfig {
  label: string;
  bg: string;
  text: string;
}

function resolveConfig(hostname: string): BannerConfig | null {
  if (PRODUCTION_HOSTS.has(hostname)) return null;
  if (hostname.endsWith('.vercel.app')) {
    return { label: 'PREVIEW — branch de prueba', bg: 'bg-indigo-400', text: 'text-indigo-950' };
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
    return { label: 'LOCAL DEV', bg: 'bg-blue-400', text: 'text-blue-950' };
  }
  // Hostname desconocido — alertar para que se investigue.
  return { label: `AMBIENTE DESCONOCIDO (${hostname})`, bg: 'bg-rose-400', text: 'text-rose-950' };
}

/**
 * Hook que lee window.location.hostname vía useSyncExternalStore (React 18+).
 * Patrón idiomático para suscribirse a APIs externas (location, navigator)
 * sin disparar la regla react-hooks/set-state-in-effect.
 *
 * Server snapshot: string vacío → resolveConfig retorna 'AMBIENTE DESCONOCIDO'
 * en SSR. Para evitar flash, el componente checkea si el snapshot está vacío
 * y no muestra nada en ese caso.
 */
const subscribe = () => () => {
  /* location no emite eventos; no hace falta suscribirse a cambios. */
};

const getHostnameClient = (): string => {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
};

const getHostnameServer = (): string => '';

function useHostname(): string {
  return useSyncExternalStore(subscribe, getHostnameClient, getHostnameServer);
}

export function EnvBanner() {
  const hostname = useHostname();
  // Si todavía no hidratado (hostname vacío en SSR), no renderear nada.
  if (!hostname) return null;
  const cfg = resolveConfig(hostname);
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
