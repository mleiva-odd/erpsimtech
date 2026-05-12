import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/**
 * GET /api/reports/tax/iva-summary?period=YYYY-MM
 *
 * Resumen IVA débito (ventas) vs crédito (compras) del período.
 * Solo aplicable a régimen GENERAL — para Pequeño Contribuyente devolvemos
 * un resumen distinto (porque el 5% no es IVA débito recuperable).
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;

  const periodMatch = /^(\d{4})-(\d{2})$/.exec(period);
  if (!periodMatch) {
    return NextResponse.json({ error: 'Período inválido. Formato esperado YYYY-MM.' }, { status: 400 });
  }
  const year = Number(periodMatch[1]);
  const month = Number(periodMatch[2]);

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  try {
    const company = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
    })) as { taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null } | null;

    // Suma IVA débito (FACT CERTIFIED en período).
    const debitoAgg = await prisma.taxDocument.findMany({
      where: {
        companyId: tenant.companyId,
        status: 'CERTIFIED',
        type: 'FACT',
        fechaCertificacion: { gte: startDate, lt: endDate },
      },
      include: { sale: { select: { tax: true, subtotal: true } } },
    });

    let ivaDebito = 0;
    let ventasGravadas = 0;
    for (const d of debitoAgg) {
      ivaDebito += Number(d.sale?.tax ?? 0);
      ventasGravadas += Number(d.sale?.subtotal ?? 0);
    }

    // IVA crédito: por ahora 0 hasta Fase 19. Reportamos la estructura para
    // que la UI no se rompa.
    const ivaCredito = 0;

    const saldo = ivaDebito - ivaCredito;

    return NextResponse.json({
      period,
      taxRegime: company?.taxRegime ?? null,
      applicable: company?.taxRegime === 'GENERAL',
      ivaDebito,
      ivaCredito,
      saldo,
      ventasGravadas,
      note:
        company?.taxRegime === 'GENERAL'
          ? 'Régimen General: saldo positivo = IVA a pagar a SAT. Negativo = crédito a favor.'
          : 'Régimen Pequeño Contribuyente: el 5% NO es IVA recuperable. Este reporte solo aplica a régimen General.',
    });
  } catch (error) {
    console.error('IVA summary error:', error);
    return NextResponse.json({ error: 'Error al generar resumen IVA' }, { status: 500 });
  }
}
