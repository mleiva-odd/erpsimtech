import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { logStockMovementInline, getCurrentCost } from '@/lib/inventory';

/**
 * POST /api/sales/:saleId/cancel-order
 *
 * Cancela un pedido (ORDER → CANCELLED) o un pedido parcialmente despachado
 * (PARTIALLY_DELIVERED → CANCELLED). Acciones:
 *   - Libera todas las StockReservation activas (releasedAt=now).
 *   - Reincorpora a stock cualquier mercadería ya despachada vía DeliveryNote
 *     (loggea StockMovement RETURN_FROM_CUSTOMER).
 *   - Marca DeliveryNote como CANCELLED.
 *   - NO genera asiento (no había ingreso registrado todavía).
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
      include: {
        items: true,
        deliveryNotes: { include: { items: true } },
      },
    });
    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    const branchCheck = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    const st = String(sale.status);
    if (st !== 'ORDER' && st !== 'PARTIALLY_DELIVERED') {
      return NextResponse.json(
        { error: `Solo se cancelan pedidos en ORDER o PARTIALLY_DELIVERED (actual: ${st}).` },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Liberar reservas activas.
      await (tx as unknown as {
        stockReservation: { updateMany: (a: unknown) => Promise<unknown> };
      }).stockReservation.updateMany({
        where: { saleId: sale.id, releasedAt: null },
        data: { releasedAt: new Date(), reason: 'ORDER_CANCELLED' },
      });

      // 2. Reincorporar mercadería ya despachada (si hubo).
      const deliveryNotes = (sale as unknown as {
        deliveryNotes: Array<{
          id: string;
          status: string;
          items: Array<{ productId: string; variantId: string | null; quantity: number }>;
        }>;
      }).deliveryNotes;

      for (const dn of deliveryNotes) {
        if (dn.status === 'CANCELLED') continue;
        for (const dnIt of dn.items) {
          const variantWhere = dnIt.variantId
            ? { productId: dnIt.productId, branchId: sale.branchId, variantId: dnIt.variantId }
            : { productId: dnIt.productId, branchId: sale.branchId, variantId: null };
          await tx.productStock.updateMany({
            where: variantWhere,
            data: { quantity: { increment: dnIt.quantity } },
          });
          const unitCost = await getCurrentCost(tx, dnIt.productId, dnIt.variantId || null);
          await logStockMovementInline(tx, {
            companyId: tenant.companyId,
            productId: dnIt.productId,
            variantId: dnIt.variantId || null,
            branchId: sale.branchId,
            type: 'RETURN_FROM_CUSTOMER',
            quantity: dnIt.quantity,
            unitCost,
            referenceType: 'ORDER_CANCEL',
            referenceId: sale.id,
            userId: tenant.userId,
            notes: 'Cancelación de pedido — reincorporación',
          });
        }
        await tx.deliveryNote.update({
          where: { id: dn.id },
          data: { status: 'CANCELLED' },
        });
      }

      // 3. Marcar la venta como CANCELLED.
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'CANCELLED' } });
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_ORDER_CANCELLED',
      entity: 'Sale',
      entityId: sale.id,
      details: { from: st },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel order error:', error);
    const message = error instanceof Error ? error.message : 'Error al cancelar el pedido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
