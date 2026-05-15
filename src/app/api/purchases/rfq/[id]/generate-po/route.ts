import { NextRequest, NextResponse } from 'next/server';
import { Prisma, TaxRegime } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { calculateRetention } from '@/lib/purchases';

/**
 * Fase 22c-4 · POST /api/purchases/rfq/[id]/generate-po
 *
 * Agrupa los items adjudicados por proveedor y crea una PurchaseOrder
 * por cada grupo. Aplica IVA 12% LEY GT y threshold de aprobación.
 *
 * Idempotente: si la RFQ ya tiene POs generadas, devuelve el listado existente.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SUFFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function POST(
  _req: NextRequest,
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
    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        items: {
          include: {
            awardedQuoteItem: {
              select: {
                id: true,
                unitPrice: true,
                quantity: true,
                productId: true,
                variantId: true,
              },
            },
            awardedSupplier: {
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
        generatedPurchaseOrders: {
          select: {
            id: true,
            reference: true,
            total: true,
            status: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');

    if (rfq.status !== 'SENT' && rfq.status !== 'OPEN' && rfq.status !== 'AWARDED') {
      throw new ApiError(
        400,
        `No se pueden generar POs desde una RFQ en estado ${rfq.status}.`,
      );
    }

    // Fase 22c-4 verifier IM-1: idempotencia inteligente.
    // Si ya existen POs para algunos suppliers, omitir items adjudicados a esos
    // suppliers (sus items ya están cubiertos por la PO existente). Generar POs
    // SOLO para items adjudicados a suppliers que aún no tienen PO de este RFQ.
    // Si todos los items adjudicados ya tienen PO, devolver alreadyGenerated:true.
    const suppliersWithPo = new Set(
      rfq.generatedPurchaseOrders.map((po) => po.supplier.id),
    );
    const itemsAdjudicatedToNewSuppliers = rfq.items.filter(
      (it) =>
        it.awardedSupplierId &&
        it.awardedQuoteItem &&
        it.awardedSupplier &&
        !suppliersWithPo.has(it.awardedSupplierId),
    );
    if (rfq.generatedPurchaseOrders.length > 0 && itemsAdjudicatedToNewSuppliers.length === 0) {
      return NextResponse.json({
        success: true,
        alreadyGenerated: true,
        purchaseOrders: rfq.generatedPurchaseOrders,
      });
    }

    // Agrupar items con awardedSupplierId por proveedor
    type AwardedLine = {
      rfqRequestItemId: string;
      productId: string;
      variantId: string | null;
      quantity: number;
      unitCost: number;
      subtotal: number;
    };

    const grouped = new Map<
      string,
      {
        supplier: {
          id: string;
          taxRegime: TaxRegime | null;
          withholdsIVA: boolean;
          withholdsISR: boolean;
          isrRate: Prisma.Decimal;
        };
        lines: AwardedLine[];
      }
    >();

    for (const it of rfq.items) {
      if (!it.awardedSupplierId || !it.awardedQuoteItem || !it.awardedSupplier) continue;
      // IM-1: omitir items cuyo supplier ya tiene PO generada (sus items
      // ya están cubiertos; agregarlos generaría POs duplicadas/conflictivas).
      if (suppliersWithPo.has(it.awardedSupplierId)) continue;
      const supplierId = it.awardedSupplierId;
      const qty = Number(it.awardedQuoteItem.quantity);
      const unitCost = Number(it.awardedQuoteItem.unitPrice);
      const sub = round2(qty * unitCost);

      const entry = grouped.get(supplierId);
      if (entry) {
        entry.lines.push({
          rfqRequestItemId: it.id,
          productId: it.awardedQuoteItem.productId,
          variantId: it.awardedQuoteItem.variantId ?? null,
          quantity: qty,
          unitCost,
          subtotal: sub,
        });
      } else {
        grouped.set(supplierId, {
          supplier: it.awardedSupplier,
          lines: [
            {
              rfqRequestItemId: it.id,
              productId: it.awardedQuoteItem.productId,
              variantId: it.awardedQuoteItem.variantId ?? null,
              quantity: qty,
              unitCost,
              subtotal: sub,
            },
          ],
        });
      }
    }

    if (grouped.size === 0) {
      throw new ApiError(
        400,
        'No hay items adjudicados. Adjudicá al menos un item antes de generar POs.',
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: { purchaseApprovalThreshold: true },
    });
    const threshold = Number(company?.purchaseApprovalThreshold ?? 0);

    const refBase =
      rfq.reference && rfq.reference.length > 0 ? rfq.reference : `RFQ-${rfq.id.slice(0, 8)}`;
    // IM-1 cont: si ya existen POs con sufijos -A/-B/..., continuar desde el
    // siguiente índice libre para que la referencia no colisione con las previas.
    const usesSuffix = grouped.size > 1 || rfq.generatedPurchaseOrders.length > 0;
    const existingSuffixes = new Set(
      rfq.generatedPurchaseOrders
        .map((po) => po.reference)
        .filter((ref): ref is string => Boolean(ref))
        .map((ref) => {
          const match = ref.match(/-([A-Z])$/);
          return match ? match[1] : null;
        })
        .filter((s): s is string => s !== null),
    );

    const created: Array<{
      id: string;
      reference: string | null;
      total: Prisma.Decimal;
      status: string;
      supplierId: string;
    }> = [];

    let suffixIdx = 0;
    await prisma.$transaction(async (tx) => {
      for (const [supplierId, group] of grouped.entries()) {
        const subtotalAmount = round2(
          group.lines.reduce((acc, l) => acc + l.subtotal, 0),
        );

        // Compute IVA (LEY GT 12%) sobre subtotal
        const tax = round2(subtotalAmount * 0.12);
        const retention = calculateRetention({
          subtotal: subtotalAmount,
          tax,
          supplierTaxRegime: group.supplier.taxRegime ?? null,
          withholdsIVA: group.supplier.withholdsIVA,
          withholdsISR: group.supplier.withholdsISR,
          isrRate: Number(group.supplier.isrRate ?? 0.05),
        });
        const totalAmount = round2(retention.total);

        const initialStatus =
          threshold > 0 && totalAmount > threshold ? 'PENDING_APPROVAL' : 'APPROVED';

        // IM-1: avanzar suffixIdx hasta encontrar una letra libre que no
        // colisione con sufijos ya usados en POs previas del RFQ.
        while (
          usesSuffix &&
          suffixIdx < SUFFIX_ALPHABET.length &&
          existingSuffixes.has(SUFFIX_ALPHABET[suffixIdx])
        ) {
          suffixIdx += 1;
        }
        const reference =
          usesSuffix && suffixIdx < SUFFIX_ALPHABET.length
            ? `${refBase}-${SUFFIX_ALPHABET[suffixIdx]}`
            : refBase;
        suffixIdx += 1;

        const po = await tx.purchaseOrder.create({
          data: {
            companyId: tenant.companyId,
            branchId: rfq.branchId,
            supplierId,
            userId: tenant.userId,
            reference,
            total: new Prisma.Decimal(totalAmount),
            subtotal: new Prisma.Decimal(subtotalAmount),
            tax: new Prisma.Decimal(tax),
            withheldIVA: new Prisma.Decimal(retention.withheldIVA),
            withheldISR: new Prisma.Decimal(retention.withheldISR),
            status: initialStatus,
            taxRegime: group.supplier.taxRegime ?? null,
            approvedById: initialStatus === 'APPROVED' ? tenant.userId : null,
            approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
            sourceRfqId: rfq.id,
            items: {
              create: group.lines.map((l, idx) => ({
                productId: l.productId,
                variantId: l.variantId,
                quantity: new Prisma.Decimal(l.quantity),
                unitCost: new Prisma.Decimal(l.unitCost),
                subtotal: new Prisma.Decimal(l.subtotal),
                taxRate: new Prisma.Decimal(0.12),
                // Fase 22d-5
                sortOrder: idx,
              })),
            },
          },
        });

        created.push({
          id: po.id,
          reference: po.reference,
          total: po.total,
          status: po.status,
          supplierId,
        });
      }
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_PO_GENERATED',
      entity: 'RFQRequest',
      entityId: rfq.id,
      details: {
        poIds: created.map((p) => p.id),
        suppliers: created.length,
      },
    });

    return NextResponse.json({
      success: true,
      alreadyGenerated: false,
      // IM-1: incluir tanto las POs recién creadas como las preexistentes,
      // para que el frontend tenga la vista completa post-generación.
      purchaseOrders: [
        ...rfq.generatedPurchaseOrders.map((po) => ({
          id: po.id,
          reference: po.reference,
          total: po.total,
          status: po.status,
          supplierId: po.supplier.id,
        })),
        ...created,
      ],
    });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/generate-po');
  }
}
