import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { assertTransition } from '@/lib/sales';

/**
 * POST /api/quotes/:saleId/accept
 *
 * Convierte una cotización (QUOTE) en pedido (ORDER). Reserva stock por línea
 * vía `StockReservation` — NO descuenta inventario real (eso pasa en /deliver).
 *
 * Valida:
 *  - sale.status === 'QUOTE'.
 *  - sale.expiresAt no haya pasado.
 *  - Stock disponible (físico - reservado) ≥ qty por línea.
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
      include: { items: true },
    });
    if (!sale) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    const branchCheck = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    const saleStatus = String(sale.status);
    if (saleStatus !== 'QUOTE') {
      return NextResponse.json(
        { error: `Solo se puede aceptar una cotización en estado QUOTE (actual: ${saleStatus}).` },
        { status: 400 },
      );
    }
    assertTransition('QUOTE', 'ORDER');

    const saleAny = sale as unknown as { expiresAt: Date | null };
    if (saleAny.expiresAt && new Date(saleAny.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'La cotización está expirada. Crea una nueva.', code: 'QUOTE_EXPIRED' },
        { status: 409 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Stock check (físico - reservas activas) por línea.
      for (const item of sale.items) {
        const stock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchId: sale.branchId,
            variantId: item.variantId || null,
          },
          select: { quantity: true },
        });
        const physical = Number(stock?.quantity ?? 0);
        const activeReservations = (await (tx as unknown as {
          stockReservation: { aggregate: (a: unknown) => Promise<{ _sum: { quantity: unknown } }> };
        }).stockReservation.aggregate({
          where: {
            companyId: tenant.companyId,
            productId: item.productId,
            branchId: sale.branchId,
            variantId: item.variantId || null,
            releasedAt: null,
          },
          _sum: { quantity: true },
        })) as { _sum: { quantity: unknown } };
        const reserved = Number(activeReservations._sum.quantity ?? 0);
        const available = physical - reserved;
        if (available < item.quantity) {
          throw new Error(
            `Stock insuficiente para reservar (línea producto ${item.productId}). Disponible neto: ${available}, requerido: ${item.quantity}.`,
          );
        }
      }

      // Crear reservas por línea.
      for (const item of sale.items) {
        await (tx as unknown as {
          stockReservation: { create: (a: unknown) => Promise<unknown> };
        }).stockReservation.create({
          data: {
            companyId: tenant.companyId,
            saleId: sale.id,
            productId: item.productId,
            variantId: item.variantId || null,
            branchId: sale.branchId,
            quantity: item.quantity,
            reason: 'ORDER_ACCEPT',
          },
        });
      }

      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: ({
          status: 'ORDER',
          acceptedAt: new Date(),
        } as unknown) as never,
      });
      return updatedSale;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_ORDER_ACCEPTED',
      entity: 'Sale',
      entityId: sale.id,
      details: { from: 'QUOTE', to: 'ORDER' },
    });

    return NextResponse.json({ success: true, sale: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al aceptar la cotización';
    const status = message.toLowerCase().includes('stock') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
