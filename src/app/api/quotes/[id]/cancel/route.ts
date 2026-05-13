import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';

/**
 * POST /api/quotes/:saleId/cancel
 *
 * Cancela una cotización (QUOTE → CANCELLED). No tiene side effects
 * contables ni de inventario (la QUOTE nunca generó ni stock ni asiento).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id: saleId } = await params;

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      select: { id: true, status: true, branchId: true },
    });
    if (!sale) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    const branchCheck = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    if (String(sale.status) !== 'QUOTE') {
      return NextResponse.json({ error: 'Solo se cancelan cotizaciones en estado QUOTE.' }, { status: 400 });
    }

    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: 'CANCELLED' },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_QUOTE_CANCELLED',
      entity: 'Sale',
      entityId: sale.id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al cancelar la cotización';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
