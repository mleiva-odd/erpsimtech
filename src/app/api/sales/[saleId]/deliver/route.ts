import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { logStockMovementInline, getCurrentCost } from '@/lib/inventory';
import { reserveNoteNumber, assertTransition } from '@/lib/sales';
import { z } from 'zod';

const DeliverItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().positive(),
});

const DeliverSchema = z.object({
  items: z.array(DeliverItemSchema).min(1, 'Debes indicar al menos una línea'),
  recipientName: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * POST /api/sales/:saleId/deliver
 *
 * Despacho parcial o total de un ORDER. Crea una DeliveryNote, descuenta stock
 * real (StockMovement type=SALE) y libera las StockReservation correspondientes.
 * Avanza el estado de la venta:
 *   - Si todas las líneas se completaron → DELIVERED.
 *   - En otro caso → PARTIALLY_DELIVERED.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { saleId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = DeliverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { items, recipientName, address, phone, notes } = parsed.data;

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      include: {
        items: true,
        customer: { select: { name: true, address: true, phone: true } },
        deliveryNotes: { include: { items: true } },
      },
    });
    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

    const branchCheck = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    const status = String(sale.status);
    if (status !== 'ORDER' && status !== 'PARTIALLY_DELIVERED') {
      return NextResponse.json(
        { error: `Solo se puede despachar una venta en estado ORDER o PARTIALLY_DELIVERED (actual: ${status}).` },
        { status: 400 },
      );
    }

    // Calcular ya despachado por saleItem.
    const dispatchedMap = new Map<string, number>();
    for (const dn of (sale as unknown as { deliveryNotes: Array<{ items: Array<{ productId: string; variantId: string | null; quantity: number }> }> }).deliveryNotes) {
      for (const dnIt of dn.items) {
        // Asociamos por productId+variantId (no hay FK a saleItem en DeliveryNoteItem).
        const matching = sale.items.find(
          (si) => si.productId === dnIt.productId && (si.variantId || null) === (dnIt.variantId || null),
        );
        if (matching) {
          dispatchedMap.set(matching.id, (dispatchedMap.get(matching.id) ?? 0) + dnIt.quantity);
        }
      }
    }

    // Validar cada línea.
    const lineActions: Array<{
      saleItem: typeof sale.items[number];
      quantity: number;
    }> = [];
    for (const reqItem of items) {
      const si = sale.items.find((x) => x.id === reqItem.saleItemId);
      if (!si) {
        return NextResponse.json(
          { error: `Ítem ${reqItem.saleItemId} no pertenece a la venta.` },
          { status: 400 },
        );
      }
      const alreadyDispatched = dispatchedMap.get(si.id) ?? 0;
      const pending = si.quantity - alreadyDispatched;
      if (reqItem.quantity > pending) {
        return NextResponse.json(
          { error: `Excede pendiente de despacho (saleItem ${si.id}). Pendiente: ${pending}, solicitado: ${reqItem.quantity}.` },
          { status: 409 },
        );
      }
      lineActions.push({ saleItem: si, quantity: reqItem.quantity });
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const reserved = await reserveNoteNumber(tx, tenant.companyId);
      const cust = sale.customer as { name?: string; address?: string | null; phone?: string | null } | null;

      const dn = await tx.deliveryNote.create({
        data: {
          companyId: tenant.companyId,
          branchId: sale.branchId,
          saleId: sale.id,
          customerId: sale.customerId || null,
          userId: tenant.userId,
          noteNumber: reserved.noteNumber,
          recipientName: recipientName || cust?.name || 'Sin nombre',
          address: address || cust?.address || '-',
          phone: phone ?? cust?.phone ?? null,
          notes: notes ?? null,
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          items: {
            create: lineActions.map((la) => ({
              productId: la.saleItem.productId,
              variantId: la.saleItem.variantId || null,
              quantity: la.quantity,
            })),
          },
        },
        include: { items: true },
      });

      // Descontar stock real y registrar movimiento.
      for (const la of lineActions) {
        const si = la.saleItem;
        const variantWhere = si.variantId
          ? { productId: si.productId, branchId: sale.branchId, variantId: si.variantId, quantity: { gte: la.quantity } }
          : { productId: si.productId, branchId: sale.branchId, variantId: null, quantity: { gte: la.quantity } };
        const stockUpdate = await tx.productStock.updateMany({
          where: variantWhere,
          data: { quantity: { decrement: la.quantity } },
        });
        if (stockUpdate.count !== 1) {
          throw new Error(`Stock cambió durante el despacho (saleItem ${si.id}).`);
        }
        const unitCost = Number(si.unitCost ?? (await getCurrentCost(tx, si.productId, si.variantId || null)));
        await logStockMovementInline(tx, {
          companyId: tenant.companyId,
          productId: si.productId,
          variantId: si.variantId || null,
          branchId: sale.branchId,
          type: 'SALE',
          quantity: -la.quantity,
          unitCost,
          referenceType: 'DELIVERY_NOTE',
          referenceId: dn.id,
          userId: tenant.userId,
          notes: `Despacho ${reserved.noteNumber}`,
        });

        // Liberar StockReservation correspondiente (FIFO) hasta cubrir la cantidad.
        let remaining = la.quantity;
        const reservations = (await (tx as unknown as {
          stockReservation: {
            findMany: (a: unknown) => Promise<Array<{ id: string; quantity: unknown }>>;
          };
        }).stockReservation.findMany({
          where: {
            companyId: tenant.companyId,
            saleId: sale.id,
            productId: si.productId,
            variantId: si.variantId || null,
            branchId: sale.branchId,
            releasedAt: null,
          },
          orderBy: { reservedAt: 'asc' },
        })) as Array<{ id: string; quantity: unknown }>;
        for (const r of reservations) {
          if (remaining <= 0) break;
          const rQty = Number(r.quantity);
          if (rQty <= remaining) {
            await (tx as unknown as {
              stockReservation: { update: (a: unknown) => Promise<unknown> };
            }).stockReservation.update({
              where: { id: r.id },
              data: { releasedAt: new Date(), reason: 'DELIVERED' },
            });
            remaining -= rQty;
          } else {
            // split: marca esta cerrada parcial y crea una nueva con remanente.
            await (tx as unknown as {
              stockReservation: { update: (a: unknown) => Promise<unknown> };
            }).stockReservation.update({
              where: { id: r.id },
              data: { quantity: remaining, releasedAt: new Date(), reason: 'DELIVERED' },
            });
            await (tx as unknown as {
              stockReservation: { create: (a: unknown) => Promise<unknown> };
            }).stockReservation.create({
              data: {
                companyId: tenant.companyId,
                saleId: sale.id,
                productId: si.productId,
                variantId: si.variantId || null,
                branchId: sale.branchId,
                quantity: rQty - remaining,
                reason: 'ORDER_REMAINING',
              },
            });
            remaining = 0;
          }
        }
      }

      // Determinar nuevo estado.
      const newDispatchedMap = new Map(dispatchedMap);
      for (const la of lineActions) {
        newDispatchedMap.set(la.saleItem.id, (newDispatchedMap.get(la.saleItem.id) ?? 0) + la.quantity);
      }
      const allDelivered = sale.items.every(
        (si) => (newDispatchedMap.get(si.id) ?? 0) >= si.quantity,
      );
      const targetStatus = allDelivered ? 'DELIVERED' : 'PARTIALLY_DELIVERED';
      assertTransition(status as 'ORDER' | 'PARTIALLY_DELIVERED', targetStatus);
      await tx.sale.update({
        where: { id: sale.id },
        data: ({ status: targetStatus } as unknown) as never,
      });
      return { dn, targetStatus };
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_DELIVERED',
      entity: 'Sale',
      entityId: sale.id,
      details: { deliveryNoteId: txResult.dn.id, status: txResult.targetStatus },
    });

    return NextResponse.json({ success: true, deliveryNote: txResult.dn, status: txResult.targetStatus }, { status: 201 });
  } catch (error) {
    console.error('SALE deliver error:', error);
    const message = error instanceof Error ? error.message : 'Error al despachar';
    const status = message.toLowerCase().includes('stock') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
