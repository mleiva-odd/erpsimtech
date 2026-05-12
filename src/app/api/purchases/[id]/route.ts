import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { reverseJournalEntry } from '@/lib/accounting';
import { handleApiError, ApiError } from '@/lib/api-error';

/**
 * GET — detalle de una orden de compra individual.
 * Útil para drilling desde el listado.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const purchase = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        supplier: { select: { id: true, name: true, nit: true, phone: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    if (!purchase) {
      throw new ApiError(404, 'Orden de compra no encontrada');
    }

    return NextResponse.json(purchase);
  } catch (error) {
    return handleApiError(error, '/api/purchases/[id] GET');
  }
}

const PatchSchema = z.object({
  action: z.enum(['CANCEL']),
  reason: z.string().trim().max(500).optional(),
});

/**
 * PATCH — anular una orden de compra completada.
 * Reversa el stock incorporado, marca como CANCELLED y elimina el Payable.
 *
 * Reglas:
 * - Solo se anula si está COMPLETED.
 * - El stock debe seguir siendo suficiente para revertir (si ya se vendió todo
 *   el stock incorporado, la anulación generaría stock negativo y se rechaza).
 * - Si ya hubo pagos al proveedor (SupplierPayment), no se permite anular —
 *   primero hay que reversar los pagos manualmente.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['purchases:create', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, reason } = PatchSchema.parse(body);

    if (action !== 'CANCEL') {
      throw new ApiError(400, 'Acción no soportada');
    }

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        items: true,
        payable: {
          include: { payments: { where: { status: 'COMPLETED' }, select: { id: true } } },
        },
      },
    });

    if (!po) throw new ApiError(404, 'Orden de compra no encontrada');
    if (po.status === 'CANCELLED') {
      throw new ApiError(400, 'La orden ya está anulada');
    }
    if (po.status !== 'COMPLETED') {
      throw new ApiError(400, `Solo se pueden anular órdenes COMPLETED (estado actual: ${po.status})`);
    }

    if (po.payable && po.payable.payments.length > 0) {
      throw new ApiError(
        409,
        'La orden tiene pagos al proveedor registrados. Anulalos primero antes de cancelar la compra.',
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Reversar stock — pero solo si hay suficiente disponible.
      // Si vendieron parte del stock recibido en esta compra, no podemos
      // dejar stock negativo: el handler debe abortar.
      for (const item of po.items) {
        const stockUpdate = await tx.productStock.updateMany({
          where: {
            productId: item.productId,
            variantId: item.variantId ?? null,
            branchId: po.branchId,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity } },
        });

        if (stockUpdate.count !== 1) {
          throw new ApiError(
            409,
            'No se puede anular: parte del stock recibido en esta compra ya fue vendido o trasladado. ' +
              'Generaría stock negativo. Revisá movimientos antes de anular.',
          );
        }
      }

      // 2. Borrar Payable asociado (no hay pagos, ya validado arriba).
      if (po.payable) {
        await tx.supplierPayable.delete({
          where: { id: po.payable.id, companyId: tenant.companyId },
        });
      }

      // 3. Marcar PO como CANCELLED.
      await tx.purchaseOrder.update({
        where: { id: po.id, companyId: tenant.companyId },
        data: { status: 'CANCELLED' },
      });

      // 4. Asiento contrario (partida doble): buscamos el JournalEntry de la
      // compra original y lo reversamos (mismas cuentas, signos invertidos).
      // Si no hay asiento previo (compra legacy sin migrar), continuamos sin
      // abortar — el script de migración cubre datos históricos.
      const originalEntry = await tx.journalEntry.findFirst({
        where: {
          companyId: tenant.companyId,
          referenceType: 'PURCHASE',
          referenceId: po.id,
        },
        include: { reversedBy: { select: { id: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (originalEntry && originalEntry.reversedBy.length === 0) {
        await reverseJournalEntry(tx, originalEntry.id, {
          companyId: tenant.companyId,
          userId: tenant.userId,
          description: `Anulación de Compra #${po.id.split('-')[0].toUpperCase()}${reason ? ` — ${reason}` : ''}`,
          referenceType: 'PURCHASE_CANCEL',
          referenceId: po.id,
        });
      }
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_CANCELLED',
      entity: 'PurchaseOrder',
      entityId: po.id,
      details: { reason: reason || null, total: Number(po.total), items: po.items.length },
    });

    return NextResponse.json({ success: true, message: 'Orden de compra anulada y stock reversado.' });
  } catch (error) {
    return handleApiError(error, '/api/purchases/[id] PATCH');
  }
}
