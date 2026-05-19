/**
 * Fase 31a · Provider Console (default cuando no hay credenciales).
 *
 * No envía nada real — loguea el email y retorna un ID determinístico.
 * Útil para:
 *   - Dev local sin contratar proveedor.
 *   - Tests (verificable con spy).
 *   - CI sin acceso a secretos.
 *
 * Cuando el dueño contrata Resend (o cualquier otro), configura las env
 * vars y la fábrica en `index.ts` cambia automáticamente al provider real.
 */

import { logger } from '@/lib/logger';
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './types';

function formatAddress(
  addr: EmailMessage['to'] | EmailMessage['from'] | EmailMessage['replyTo'],
): string {
  if (!addr) return '';
  const arr = Array.isArray(addr) ? addr : [addr];
  return arr
    .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
    .join(', ');
}

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logger.info('[email:console] (no envío real) email simulado', {
      provider: this.name,
      to: formatAddress(message.to),
      from: formatAddress(message.from) || '(default)',
      subject: message.subject,
      tag: message.tag,
      hasHtml: Boolean(message.html),
      hasText: Boolean(message.text),
      id,
    });

    return { id, provider: this.name };
  }
}
