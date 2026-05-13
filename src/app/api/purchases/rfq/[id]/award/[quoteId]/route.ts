import { NextRequest, NextResponse } from 'next/server';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { calculateRetention } from '@/lib/purchases';

/**
 * POST /api/purchases/rfq/[id]/award/[quoteId]
 *
 * Adjudica una cotización ganadora en una RFQ. Crea automáticamente una PO
 * con las líneas/precios de la quote. La RFQ pasa a AWARDED.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:create',
    'purchases:approve',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id, quoteId } = await params;

  try {
    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        quotes: {
          where: { id: quoteId },
          include: {
            items: true,
            supplier: {
              select: {
                id: true,
                taxRegime: true,
                withholdsIVA: true,
                withholdsISR: true,
                isrRate: true,
              },
            },
          },
        },
      },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');
    if (rfq.status !== 'OPEN') {
      throw new ApiError(
        400,
        `Solo se puede adjudicar una RFQ OPEN (actual: ${rfq.status}).`,
      );
    }
    const quote = rfq.quotes[0];
    if (!quote) throw new ApiError(404, 'Cotización no encontrada.');

    // Totales
    type QuoteItemShape = {
      productId: string;
      variantId: string | null;
      quantity: number | string | { toString(): string };
      unitPrice: number | string | { toString(): string };
    };
    type SupplierShape = {
      taxRegime?: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
      withholdsIVA?: boolean;
      withholdsISR?: boolean;
      isrRate?: number;
    };
    let subtotalAmount = 0;
    const itemsData = (quote.items as QuoteItemShape[]).map((it) => {
      const qty = Number(it.quantity);
      const unitCost = Number(it.unitPrice);
      const sub = round2(qty * unitCost);
      subtotalAmount += sub;
      return {
        productId: it.productId,
        variantId: it.variantId ?? null,
        quantity: qty,
        unitCost,
        subtotal: sub,
        taxRate: 0,
      };
    });
    subtotalAmount = round2(subtotalAmount);

    const supplierShape = quote.supplier as SupplierShape;
    const retention = calculateRetention({
      subtotal: subtotalAmount,
      tax: 0,
      supplierTaxRegime: supplierShape.taxRegime ?? null,
      withholdsIVA: supplierShape.withholdsIVA ?? false,
      withholdsISR: supplierShape.withholdsISR ?? false,
      isrRate: Number(supplierShape.isrRate ?? 0.05),
    });
    const totalAmount = round2(retention.total);

    const company = await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: { purchaseApprovalThreshold: true } as never,
    }) as unknown as { purchaseApprovalThreshold?: PrismaNS.Decimal } | null;
    const threshold = Number(company?.purchaseApprovalThreshold ?? 0);
    const initialStatus = totalAmount > threshold ? 'PENDING_APPROVAL' : 'APPROVED';

    const result2 = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          companyId: tenant.companyId,
          branchId: rfq.branchId,
          supplierId: quote.supplierId,
          userId: tenant.userId,
          reference: `RFQ-${rfq.id.slice(0, 8)}`,
          total: new PrismaNS.Decimal(totalAmount),
          subtotal: new PrismaNS.Decimal(subtotalAmount),
          tax: new PrismaNS.Decimal(0),
          withheldIVA: new PrismaNS.Decimal(retention.withheldIVA),
          withheldISR: new PrismaNS.Decimal(retention.withheldISR),
          status: initialStatus,
          taxRegime: supplierShape.taxRegime ?? null,
          approvedById: initialStatus === 'APPROVED' ? tenant.userId : null,
          approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
          items: {
            create: itemsData.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              quantity: new PrismaNS.Decimal(it.quantity),
              unitCost: new PrismaNS.Decimal(it.unitCost),
              subtotal: new PrismaNS.Decimal(it.subtotal),
              taxRate: new PrismaNS.Decimal(it.taxRate),
            })),
          },
        } as never,
      });

      // Marcar quote ganadora y RFQ AWARDED
      await tx.rFQQuote.update({
        where: { id: quote.id },
        data: { selected: true },
      });
      await tx.rFQRequest.update({
        where: { id: rfq.id },
        data: {
          status: 'AWARDED',
          awardedQuoteId: quote.id,
          closedAt: new Date(),
        },
      });

      return po;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_AWARDED',
      entity: 'RFQRequest',
      entityId: rfq.id,
      details: { quoteId: quote.id, purchaseOrderId: result2.id, totalAmount },
    });

    return NextResponse.json(result2, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/award/[quoteId]');
  }
}
