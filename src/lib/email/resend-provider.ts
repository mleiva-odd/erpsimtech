/**
 * Fase 31a · Provider Resend (lazy require).
 *
 * Solo se carga si `RESEND_API_KEY` está seteada Y el paquete `resend`
 * está instalado. Si alguno falla, throws en el constructor — la fábrica
 * en `index.ts` cae al ConsoleEmailProvider.
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

import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './types';

// Tipo mínimo del SDK de Resend — evita atarnos a su API.
interface ResendSDK {
  emails: {
    send(payload: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      reply_to?: string;
      tags?: Array<{ name: string; value: string }>;
    }): Promise<{ data?: { id: string } | null; error?: { message: string } | null }>;
  };
}

interface ResendModule {
  Resend: new (apiKey: string) => ResendSDK;
}

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
  private client: ResendSDK;
  private defaultFrom: string;

  /**
   * @throws Error si el package o la API key no están disponibles.
   */
  constructor(apiKey: string, defaultFrom: string) {
    if (!apiKey) throw new Error('ResendEmailProvider: RESEND_API_KEY ausente');
    if (!defaultFrom)
      throw new Error('ResendEmailProvider: EMAIL_FROM ausente (default sender)');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('resend') as ResendModule;
    this.client = new mod.Resend(apiKey);
    this.defaultFrom = defaultFrom;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const to = formatAddress(message.to);
    if (!to) throw new Error('ResendEmailProvider: destinatario vacío');

    const from = formatAddress(message.from) ?? this.defaultFrom;
    const fromStr = Array.isArray(from) ? from[0] : from;

    const reply = formatAddress(message.replyTo);
    const replyStr = Array.isArray(reply) ? reply[0] : reply;

    const result = await this.client.emails.send({
      from: fromStr,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: replyStr,
      tags: message.tag ? [{ name: 'tag', value: message.tag }] : undefined,
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
    if (!result.data?.id) {
      throw new Error('Resend: respuesta sin ID');
    }
    return { id: result.data.id, provider: this.name };
  }
}
