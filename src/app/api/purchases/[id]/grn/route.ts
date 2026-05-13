import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { recordStockMovement } from '@/lib/inventory';
import {
  nextStatusAfterReception,
  STATES_ACCEPTING_GRN,
  prorateLandedCost,
} from '@/lib/purchases';

/**
 * POST /api/purchases/[id]/grn
 *
 * Registra un Goods Received Note contra una PO. Soporta recepción parcial:
 * el caller indica qué items y qué cantidades de cada uno se reciben en este
 * GRN. La PO acumula `quantityReceived` por línea; al completar todas, la PO
 * pasa a RECEIVED. Si quedan items pendientes, queda PARTIALLY_RECEIVED.
 *
 * Stock se mueve VÍA recordStockMovement (Fase 15), aplicando WAC. El
 * `unitCost` del movimiento incorpora la parte proporcional del landed cost
 * de la PO.
 *
 * No genera asiento contable — el asiento se hace al SupplierInvoice.
 */
const GRNItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  quantityReceived: z.coerce.number().positive(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const CreateGRNSchema = z.object({
  receivedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(GRNItemSchema).min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:receive',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateGRNSchema.parse(body);

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: tenant.companyId },
      include: { items: true },
    });
    if (!po) throw new ApiError(404, 'PO no encontrada.');
    type POShape = {
      id: string;
      branchId: string;
      status: string;
      receivedAt: Date | null;
      landedCost: unknown;
      items: Array<{
        id: string;
        productId: string;
        variantId: string | null;
        quantity: unknown;
        unitCost: unknown;
        quantityReceived: unknown;
      }>;
    };
    const poTyped = po as unknown as POShape;
    if (!STATES_ACCEPTING_GRN.includes(poTyped.status as never)) {
      throw new ApiError(
        400,
        `No se puede recibir mercadería en estado ${po.status}. ` +
          'La PO debe estar APPROVED o PARTIALLY_RECEIVED.',
      );
    }

    // Mapear items POR id para validar y procesar el delta.
    const itemMap = new Map(poTyped.items.map((it) => [it.id, it]));
    for (const grnItem of parsed.items) {
      const poItem = itemMap.get(grnItem.purchaseOrderItemId);
      if (!poItem) {
        throw new ApiError(
          400,
          `Item ${grnItem.purchaseOrderItemId} no pertenece a esta PO.`,
        );
      }
      const remaining =
        Number(poItem.quantity) - Number(poItem.quantityReceived);
      if (grnItem.quantityReceived > remaining + 0.001) {
        throw new ApiError(
          400,
          `Cantidad recibida (${grnItem.quantityReceived}) excede lo pendiente (${remaining}) en item ${poItem.id}.`,
        );
      }
    }

    // Prorrateo landed cost sobre las LÍNEAS DE LA PO (no del GRN parcial).
    // El landed cost se distribuye sobre el valor total de la compra: cuando
    // hay GRN parcial, prorrateamos solo la fracción del landed cost que
    // corresponde a las cantidades del GRN actual (lo que físicamente entró).
    const totalLanded = Number(poTyped.landedCost ?? 0);
    const landedByItem = new Map<string, number>();
    if (totalLanded > 0) {
      const landedLines = poTyped.items.map((it) => ({
        key: it.id,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
      }));
      const prorated = prorateLandedCost(landedLines, totalLanded);
      for (const p of prorated) {
        // Landed cost POR UNIDAD que se asigna al stock real al recibir.
        // Si la línea total es N unidades y se reciben k, el landed cost
        // por unidad se mantiene constante (= p.landedShare / N).
        const poItem = itemMap.get(p.key)!;
        const totalQty = Number(poItem.quantity);
        const perUnit = totalQty > 0 ? p.landedShare / totalQty : 0;
        landedByItem.set(p.key, perUnit);
      }
    }

    const grn = await prisma.$transaction(async (tx) => {
      const created = await tx.goodsReceivedNote.create({
        data: {
          companyId: tenant.companyId,
          purchaseOrderId: poTyped.id,
          receivedById: tenant.userId,
          receivedAt: parsed.receivedAt ?? new Date(),
          notes: parsed.notes ?? null,
          items: {
            create: parsed.items.map((it) => {
              const poItem = itemMap.get(it.purchaseOrderItemId)!;
              const perUnitLanded = landedByItem.get(poItem.id) ?? 0;
              const adjustedUnitCost =
                Number(poItem.unitCost) + perUnitLanded;
              return {
                purchaseOrderItemId: poItem.id,
                quantityReceived: new PrismaNS.Decimal(it.quantityReceived),
                unitCost: new PrismaNS.Decimal(adjustedUnitCost),
                notes: it.notes ?? null,
              };
            }),
          },
        },
        include: { items: true },
      });

      // Stock movement por cada item del GRN. recordStockMovement aplica WAC.
      type CreatedGrnItem = {
        id: string;
        purchaseOrderItemId: string;
        quantityReceived: unknown;
        unitCost: unknown;
      };
      const createdItems = (created as { items: CreatedGrnItem[] }).items;
      for (const grnItem of createdItems) {
        const poItem = itemMap.get(grnItem.purchaseOrderItemId)!;
        await recordStockMovement(tx, {
          companyId: tenant.companyId,
          productId: poItem.productId,
          variantId: poItem.variantId,
          branchId: poTyped.branchId,
          type: 'PURCHASE',
          quantity: Number(grnItem.quantityReceived),
          unitCost: Number(grnItem.unitCost),
          referenceType: 'GRN',
          referenceId: created.id,
          userId: tenant.userId,
          date: (created as { receivedAt: Date }).receivedAt,
        });

        // Actualizar quantityReceived del PO item.
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            quantityReceived: {
              increment: new PrismaNS.Decimal(Number(grnItem.quantityReceived)),
            },
          } as never,
        });
      }

      // Recalcular status de la PO leyendo los items actualizados.
      const fresh = (await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: poTyped.id },
        select: { quantity: true, quantityReceived: true } as never,
      })) as unknown as Array<{ quantity: unknown; quantityReceived: unknown }>;
      const next = nextStatusAfterReception(
        fresh.map((it) => ({
          quantity: Number(it.quantity),
          received: Number(it.quantityReceived),
        })),
      );

      await tx.purchaseOrder.update({
        where: { id: poTyped.id, companyId: tenant.companyId },
        data: {
          status: next,
          receivedAt: next === 'RECEIVED' ? new Date() : poTyped.receivedAt,
        } as never,
      });

      return created;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_GRN_CREATED',
      entity: 'GoodsReceivedNote',
      entityId: grn.id,
      details: { purchaseOrderId: po.id, items: grn.items.length },
    });

    return NextResponse.json(grn, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/[id]/grn');
  }
}
