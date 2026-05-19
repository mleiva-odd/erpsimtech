import type { Metadata } from 'next';

/**
 * Fase 32 · Términos y Condiciones del servicio SIMTECH ERP.
 *
 * Template GENÉRICO basado en buenas prácticas de SaaS en Guatemala.
 * REQUIERE REVISIÓN LEGAL antes de uso comercial en producción real
 * (un abogado debe ajustar cláusulas según el tipo de contrato que ofrezcas
 * a tus clientes — mensual / anual / setup fee / SLA / penalidades).
 *
 * Última revisión: definir al firmar con abogado.
 */

export const metadata: Metadata = {
  title: 'Términos de Servicio · SIMTECH ERP',
  description: 'Términos y Condiciones de uso de la plataforma SIMTECH ERP.',
};

export default function TermsPage() {
  return (
    <>
      <h1>Términos y Condiciones de Servicio</h1>
      <p className="text-sm text-slate-500">
        <strong>Última actualización:</strong> Mayo 2026 · Versión 1.0
      </p>

      <p>
        Estos Términos y Condiciones (en adelante, &ldquo;Términos&rdquo;) regulan el uso de
        la plataforma <strong>SIMTECH ERP</strong> (en adelante, &ldquo;la Plataforma&rdquo;
        o &ldquo;el Servicio&rdquo;), provista por <strong>[NOMBRE LEGAL DE TU EMPRESA]</strong>
        (en adelante, &ldquo;SIMTECH&rdquo;), con domicilio en Guatemala. Al registrarse,
        acceder o utilizar la Plataforma, el cliente (en adelante, &ldquo;el Cliente&rdquo; o
        &ldquo;Usuario&rdquo;) acepta estos Términos en su totalidad.
      </p>

      <h2>1. Descripción del Servicio</h2>
      <p>
        SIMTECH ERP es una plataforma en la nube (Software as a Service) que ofrece
        herramientas de gestión empresarial para pequeñas y medianas empresas en Guatemala,
        incluyendo: punto de venta (POS), inventario, contabilidad, compras, ventas,
        recursos humanos, facturación electrónica (FEL) y reportes tributarios.
      </p>

      <h2>2. Registro y Cuenta</h2>
      <p>
        Para utilizar el Servicio, el Cliente debe registrar una cuenta proporcionando
        información veraz, completa y actualizada. El Cliente es responsable de mantener
        la confidencialidad de sus credenciales y de toda actividad realizada bajo su cuenta.
      </p>
      <p>
        SIMTECH se reserva el derecho de suspender o cancelar cuentas que proporcionen
        información falsa, violen estos Términos, o sean utilizadas para fines ilícitos.
      </p>

      <h2>3. Período de Prueba (Trial)</h2>
      <p>
        SIMTECH ofrece un período de prueba gratuito de <strong>30 días calendario</strong>
        desde la creación de la cuenta. Al finalizar el trial, el Cliente debe elegir un
        plan de pago para continuar utilizando el Servicio. La información ingresada durante
        el trial se conserva por <strong>90 días adicionales</strong> tras el vencimiento;
        después puede ser eliminada permanentemente.
      </p>

      <h2>4. Planes y Pagos</h2>
      <p>
        Los planes de pago, precios y modalidades de facturación están publicados en
        <em> [URL DE PRICING]</em>. SIMTECH se reserva el derecho de modificar precios
        con un aviso previo de <strong>30 días</strong> al Cliente.
      </p>
      <p>
        El pago se realiza mediante <strong>[transferencia bancaria / tarjeta /
        método específico]</strong> según el plan contratado. La falta de pago por más
        de <strong>15 días</strong> tras la fecha de vencimiento puede resultar en la
        suspensión del Servicio.
      </p>

      <h2>5. Uso Permitido</h2>
      <p>El Cliente se compromete a NO:</p>
      <ul>
        <li>Utilizar el Servicio para fines ilegales o no autorizados.</li>
        <li>Compartir credenciales de acceso con terceros ajenos a su empresa.</li>
        <li>Intentar acceder a datos de otros clientes (multi-tenant).</li>
        <li>Realizar ingeniería inversa, descompilar o copiar el software.</li>
        <li>Sobrecargar la infraestructura mediante consultas automatizadas no autorizadas.</li>
      </ul>

      <h2>6. Propiedad Intelectual</h2>
      <p>
        SIMTECH ERP, su código fuente, diseño, marcas y documentación son propiedad
        exclusiva de SIMTECH. El Cliente recibe únicamente una <strong>licencia limitada,
        no exclusiva, no transferible</strong> de uso durante la vigencia del contrato.
      </p>
      <p>
        Los datos ingresados por el Cliente (clientes, productos, ventas, facturas,
        empleados, etc.) son propiedad exclusiva del Cliente. SIMTECH NO los utiliza
        comercialmente ni los comparte con terceros, excepto cuando sea requerido por
        autoridad competente (SAT, orden judicial).
      </p>

      <h2>7. Facturación Electrónica (FEL)</h2>
      <p>
        SIMTECH se integra con certificadores autorizados por la SAT (Infile, Digifact,
        u otros) para la emisión de DTEs. La responsabilidad de:
      </p>
      <ul>
        <li>Contratar el servicio del certificador FEL (costo aparte).</li>
        <li>Registrar las series y autorizaciones en el portal SAT.</li>
        <li>Cumplir con las obligaciones tributarias declarativas.</li>
      </ul>
      <p>
        recae <strong>exclusivamente en el Cliente</strong>. SIMTECH facilita la
        herramienta de emisión, pero NO sustituye al contador del Cliente.
      </p>

      <h2>8. Disponibilidad del Servicio</h2>
      <p>
        SIMTECH se compromete a una disponibilidad objetivo del <strong>99.5% mensual</strong>,
        excluyendo: mantenimientos programados, fallas de terceros (proveedores cloud,
        certificadores FEL, redes de telecomunicaciones) y eventos de fuerza mayor.
      </p>
      <p>
        Los mantenimientos programados se anunciarán con al menos <strong>48 horas
        de anticipación</strong> y se realizarán fuera del horario laboral guatemalteco
        cuando sea posible.
      </p>

      <h2>9. Respaldo de Datos</h2>
      <p>
        SIMTECH realiza respaldos automáticos diarios de la base de datos del Cliente,
        con retención de <strong>30 días</strong>. El Cliente puede solicitar una
        exportación de sus datos en cualquier momento durante la vigencia del contrato.
      </p>
      <p>
        Al terminar el contrato, el Cliente tiene <strong>60 días</strong> para descargar
        sus datos. Posteriormente, SIMTECH eliminará los datos de forma permanente,
        salvo obligación legal de conservación (libros contables, facturas: <strong>4 años</strong>
        según legislación tributaria GT).
      </p>

      <h2>10. Limitación de Responsabilidad</h2>
      <p>
        SIMTECH NO será responsable por:
      </p>
      <ul>
        <li>Pérdidas indirectas, lucro cesante o daño consecuencial.</li>
        <li>Decisiones de negocio tomadas por el Cliente con base en reportes del Servicio.</li>
        <li>Multas o sanciones de SAT derivadas de errores u omisiones del Cliente en sus declaraciones.</li>
        <li>Pérdida de datos por causas atribuibles al Cliente (eliminación accidental, ataques de phishing al Cliente, etc.).</li>
      </ul>
      <p>
        La responsabilidad máxima de SIMTECH ante cualquier reclamo se limita al monto
        equivalente a <strong>3 meses de la cuota mensual</strong> del plan contratado.
      </p>

      <h2>11. Terminación</h2>
      <p>
        Cualquiera de las partes puede terminar el contrato con un aviso por escrito
        de <strong>30 días</strong>. SIMTECH puede terminar inmediatamente en casos de:
        violación grave de estos Términos, uso fraudulento, o falta de pago por más
        de 30 días.
      </p>

      <h2>12. Modificaciones a los Términos</h2>
      <p>
        SIMTECH puede modificar estos Términos con un aviso previo de <strong>30 días</strong>
        al Cliente vía correo electrónico. El uso continuado del Servicio después de la
        fecha de entrada en vigor constituye aceptación tácita de los nuevos Términos.
      </p>

      <h2>13. Ley Aplicable y Jurisdicción</h2>
      <p>
        Estos Términos se rigen por las leyes de la <strong>República de Guatemala</strong>.
        Cualquier controversia se resolverá ante los tribunales competentes de la
        Ciudad de Guatemala, renunciando las partes a cualquier otro fuero.
      </p>

      <h2>14. Contacto</h2>
      <p>
        Para consultas sobre estos Términos, contactanos en:
      </p>
      <ul>
        <li><strong>Correo electrónico:</strong> [EMAIL LEGAL DE TU EMPRESA]</li>
        <li><strong>Teléfono:</strong> [TELÉFONO]</li>
        <li><strong>Dirección:</strong> [DIRECCIÓN FÍSICA]</li>
      </ul>

      <hr className="my-10" />

      <p className="text-sm text-slate-500 italic">
        Estos términos son una plantilla de referencia. Para uso comercial con clientes
        reales, debe ser revisado y firmado por un abogado guatemalteco que adapte
        cláusulas específicas al modelo de negocio, planes ofrecidos, SLA y obligaciones
        regulatorias aplicables.
      </p>
    </>
  );
}
