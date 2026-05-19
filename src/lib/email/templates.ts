/**
 * Fase 31a · Templates HTML básicos para emails transaccionales.
 *
 * Diseño minimalista compatible con mayoría de clientes de email
 * (Outlook, Gmail, Apple Mail). Tablas + inline CSS, sin Tailwind.
 * Branding consistente con la app (azul slate, esquinas redondeadas).
 *
 * Cada template devuelve `{ subject, html, text, tag }` listo para pasar a
 * `sendEmail()`. El `text` plano se usa como fallback en clientes que no
 * renderizan HTML y mejora deliverability (Gmail penaliza HTML-only).
 *
 * NO incluir datos sensibles (passwords, tokens) en el `text` salvo
 * cuando sean el propósito mismo del email (link de reset).
 */

import type { EmailMessage } from './types';

const BRAND_BLUE = '#2563eb';
const BRAND_DARK = '#1e293b';
const BRAND_LIGHT = '#f8fafc';

/**
 * Wrapper común con header, contenido y footer. Genera HTML inline-styled
 * que sobrevive los CSS strippers de Gmail/Outlook.
 */
function wrap(opts: {
  preheader?: string;
  title: string;
  body: string;
  cta?: { label: string; url: string };
  footer?: string;
}): string {
  const { preheader = '', title, body, cta, footer = '' } = opts;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_LIGHT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_DARK};">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</span>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:600px;margin:0 auto;">
  <tr><td style="padding:32px 24px 8px 24px;">
    <div style="font-size:18px;font-weight:700;color:${BRAND_DARK};">SIMTECH ERP</div>
  </td></tr>
  <tr><td style="padding:8px 24px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:${BRAND_DARK};">${escapeHtml(title)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#334155;">${body}</div>
        ${cta ? `<div style="margin-top:24px;text-align:center;">
          <a href="${escapeAttr(cta.url)}" style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">${escapeHtml(cta.label)}</a>
        </div>` : ''}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 24px 32px 24px;font-size:12px;color:#94a3b8;text-align:center;">
    ${footer || `Este correo fue enviado por SIMTECH ERP. Si recibiste esto por error, podés ignorarlo.`}
  </td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Template: reset password. Link con token válido por X minutos.
 */
export function passwordResetTemplate(opts: {
  toName?: string;
  resetUrl: string;
  validForMinutes: number;
}): Pick<EmailMessage, 'subject' | 'html' | 'text' | 'tag'> {
  const subject = 'Restablecer tu contraseña · SIMTECH ERP';
  const greeting = opts.toName ? `Hola ${escapeHtml(opts.toName)},` : 'Hola,';
  const html = wrap({
    preheader: 'Link para restablecer tu contraseña, válido por unos minutos.',
    title: 'Restablecer tu contraseña',
    body: `<p>${greeting}</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Hacé clic en el botón de abajo para crear una nueva.</p>
<p style="color:#64748b;font-size:13px;">Este link es válido por <strong>${opts.validForMinutes} minutos</strong>. Si no fuiste vos, podés ignorar este correo — tu contraseña no cambiará.</p>`,
    cta: { label: 'Restablecer contraseña', url: opts.resetUrl },
    footer:
      'Por seguridad, este link expira pronto y solo funciona una vez.',
  });
  const text = `${opts.toName ? `Hola ${opts.toName},\n\n` : 'Hola,\n\n'}Para restablecer tu contraseña, abrí este link (válido por ${opts.validForMinutes} minutos):\n\n${opts.resetUrl}\n\nSi no fuiste vos, podés ignorar este correo.`;
  return { subject, html, text, tag: 'password-reset' };
}

/**
 * Template: notificación de planilla generada (al admin RH).
 */
export function payrollGeneratedTemplate(opts: {
  toName?: string;
  payrollName: string;
  employeeCount: number;
  totalNet: string; // ya formateado "Q 12,345.67"
  detailUrl: string;
}): Pick<EmailMessage, 'subject' | 'html' | 'text' | 'tag'> {
  const subject = `Planilla "${opts.payrollName}" generada · SIMTECH ERP`;
  const greeting = opts.toName ? `Hola ${escapeHtml(opts.toName)},` : 'Hola,';
  const html = wrap({
    preheader: `Planilla con ${opts.employeeCount} empleados procesados.`,
    title: 'Planilla generada exitosamente',
    body: `<p>${greeting}</p>
<p>La planilla <strong>${escapeHtml(opts.payrollName)}</strong> se generó correctamente.</p>
<table role="presentation" cellspacing="0" cellpadding="8" border="0" style="margin:16px 0;background:${BRAND_LIGHT};border-radius:8px;">
  <tr><td style="color:#64748b;font-size:13px;">Empleados procesados</td><td style="font-weight:600;">${opts.employeeCount}</td></tr>
  <tr><td style="color:#64748b;font-size:13px;">Total neto a pagar</td><td style="font-weight:600;">${escapeHtml(opts.totalNet)}</td></tr>
</table>
<p>Podés revisar el detalle, validar los pagos y descargar las boletas desde la plataforma.</p>`,
    cta: { label: 'Ver planilla', url: opts.detailUrl },
  });
  const text = `${opts.toName ? `Hola ${opts.toName},\n\n` : 'Hola,\n\n'}La planilla "${opts.payrollName}" se generó correctamente.\n\nEmpleados: ${opts.employeeCount}\nTotal neto: ${opts.totalNet}\n\nRevisar en: ${opts.detailUrl}`;
  return { subject, html, text, tag: 'payroll-generated' };
}

/**
 * Template: factura emitida (al cliente final). Adjunto = PDF (lo gestiona
 * el caller pasando el path/URL del PDF al provider — Resend soporta
 * adjuntos via API, pero esta capa de templates solo genera el cuerpo).
 */
export function invoiceSentTemplate(opts: {
  toName?: string;
  companyName: string;
  invoiceNumber: string;
  totalFormatted: string;
  downloadUrl?: string;
}): Pick<EmailMessage, 'subject' | 'html' | 'text' | 'tag'> {
  const subject = `Factura ${opts.invoiceNumber} de ${opts.companyName}`;
  const greeting = opts.toName ? `Estimado/a ${escapeHtml(opts.toName)},` : 'Estimado/a cliente,';
  const html = wrap({
    preheader: `Factura ${opts.invoiceNumber} por ${opts.totalFormatted}.`,
    title: `Factura ${escapeHtml(opts.invoiceNumber)}`,
    body: `<p>${greeting}</p>
<p>Le compartimos su factura electrónica de <strong>${escapeHtml(opts.companyName)}</strong>.</p>
<table role="presentation" cellspacing="0" cellpadding="8" border="0" style="margin:16px 0;background:${BRAND_LIGHT};border-radius:8px;">
  <tr><td style="color:#64748b;font-size:13px;">Número</td><td style="font-weight:600;">${escapeHtml(opts.invoiceNumber)}</td></tr>
  <tr><td style="color:#64748b;font-size:13px;">Total</td><td style="font-weight:600;">${escapeHtml(opts.totalFormatted)}</td></tr>
</table>
<p>Gracias por su preferencia.</p>`,
    cta: opts.downloadUrl
      ? { label: 'Descargar factura', url: opts.downloadUrl }
      : undefined,
    footer: `Factura electrónica emitida por ${escapeHtml(opts.companyName)} a través de SIMTECH ERP.`,
  });
  const text = `${opts.toName ? `Estimado/a ${opts.toName},\n\n` : 'Estimado/a cliente,\n\n'}Le compartimos su factura electrónica de ${opts.companyName}.\n\nNúmero: ${opts.invoiceNumber}\nTotal: ${opts.totalFormatted}${opts.downloadUrl ? `\n\nDescargar: ${opts.downloadUrl}` : ''}\n\nGracias por su preferencia.`;
  return { subject, html, text, tag: 'invoice-sent' };
}
