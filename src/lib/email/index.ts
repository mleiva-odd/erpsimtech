/**
 * Fase 31a · Punto de entrada de la capa de email.
 *
 * Patrón: el resto de la app importa `sendEmail` y no se entera de qué
 * proveedor está enviando. La fábrica resuelve provider una sola vez por
 * cold start (módulo cached) según env vars:
 *
 *   - RESEND_API_KEY + EMAIL_FROM → ResendEmailProvider
 *   - cualquier otro caso         → ConsoleEmailProvider (logs)
 *
 * Si Resend está configurado pero el package `resend` no está instalado
 * o la inicialización falla, caemos al ConsoleEmailProvider con warn.
 *
 * Uso típico:
 *
 *   import { sendEmail } from '@/lib/email';
 *   await sendEmail({
 *     to: { email: 'cliente@example.com' },
 *     subject: 'Tu factura está lista',
 *     html: '<p>...</p>',
 *     tag: 'invoice-sent',
 *   });
 */

import { captureException } from '@/lib/observability';
import { logger } from '@/lib/logger';
import { ConsoleEmailProvider } from './console-provider';
import { ResendEmailProvider } from './resend-provider';
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './types';

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM;

  if (apiKey && defaultFrom) {
    try {
      cached = new ResendEmailProvider(apiKey, defaultFrom);
      logger.info('[email] provider activo: resend', { from: defaultFrom });
      return cached;
    } catch (err) {
      // Cae al ConsoleEmailProvider. Logueamos UNA SOLA VEZ aquí (la caché
      // evita repetición).
      logger.warn('[email] Resend configurado pero falló init; uso console', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (apiKey || defaultFrom) {
    logger.warn(
      '[email] config incompleta — requiere RESEND_API_KEY y EMAIL_FROM. Uso console.',
    );
  }

  cached = new ConsoleEmailProvider();
  return cached;
}

/**
 * Envía un email usando el provider activo. NO lanza al caller:
 * captura el error en observability y lo loguea, devolviendo null.
 * El caller decide si tratar null como falla bloqueante o degradar.
 */
export async function sendEmail(
  message: EmailMessage,
): Promise<EmailSendResult | null> {
  const provider = getEmailProvider();
  try {
    const result = await provider.send(message);
    logger.info('[email] enviado', {
      provider: result.provider,
      id: result.id,
      tag: message.tag,
    });
    return result;
  } catch (err) {
    captureException(err, {
      module: 'email',
      provider: provider.name,
      tag: message.tag,
      subject: message.subject,
    });
    return null;
  }
}

/**
 * Variante que SÍ lanza si falla — para flujos donde la falla del email
 * debe romper la operación (ej: reset password, verificación de email).
 */
export async function sendEmailOrThrow(
  message: EmailMessage,
): Promise<EmailSendResult> {
  const provider = getEmailProvider();
  return provider.send(message);
}

// Re-export de tipos para que callers no tengan que conocer la estructura
// interna del módulo.
export type {
  EmailAddress,
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './types';

// Reset interno — solo para tests.
export function __resetEmailProviderCache(): void {
  cached = undefined;
}
