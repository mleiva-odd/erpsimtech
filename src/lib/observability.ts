/**
 * Capa de observabilidad.
 *
 * Estrategia:
 *   1. SIEMPRE loguea a consola (estructurado JSON en prod) — visible en
 *      Vercel logs aunque Sentry esté apagado.
 *   2. Si `SENTRY_DSN` (o `NEXT_PUBLIC_SENTRY_DSN`) está seteada Y el package
 *      `@sentry/nextjs` está instalado, además envía el evento a Sentry.
 *   3. Si Sentry no está disponible (DSN ausente o package no instalado),
 *      la app sigue funcionando sin errores — todo queda en logs.
 *
 * Por qué require dinámico:
 *   - El sandbox de tests / CI puede no tener `@sentry/nextjs` instalado.
 *   - En dev local sin DSN, evitamos cargar el SDK por nada.
 *   - El typecheck pasa gracias al shim en `src/types/sentry-nextjs.d.ts`.
 *
 * Wiring previo: sentry.client.config.ts / sentry.server.config.ts ya
 * llaman a `Sentry.init()` cuando NODE_ENV=production Y DSN presente.
 * Esta capa SOLO captura eventos, no inicializa.
 */

import { logger } from '@/lib/logger';

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENABLED =
  Boolean(SENTRY_DSN) && process.env.NODE_ENV === 'production';

// Cache del módulo `@sentry/nextjs` cargado lazily. `undefined` = aún no
// intentado, `null` = intentado y falló (no reintentar), objeto = listo.
type SentryModule = typeof import('@sentry/nextjs');
let sentryCache: SentryModule | null | undefined = undefined;

function getSentry(): SentryModule | null {
  if (!SENTRY_ENABLED) return null;
  if (sentryCache !== undefined) return sentryCache;

  try {
    // require dinámico — evita bundling estático en builds sin el package.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentryCache = require('@sentry/nextjs') as SentryModule;
  } catch {
    // Package no instalado. Logueamos una sola vez para que sea visible
    // en deploy logs y no por cada error.
    logger.warn(
      '[observability] SENTRY_DSN configurada pero @sentry/nextjs no está instalado. Eventos solo en logs.',
    );
    sentryCache = null;
  }
  return sentryCache;
}

/**
 * Reporta una excepción a la capa de observabilidad.
 * Siempre loguea; envía a Sentry si está disponible.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const message =
    error instanceof Error ? error.message : 'Non-Error exception captured';
  logger.error(message, {
    ...(context ?? {}),
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { value: String(error) },
    sentryEnabled: SENTRY_ENABLED,
  });

  const sentry = getSentry();
  if (sentry) {
    try {
      sentry.captureException(error, context ? { extra: context } : undefined);
    } catch (err) {
      // Falla del SDK no debe propagar al caller (defensivo).
      logger.warn('[observability] Sentry.captureException falló', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Reporta un evento informativo (no error) a la capa de observabilidad.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
): void {
  if (level === 'error') logger.error(message, context);
  else if (level === 'warning') logger.warn(message, context);
  else logger.info(message, context);

  const sentry = getSentry();
  if (sentry) {
    try {
      sentry.captureMessage(
        message,
        context ? { level, extra: context } : { level },
      );
    } catch (err) {
      logger.warn('[observability] Sentry.captureMessage falló', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Wrap a function con captura de errores. Útil para handlers asíncronos
 * en Next.js que de otro modo perderían el error si no se loguea.
 *
 *   const safeFn = withCapture(myAsyncFn, { feature: 'sales' });
 */
export function withCapture<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  context?: Record<string, unknown>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (error) {
      captureException(error, context);
      throw error;
    }
  };
}

export const observability = {
  captureException,
  captureMessage,
  withCapture,
  isEnabled: () => SENTRY_ENABLED,
};
