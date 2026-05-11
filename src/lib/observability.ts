/**
 * Capa de observabilidad opt-in.
 *
 * Estado: STUB. No reporta a ningún servicio externo a menos que estén
 * configuradas las variables de entorno correspondientes.
 *
 * Activación de Sentry (cuando tengas cuenta y DSN):
 *   1. `npm install @sentry/nextjs`
 *   2. Agregar `SENTRY_DSN` a Vercel env vars.
 *   3. Reemplazar `captureException` y `captureMessage` aquí por las
 *      versiones de @sentry/nextjs.
 *   4. Crear sentry.client.config.ts y sentry.server.config.ts según
 *      docs.sentry.io/platforms/javascript/guides/nextjs.
 *
 * Mientras tanto, la app loguea a console (visible en Vercel logs).
 * Esta capa permite que el código de producción ya use captureException
 * sin atarse a Sentry desde el día 1.
 */

import { logger } from '@/lib/logger';

const SENTRY_ENABLED = !!process.env.SENTRY_DSN;

/**
 * Reporta una excepción a la capa de observabilidad.
 * Hoy: log estructurado. Mañana: Sentry.
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

  // TODO Sprint 6 final: cuando se instale @sentry/nextjs:
  //   import * as Sentry from '@sentry/nextjs';
  //   if (SENTRY_ENABLED) Sentry.captureException(error, { extra: context });
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

  // TODO Sprint 6 final:
  //   if (SENTRY_ENABLED) Sentry.captureMessage(message, level);
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
