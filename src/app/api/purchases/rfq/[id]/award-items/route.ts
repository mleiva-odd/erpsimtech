import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const AwardSchema = z.object({
  items: z
    .array(
      z.object({
        rfqRequestItemId: z.string().uuid(),
        supplierId: z.string().uuid(),
        rfqQuoteItemId: z.string().uuid(),
      }),
    )
    .min(1),
});

/**
 * Fase 22c-4 · POST /api/purchases/rfq/[id]/award-items
 *
 * Split award: adjudicar items individualmente a distintos proveedores.
 * Si TODOS los items quedan adjudicados → RFQ → AWARDED (closedAt = now).
 * Si parcial, RFQ queda en SENT. Idempotente.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:approve',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = AwardSchema.parse(body);

    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        items: { select: { id: true, productId: true, awardedSupplierId: true } },
        quotes: {
          include: {
            items: { select: { id: true, productId: true } },
          },
        },
      },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');
    if (rfq.status !== 'SENT' && rfq.status !== 'OPEN') {
      throw new ApiError(
        400,
        `Solo se puede adjudicar una RFQ SENT (actual: ${rfq.status}).`,
      );
    }

    // Mapas para validar
    const rfqItemMap = new Map(rfq.items.map((it) => [it.id, it]));
    const quoteBySupplier = new Map<string, typeof rfq.quotes[number]>();
    const quoteItemById = new Map<
      string,
      { rfqQuoteId: string; supplierId: string; productId: string }
    >();
    for (const q of rfq.quotes) {
      quoteBySupplier.set(q.supplierId, q);
      for (const qi of q.items) {
        quoteItemById.set(qi.id, {
          rfqQuoteId: q.id,
          supplierId: q.supplierId,
          productId: qi.productId,
        });
      }
    }

    // Validar cada award
    for (const aw of parsed.items) {
      const rItem = rfqItemMap.get(aw.rfqRequestItemId);
      if (!rItem) {
        throw new ApiError(400, `RFQRequestItem ${aw.rfqRequestItemId} no pertenece a esta RFQ.`);
      }
      const qItem = quoteItemById.get(aw.rfqQuoteItemId);
      if (!qItem) {
        throw new ApiError(400, `RFQQuoteItem ${aw.rfqQuoteItemId} no encontrado.`);
      }
      if (qItem.supplierId !== aw.supplierId) {
        throw new ApiError(
          400,
          'El RFQQuoteItem no pertenece al proveedor indicado.',
        );
      }
      if (qItem.productId !== rItem.productId) {
        throw new ApiError(
          400,
          'El RFQQuoteItem no corresponde al producto del RFQRequestItem.',
        );
      }
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const aw of parsed.items) {
        await tx.rFQRequestItem.update({
          where: { id: aw.rfqRequestItemId },
          data: {
            awardedSupplierId: aw.supplierId,
            awardedQuoteItemId: aw.rfqQuoteItemId,
            awardedAt: now,
          },
        });
      }
    });

    // Verificar si todos los items quedaron adjudicados
    const refreshed = await prisma.rFQRequest.findFirst({
      where: { id: rfq.id },
      include: { items: { select: { id: true, awardedSupplierId: true } } },
    });
    if (!refreshed) throw new ApiError(500, 'Error releyendo RFQ.');

    const allAwarded = refreshed.items.every((it) => it.awardedSupplierId !== null);
    let nextStatus = refreshed.status;
    if (allAwarded && refreshed.status !== 'AWARDED') {
      await prisma.rFQRequest.update({
        where: { id: rfq.id },
        data: { status: 'AWARDED', closedAt: now },
      });
      nextStatus = 'AWARDED';
    }

    // Audit por item
    for (const aw of parsed.items) {
      await createAuditLog({
        companyId: tenant.companyId,
        userId: tenant.userId,
        action: 'RFQ_ITEM_AWARDED',
        entity: 'RFQRequestItem',
        entityId: aw.rfqRequestItemId,
        details: {
          rfqRequestId: rfq.id,
          supplierId: aw.supplierId,
          rfqQuoteItemId: aw.rfqQuoteItemId,
        },
      });
    }

    if (allAwarded) {
      await createAuditLog({
        companyId: tenant.companyId,
        userId: tenant.userId,
        action: 'RFQ_AWARDED',
        entity: 'RFQRequest',
        entityId: rfq.id,
        details: { itemsAwarded: refreshed.items.length },
      });
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      itemsAwarded: parsed.items.length,
      allItemsAwarded: allAwarded,
    });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/award-items');
  }
}
