import type { Metadata } from 'next';

/**
 * Fase 32 · Página de Soporte público (links de contacto, FAQ básico).
 *
 * Página accesible sin auth. Útil cuando un cliente no puede acceder a su
 * cuenta o tiene preguntas pre-venta.
 */

import Link from 'next/link';
import { Mail, MessageSquare, Phone, Clock, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Soporte · SIMTECH ERP',
  description: 'Canales de soporte, horarios de atención y preguntas frecuentes.',
};

export default function SupportPage() {
  return (
    <>
      <h1>Centro de Soporte</h1>
      <p>
        Estamos para ayudarte. Elegí el canal que prefieras según la urgencia de tu consulta.
      </p>

      <div className="not-prose grid sm:grid-cols-2 gap-4 my-8">
        <a
          href="mailto:soporte@simtechgt.com"
          className="block bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-md transition"
        >
          <Mail className="w-6 h-6 text-blue-600 mb-3" />
          <h3 className="font-bold text-slate-800 mb-1">Correo electrónico</h3>
          <p className="text-sm text-slate-600 mb-2">Respuesta en 24 horas hábiles.</p>
          <p className="text-sm font-medium text-blue-600">soporte@simtechgt.com</p>
        </a>

        <a
          href="https://wa.me/[NUMERO_WHATSAPP]"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white rounded-2xl border border-slate-200 p-6 hover:border-emerald-300 hover:shadow-md transition"
        >
          <MessageSquare className="w-6 h-6 text-emerald-600 mb-3" />
          <h3 className="font-bold text-slate-800 mb-1">WhatsApp</h3>
          <p className="text-sm text-slate-600 mb-2">Respuesta en horario laboral.</p>
          <p className="text-sm font-medium text-emerald-600">[CONFIGURAR NÚMERO]</p>
        </a>

        <a
          href="tel:[NUMERO_TELEFONO]"
          className="block bg-white rounded-2xl border border-slate-200 p-6 hover:border-purple-300 hover:shadow-md transition"
        >
          <Phone className="w-6 h-6 text-purple-600 mb-3" />
          <h3 className="font-bold text-slate-800 mb-1">Teléfono</h3>
          <p className="text-sm text-slate-600 mb-2">Solo emergencias críticas.</p>
          <p className="text-sm font-medium text-purple-600">[CONFIGURAR NÚMERO]</p>
        </a>

        <div className="block bg-white rounded-2xl border border-slate-200 p-6">
          <Clock className="w-6 h-6 text-slate-600 mb-3" />
          <h3 className="font-bold text-slate-800 mb-1">Horarios de atención</h3>
          <p className="text-sm text-slate-600">Lunes a Viernes</p>
          <p className="text-sm text-slate-600">08:00 — 18:00 GMT-6</p>
        </div>
      </div>

      <h2>Preguntas Frecuentes</h2>

      <h3>No puedo acceder a mi cuenta</h3>
      <p>
        Si olvidaste tu contraseña, escribinos a soporte y reseteamos tu acceso en menos
        de 4 horas hábiles. Si tu cuenta fue suspendida por falta de pago, una vez
        regularizada se reactiva automáticamente.
      </p>

      <h3>El sistema está lento o no responde</h3>
      <p>
        Verificá nuestro estado de servicio en <Link href="/api/health">/api/health</Link>.
        Si recibís un código distinto a 200, hay una incidencia. Avisanos de inmediato
        por WhatsApp para escalación urgente.
      </p>

      <h3>Mi factura electrónica fue rechazada por SAT</h3>
      <p>
        El rechazo puede ser por: NIT del receptor inválido, datos del emisor desactualizados,
        autorización SAT vencida, o problema temporal del certificador. Revisá el mensaje
        del error en el detalle de la venta. Si persiste, contactanos con el UUID del
        documento.
      </p>

      <h3>¿Puedo exportar mis datos?</h3>
      <p>
        Sí, en cualquier momento. Desde Reportes podés descargar CSVs de ventas, compras,
        inventario, contabilidad y empleados. Para una exportación completa de la base de
        datos (formato SQL), escribinos a soporte.
      </p>

      <h3>¿Qué sucede si dejo de pagar?</h3>
      <p>
        Te enviamos recordatorios 7 días antes del vencimiento. Tras 15 días sin pago,
        el acceso se suspende temporalmente. Tras 30 días, el acceso se cancela pero
        tus datos se conservan 60 días adicionales por si querés reactivar.
      </p>

      <div className="not-prose bg-amber-50 border border-amber-200 rounded-2xl p-6 my-8 flex gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
        <div className="text-sm text-amber-900">
          <p className="font-bold mb-1">¿Encontraste un problema crítico?</p>
          <p>
            Si detectás un bug que afecta tu operación (pérdida de datos, factura mal
            calculada, error contable), contactanos por <strong>WhatsApp inmediatamente</strong>
            con captura de pantalla. Priorizamos respuesta en menos de 1 hora hábil.
          </p>
        </div>
      </div>
    </>
  );
}
