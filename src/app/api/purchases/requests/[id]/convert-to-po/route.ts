import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { calculateRetention } from '@/lib/purchases';

/**
 * Convierte una PR aprobada en PO. Requiere supplierId (si la PR original no
 * tenía) y costos unitarios definitivos. La PO queda en DRAFT o PENDING_APPROVAL
 * según el threshold de la empresa.
 */
const ConvertSchema = z.object({
  supplierId: z.string().uuid(),
  reference: z.string().trim().max(120).optional().nullable(),
  landedCost: z.coerce.number().min(0).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional().nullable(),
        quantity: z.coerce.number().positive(),
        cost: z.coerce.number().positive(),
        taxRate: z.coerce.number().min(0).max(1).optional(),
      }),
    )
    .min(1),
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
    'purchases:approve',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ConvertSchema.parse(body);

    const pr = await prisma.purchaseRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: { purchaseOrder: { select: { id: true } } },
    });
    if (!pr) throw new ApiError(404, 'PR no encontrada.');
    if (pr.status !== 'APPROVED') {
      throw new ApiError(
        400,
        `Solo se convierten PRs APPROVED (actual: ${pr.status}).`,
      );
    }
    if (pr.purchaseOrder) {
      throw new ApiError(409, 'Esta PR ya fue convertida en PO.');
    }

    const supplier = (await prisma.supplier.findFirst({
      where: { id: parsed.supplierId, companyId: tenant.companyId, active: true },
      select: {
        id: true,
        taxRegime: true,
        withholdsIVA: true,
        withholdsISR: true,
        isrRate: true,
      } as never,
    })) as {
      id: string;
      taxRegime?: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
      withholdsIVA?: boolean;
      withholdsISR?: boolean;
      isrRate?: number;
    } | null;
    if (!supplier) throw new ApiError(400, 'Proveedor inválido.');

    // Branch: usar el de la PR
    const branchId = pr.branchId;

    // Totales + retenciones
    let subtotalAmount = 0;
    let taxAmount = 0;
    const itemsData = parsed.items.map((it) => {
      const qty = Number(it.quantity);
      const unitCost = Number(it.cost);
      const sub = round2(qty * unitCost);
      const rate = Number(it.taxRate ?? 0);
      const tax = round2(sub * rate);
      subtotalAmount += sub;
      taxAmount += tax;
      return {
        productId: it.productId,
        variantId: it.variantId ?? null,
        quantity: qty,
        unitCost,
        subtotal: sub,
        taxRate: rate,
      };
    });
    subtotalAmount = round2(subtotalAmount);
    taxAmount = round2(taxAmount);

    const retention = calculateRetention({
      subtotal: subtotalAmount,
      tax: taxAmount,
      supplierTaxRegime:
        (supplier as { taxRegime?: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null })
          .taxRegime ?? null,
      withholdsIVA: (supplier as { withholdsIVA?: boolean }).withholdsIVA ?? false,
      withholdsISR: (supplier as { withholdsISR?: boolean }).withholdsISR ?? false,
      isrRate: Number((supplier as { isrRate?: number }).isrRate ?? 0.05),
    });
    const totalAmount = round2(retention.total);

    const company = await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: { purchaseApprovalThreshold: true } as never,
    }) as unknown as { purchaseApprovalThreshold?: PrismaNS.Decimal } | null;
    const threshold = Number(company?.purchaseApprovalThreshold ?? 0);
    const initialStatus = totalAmount > threshold ? 'PENDING_APPROVAL' : 'APPROVED';

    const po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          companyId: tenant.companyId,
          branchId,
          supplierId: parsed.supplierId,
          userId: tenant.userId,
          reference: parsed.reference ?? null,
          total: new PrismaNS.Decimal(totalAmount),
          subtotal: new PrismaNS.Decimal(subtotalAmount),
          tax: new PrismaNS.Decimal(taxAmount),
          withheldIVA: new PrismaNS.Decimal(retention.withheldIVA),
          withheldISR: new PrismaNS.Decimal(retention.withheldISR),
          landedCost: new PrismaNS.Decimal(parsed.landedCost ?? 0),
          status: initialStatus,
          taxRegime: (supplier as { taxRegime?: string | null }).taxRegime ?? null,
          approvedById: initialStatus === 'APPROVED' ? tenant.userId : null,
          approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
          purchaseRequestId: pr.id,
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

      await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'CONVERTED_TO_PO' },
      });

      return created;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_REQUEST_CONVERTED',
      entity: 'PurchaseRequest',
      entityId: pr.id,
      details: { purchaseOrderId: po.id },
    });

    return NextResponse.json(po, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/requests/[id]/convert-to-po');
  }
}
