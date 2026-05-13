import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const QuoteItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  deliveryDays: z.coerce.number().int().min(0).optional().nullable(),
});

const CreateQuoteSchema = z.object({
  supplierId: z.string().uuid(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(QuoteItemSchema).min(1),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
      select: { id: true, status: true },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');
    if (rfq.status !== 'OPEN') {
      throw new ApiError(
        400,
        `Solo se aceptan cotizaciones en RFQ OPEN (actual: ${rfq.status}).`,
      );
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: parsed.supplierId, companyId: tenant.companyId },
      select: { id: true },
    });
    if (!supplier) throw new ApiError(400, 'Proveedor inválido.');

    const totalAmount = round2(
      parsed.items.reduce(
        (acc, it) => acc + Number(it.quantity) * Number(it.unitPrice),
        0,
      ),
    );

    const quote = await prisma.rFQQuote.create({
      data: {
        rfqRequestId: rfq.id,
        supplierId: parsed.supplierId,
        quotedById: tenant.userId,
        totalAmount: new PrismaNS.Decimal(totalAmount),
        validUntil: parsed.validUntil ?? null,
        notes: parsed.notes ?? null,
        items: {
          create: parsed.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId ?? null,
            quantity: new PrismaNS.Decimal(it.quantity),
            unitPrice: new PrismaNS.Decimal(it.unitPrice),
            deliveryDays: it.deliveryDays ?? null,
          })),
        },
      },
      include: { items: true },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_QUOTE_REGISTERED',
      entity: 'RFQQuote',
      entityId: quote.id,
      details: { rfqRequestId: rfq.id, supplierId: parsed.supplierId, totalAmount },
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/quotes');
  }
}
