/**
 * Fase 31a · Provider Resend.
 *
 * Implementación con el SDK oficial de Resend importado estáticamente.
 * El package `resend` es una dependencia obligatoria del proyecto desde
 * que se contrató el servicio (Fase 31b · activación real).
 *
 * Solo se INSTANCIA si `RESEND_API_KEY` y `EMAIL_FROM` están seteadas.
 * Si las env vars no están, el factory en `index.ts` cae al
 * ConsoleEmailProvider y este archivo nunca se ejecuta.
 *
 * Por qué Resend (vs SendGrid / Postmark / SES):
 *   - DX simple, API REST sencilla, free tier 100/día y 3000/mes.
 *   - Aceptable para arranque comercial GT — cuando se supere el tier
 *     se evalúa migración (la interfaz EmailProvider lo permite sin
 *     tocar código de negocio).
 *
 * IMPORTANTE: para usar en producción se debe verificar el dominio
 * remitente en Resend (DKIM/SPF) — si no, los emails caen en spam.
 */

import { Resend } from 'resend';
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './types';

function formatAddress(
  addr: EmailMessage['to'] | EmailMessage['from'] | EmailMessage['replyTo'],
): string | string[] | undefined {
  if (!addr) return undefined;
  const arr = Array.isArray(addr) ? addr : [addr];
  const formatted = arr.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email));
  return arr.length === 1 ? formatted[0] : formatted;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private client: Resend;
  private defaultFrom: string;

  /**
   * @throws Error si la API key o el from default están ausentes.
   */
  constructor(apiKey: string, defaultFrom: string) {
    if (!apiKey) throw new Error('ResendEmailProvider: RESEND_API_KEY ausente');
    if (!defaultFrom)
      throw new Error('ResendEmailProvider: EMAIL_FROM ausente (default sender)');

    this.client = new Resend(apiKey);
    this.defaultFrom = defaultFrom;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const to = formatAddress(message.to);
    if (!to) throw new Error('ResendEmailProvider: destinatario vacío');

    if (!message.html && !message.text) {
      throw new Error('ResendEmailProvider: se requiere html o text en el mensaje');
    }

    const from = formatAddress(message.from) ?? this.defaultFrom;
    const fromStr = Array.isArray(from) ? from[0] : from;

    const reply = formatAddress(message.replyTo);
    const replyStr = Array.isArray(reply) ? reply[0] : reply;

    // Resend acepta html xor text (al menos uno). Como el union type de
    // `CreateEmailOptions` requiere una variant específica, armamos el
    // payload de forma laxa y casteamos — TS no infiere bien el union.
    const payload: Record<string, unknown> = {
      from: fromStr,
      to,
      subject: message.subject,
    };
    if (message.html) payload.html = message.html;
    if (message.text) payload.text = message.text;
    if (replyStr) payload.replyTo = replyStr;
    if (message.tag) payload.tags = [{ name: 'tag', value: message.tag }];

    const result = await this.client.emails.send(
      payload as unknown as Parameters<Resend['emails']['send']>[0],
    );

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
    if (!result.data?.id) {
      throw new Error('Resend: respuesta sin ID');
    }
    return { id: result.data.id, provider: this.name };
  }
}
