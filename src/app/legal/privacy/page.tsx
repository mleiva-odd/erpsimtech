import type { Metadata } from 'next';

/**
 * Fase 32 · Política de Privacidad de SIMTECH ERP.
 *
 * Template GENÉRICO basado en buenas prácticas de protección de datos en
 * Guatemala (Ley de Acceso a la Información Pública, Decreto 57-2008) y
 * estándares internacionales (GDPR, CCPA referenciales).
 *
 * REQUIERE REVISIÓN LEGAL antes de uso comercial. Ajustar según los
 * servicios de terceros que efectivamente uses (Supabase, Vercel, Sentry,
 * proveedor FEL, etc.) y los datos que recolectes.
 */

export const metadata: Metadata = {
  title: 'Política de Privacidad · SIMTECH ERP',
  description: 'Cómo SIMTECH ERP maneja, protege y comparte los datos de sus clientes.',
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de Privacidad</h1>
      <p className="text-sm text-slate-500">
        <strong>Última actualización:</strong> Mayo 2026 · Versión 1.0
      </p>

      <p>
        En <strong>SIMTECH ERP</strong> nos comprometemos a proteger la privacidad y
        confidencialidad de los datos de nuestros clientes. Esta Política de Privacidad
        describe qué información recolectamos, cómo la utilizamos, con quién la
        compartimos y qué derechos tiene usted sobre sus datos.
      </p>

      <h2>1. Responsable del Tratamiento</h2>
      <p>
        El responsable del tratamiento de datos es <strong>[NOMBRE LEGAL DE TU EMPRESA]</strong>,
        con domicilio en <strong>[DIRECCIÓN GUATEMALA]</strong>, NIT <strong>[NIT]</strong>,
        contacto: <strong>[EMAIL DE PRIVACIDAD]</strong>.
      </p>

      <h2>2. Datos que Recolectamos</h2>

      <h3>2.1 Datos de Registro</h3>
      <ul>
        <li>Nombre y apellidos del usuario administrador.</li>
        <li>Correo electrónico (sirve también como identificador de cuenta).</li>
        <li>Nombre comercial, NIT y dirección de la empresa.</li>
        <li>Teléfono de contacto.</li>
        <li>Contraseña (almacenada con hash bcrypt; nunca en texto plano).</li>
      </ul>

      <h3>2.2 Datos Operativos (ingresados por el Cliente)</h3>
      <ul>
        <li>Productos, inventarios, precios.</li>
        <li>Clientes finales del Cliente (nombre, NIT, dirección, email, teléfono).</li>
        <li>Empleados (nombre, DPI, NIT, salario, dirección, datos bancarios).</li>
        <li>Ventas, compras, cotizaciones, facturas.</li>
        <li>Asientos contables, reportes tributarios.</li>
      </ul>
      <p>
        Estos datos son propiedad del Cliente y se almacenan únicamente para que el
        Cliente pueda utilizarlos en su operación.
      </p>

      <h3>2.3 Datos Técnicos (automáticos)</h3>
      <ul>
        <li>Dirección IP, navegador, dispositivo, sistema operativo (con fines de seguridad y soporte).</li>
        <li>Logs de auditoría: quién hizo qué cambio, cuándo, desde qué IP.</li>
        <li>Cookies de sesión (NextAuth) para mantener al usuario autenticado.</li>
      </ul>

      <h2>3. Cómo Utilizamos sus Datos</h2>
      <p>
        Utilizamos sus datos exclusivamente para:
      </p>
      <ul>
        <li>Proveer el Servicio contratado (gestión empresarial, FEL, reportes).</li>
        <li>Comunicarnos con usted sobre el Servicio (notificaciones, soporte, facturación).</li>
        <li>Cumplir obligaciones legales (auditoría, requerimientos de SAT u otra autoridad).</li>
        <li>Mejorar el Servicio (análisis agregado y anónimo de uso; nunca con datos identificables sin su consentimiento).</li>
        <li>Prevenir fraude y proteger la integridad de la plataforma.</li>
      </ul>
      <p>
        <strong>NO utilizamos sus datos para:</strong>
      </p>
      <ul>
        <li>Venderlos a terceros con fines comerciales.</li>
        <li>Compartirlos con anunciantes.</li>
        <li>Entrenar modelos de IA propios o de terceros.</li>
      </ul>

      <h2>4. Con Quién Compartimos sus Datos</h2>
      <p>
        Compartimos datos únicamente con proveedores estrictamente necesarios para
        operar el Servicio, todos bajo contrato de confidencialidad y procesamiento de datos:
      </p>
      <ul>
        <li><strong>Vercel Inc. (Estados Unidos)</strong> — hosting de la aplicación web.</li>
        <li><strong>Supabase Inc. (Estados Unidos)</strong> — base de datos y almacenamiento de archivos.</li>
        <li><strong>[Proveedor FEL: Infile/Digifact]</strong> — certificación de facturas electrónicas ante SAT.</li>
        <li><strong>Sentry (opcional, EEUU)</strong> — monitoreo de errores técnicos. Recolecta solo metadatos de errores; nunca datos comerciales del Cliente.</li>
      </ul>
      <p>
        Estos proveedores están sujetos a sus propias políticas de privacidad y cumplen
        con estándares internacionales (SOC 2, GDPR, ISO 27001).
      </p>

      <h2>5. Almacenamiento y Seguridad</h2>
      <p>
        Sus datos se almacenan en servidores cifrados (TLS 1.3 en tránsito,
        AES-256 en reposo) ubicados en centros de datos de proveedores con
        certificación SOC 2. Implementamos:
      </p>
      <ul>
        <li>Autenticación con contraseñas fuertes obligatorias (12+ caracteres, mayúscula, minúscula, dígito, símbolo).</li>
        <li>Hashing de contraseñas con bcrypt (rounds estándar).</li>
        <li>Aislamiento multi-tenant en base de datos (cada empresa ve solo sus datos).</li>
        <li>Logs de auditoría inmutables (toda acción crítica queda registrada).</li>
        <li>Respaldos automáticos diarios con retención de 30 días.</li>
        <li>Rate limiting para prevenir ataques de fuerza bruta.</li>
      </ul>

      <h2>6. Conservación de Datos</h2>
      <p>
        Conservamos sus datos mientras el contrato esté vigente. Al terminar:
      </p>
      <ul>
        <li><strong>60 días</strong>: el Cliente puede solicitar una exportación completa de sus datos en formato CSV/JSON.</li>
        <li><strong>Después de 60 días</strong>: los datos se eliminan permanentemente, EXCEPTO los que la legislación tributaria guatemalteca obliga a conservar (libros contables, facturas) por hasta <strong>4 años</strong>.</li>
      </ul>

      <h2>7. Sus Derechos</h2>
      <p>
        Como titular de los datos, usted tiene derecho a:
      </p>
      <ul>
        <li><strong>Acceder</strong> a sus datos en cualquier momento desde la plataforma.</li>
        <li><strong>Corregir</strong> datos inexactos editándolos directamente o solicitándolo a soporte.</li>
        <li><strong>Exportar</strong> sus datos en formato estándar.</li>
        <li><strong>Eliminar</strong> sus datos al terminar el contrato (sujeto a obligaciones legales de conservación).</li>
        <li><strong>Oponerse</strong> al uso de datos para fines no esenciales (analytics agregados).</li>
      </ul>
      <p>
        Para ejercer cualquiera de estos derechos, escribanos a <strong>[EMAIL DE PRIVACIDAD]</strong>.
        Respondemos en un plazo máximo de <strong>15 días hábiles</strong>.
      </p>

      <h2>8. Cookies y Tracking</h2>
      <p>
        Utilizamos únicamente cookies <strong>esenciales</strong> para el funcionamiento
        del Servicio (sesión NextAuth, preferencias de UI). NO utilizamos cookies de
        publicidad ni rastreo de terceros.
      </p>

      <h2>9. Menores de Edad</h2>
      <p>
        El Servicio está dirigido a empresas y profesionales adultos. NO recolectamos
        intencionalmente datos de menores de edad. Si detectamos una cuenta de un menor,
        la suspenderemos inmediatamente.
      </p>

      <h2>10. Transferencias Internacionales</h2>
      <p>
        Sus datos pueden ser procesados en servidores ubicados fuera de Guatemala
        (principalmente Estados Unidos), por nuestros proveedores cloud. Estos
        proveedores garantizan niveles de protección equivalentes a la legislación
        guatemalteca mediante cláusulas contractuales estándar.
      </p>

      <h2>11. Notificación de Brechas</h2>
      <p>
        En caso de una brecha de seguridad que afecte datos personales, notificaremos
        al Cliente afectado en un plazo máximo de <strong>72 horas</strong> desde que
        tomamos conocimiento, e informaremos las medidas correctivas tomadas.
      </p>

      <h2>12. Modificaciones a esta Política</h2>
      <p>
        Podemos actualizar esta Política periódicamente. Los cambios sustanciales se
        notificarán con al menos <strong>30 días de anticipación</strong> vía email.
      </p>

      <h2>13. Contacto</h2>
      <p>
        Para consultas sobre privacidad y protección de datos:
      </p>
      <ul>
        <li><strong>Correo electrónico:</strong> [EMAIL DE PRIVACIDAD]</li>
        <li><strong>Teléfono:</strong> [TELÉFONO]</li>
        <li><strong>Dirección:</strong> [DIRECCIÓN FÍSICA]</li>
      </ul>

      <hr className="my-10" />

      <p className="text-sm text-slate-500 italic">
        Esta política es una plantilla de referencia. Antes de uso comercial real,
        debe ser revisada por un abogado especializado en protección de datos en
        Guatemala, que la ajuste según los servicios de terceros utilizados y los
        compromisos específicos con clientes.
      </p>
    </>
  );
}
