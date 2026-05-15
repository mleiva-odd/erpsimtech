import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const QuoteItemSchema = z.object({
  rfqRequestItemId: z.string().uuid(),
  unitPrice: z.coerce.number().nonnegative(),
  deliveryDays: z.coerce.number().int().min(0).optional().nullable(),
  /** Cantidad override (si null se usa la del RFQRequestItem). */
  quantity: z.coerce.number().positive().optional().nullable(),
});

const CreateQuoteSchema = z.object({
  supplierId: z.string().uuid(),
  validUntil: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(QuoteItemSchema).min(1),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fase 22c-4 · POST /api/purchases/rfq/[id]/quotes
 *
 * Match items por rfqRequestItemId (más explícito que por productId).
 * Solo permitido en SENT/OPEN.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateQuoteSchema.parse(body);

    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: {
        id: true,
        status: true,
        items: {
          select: { id: true, productId: true, variantId: true, quantity: true },
        },
      },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');
    if (rfq.status !== 'OPEN' && rfq.status !== 'SENT') {
      throw new ApiError(
        400,
        `Solo se aceptan cotizaciones en RFQ SENT (actual: ${rfq.status}).`,
      );
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: parsed.supplierId, companyId: tenant.companyId },
      select: { id: true },
    });
    if (!supplier) throw new ApiError(400, 'Proveedor inválido.');

    // Map rfqRequestItemId → rfqItem para validar y obtener product/variant/qty
    const itemMap = new Map(rfq.items.map((it) => [it.id, it]));
    const quoteItemsData: Array<{
      productId: string;
      variantId: string | null;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      deliveryDays: number | null;
    }> = [];

    let totalAmount = 0;
    for (const ql of parsed.items) {
      const rfqItem = itemMap.get(ql.rfqRequestItemId);
      if (!rfqItem) {
        throw new ApiError(400, `Item ${ql.rfqRequestItemId} no pertenece a esta RFQ.`);
      }
      const qty = ql.quantity != null ? ql.quantity : Number(rfqItem.quantity);
      const lineTotal = round2(qty * ql.unitPrice);
      totalAmount += lineTotal;

      quoteItemsData.push({
        productId: rfqItem.productId,
        variantId: rfqItem.variantId ?? null,
        quantity: new Prisma.Decimal(qty),
        unitPrice: new Prisma.Decimal(ql.unitPrice),
        deliveryDays: ql.deliveryDays ?? null,
      });
    }
    totalAmount = round2(totalAmount);

    const quote = await prisma.$transaction(async (tx) => {
      const created = await tx.rFQQuote.create({
        data: {
          rfqRequestId: rfq.id,
          supplierId: parsed.supplierId,
          quotedById: tenant.userId,
          totalAmount: new Prisma.Decimal(totalAmount),
          validUntil: parsed.validUntil ?? null,
          notes: parsed.notes ?? null,
          items: {
            create: quoteItemsData,
          },
        },
        include: { items: true },
      });

      // Marcar respondedAt en la invitación si existía y aún era null
      await tx.rFQInvitation.updateMany({
        where: {
          rfqRequestId: rfq.id,
          supplierId: parsed.supplierId,
          respondedAt: null,
        },
        data: { respondedAt: new Date() },
      });

      return created;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_QUOTE_REGISTERED',
      entity: 'RFQQuote',
      entityId: quote.id,
      details: {
        rfqRequestId: rfq.id,
        supplierId: parsed.supplierId,
        totalAmount,
        itemCount: quote.items.length,
      },
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/quotes');
  }
}
