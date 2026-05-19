/**
 * Fase 31a · Tipos de la capa de email.
 *
 * Interfaz mínima que cualquier provider (Console, Resend, SendGrid, SES)
 * debe implementar. El resto de la app habla con esta interfaz y NO con
 * el SDK del proveedor — para poder cambiar de proveedor sin tocar
 * código de negocio.
 */

export interface EmailAddress {
  /** "Nombre Apellido" o vacío. */
  name?: string;
  /** Email válido. */
  email: string;
}

export interface EmailMessage {
  /** Destinatario(s). Mínimo uno. */
  to: EmailAddress | EmailAddress[];
  /** From explícito o usa el default del proveedor. */
  from?: EmailAddress;
  /** Reply-To opcional. */
  replyTo?: EmailAddress;
  /** Asunto en texto plano (UTF-8). */
  subject: string;
  /** Cuerpo HTML. Si solo hay text, se autogenera HTML básico. */
  html?: string;
  /** Cuerpo en texto plano (fallback para clientes que no renderizan HTML). */
  text?: string;
  /**
   * Tag opcional para analytics/agregación en el proveedor. Ej: "password-reset",
   * "payroll-generated", "invoice-sent".
   */
  tag?: string;
}

export interface EmailSendResult {
  /** ID retornado por el proveedor (o "mock-<uuid>" si es ConsoleProvider). */
  id: string;
  /** Nombre del proveedor que envió: "console" | "resend" | etc. */
  provider: string;
}

export interface EmailProvider {
  /** Identificador legible del proveedor. */
  readonly name: string;
  /** Envía un email. Lanza si falla — el caller decide si retry o tragar. */
  send(message: EmailMessage): Promise<EmailSendResult>;
}
