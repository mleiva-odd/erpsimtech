import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { createJournalEntry } from '@/lib/accounting';
import { recordStockMovement } from '@/lib/inventory';
import { handleApiError, ApiError } from '@/lib/api-error';
import {
  calculateRetention,
  buildSupplierInvoiceJournalLines,
} from '@/lib/purchases';
import {
  getExchangeRate,
  toFunctionalAmount,
  normalizeCurrency,
  ExchangeRateError,
} from '@/lib/currency';

const PurchaseItemSchema = z.object({
  productId: z.string().uuid('productId inválido'),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive('quantity debe ser positiva'),
  cost: z.coerce.number().positive('cost debe ser positivo'),
  taxRate: z.coerce.number().min(0).max(1).optional(),
});

const CreatePurchaseSchema = z.object({
  supplierId: z.string().uuid('supplierId requerido'),
  reference: z.string().trim().max(120).optional().nullable(),
  invoiceNumber: z.string().trim().max(120).optional().nullable(),
  invoiceDate: z.coerce.date().optional().nullable(),
  /**
   * `mode='fast'` (default, compat con UI vieja): crea PO + GRN + SupplierInvoice
   * + Payable + asiento contable atómicamente. Marca PO como INVOICED.
   *
   * `mode='enterprise'`: solo crea PO. La queda en DRAFT o PENDING_APPROVAL
   * según el threshold de la empresa. GRN/SupplierInvoice se registran con
   * endpoints separados.
   */
  mode: z.enum(['fast', 'enterprise']).optional().default('fast'),
  /** Costo adicional (flete, seguros, aduana) — modo enterprise. */
  landedCost: z.coerce.number().min(0).optional(),
  items: z.array(PurchaseItemSchema).min(1, 'La compra debe tener al menos un ítem'),
  /** PR del que proviene esta PO (opcional). */
  purchaseRequestId: z.string().uuid().optional().nullable(),
  /** Fase 21 · Multi-moneda. ISO-3 mayúsculas, default GTQ. */
  currency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, 'currency debe ser ISO-3 (USD, EUR, ...)'))
    .optional()
    .default('GTQ'),
});

type PurchaseItemInput = z.infer<typeof PurchaseItemSchema>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(_req: NextRequest) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;

  const branchCondition = result.tenant.branchId
    ? { branchId: result.tenant.branchId }
    : {};

  const purchases = await prisma.purchaseOrder.findMany({
    where: { companyId: result.tenant.companyId, ...branchCondition },
    include: {
      supplier: { select: { name: true } },
      user: { select: { name: true } },
      items: {
        include: {
          product: {
            select: { name: true, sku: true, unitOfMeasure: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ purchases });
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission([
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreatePurchaseSchema.parse(body);
    const { supplierId, reference, mode } = parsed;
    const purchaseItems: PurchaseItemInput[] = parsed.items;

    const supplier = (await prisma.supplier.findFirst({
      where: { id: supplierId, companyId: tenant.companyId, active: true },
      select: {
        id: true,
        creditDaysDefault: true,
        taxRegime: true,
        withholdsIVA: true,
        withholdsISR: true,
        isrRate: true,
      } as never,
    })) as
      | {
          id: string;
          creditDaysDefault?: number | null;
          taxRegime?: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
          withholdsIVA?: boolean | null;
          withholdsISR?: boolean | null;
          isrRate?: number | null;
        }
      | null;
    if (!supplier) {
      throw new ApiError(404, 'Proveedor no encontrado o inactivo');
    }

    const productIds = [...new Set(purchaseItems.map((it) => String(it.productId)))];
    const validProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: tenant.companyId },
      select: { id: true },
    });
    if (validProducts.length !== productIds.length) {
      throw new ApiError(
        400,
        'Uno o más productos no pertenecen a esta empresa',
      );
    }

    const variantIds = [
      ...new Set(
        purchaseItems
          .map((it) => it.variantId)
          .filter((v): v is string => Boolean(v))
          .map(String),
      ),
    ];
    if (variantIds.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: {
          id: { in: variantIds },
          product: { companyId: tenant.companyId },
        },
        select: { id: true, productId: true },
      });
      if (variants.length !== variantIds.length) {
        throw new ApiError(
          400,
          'Hay variantes que no pertenecen a esta empresa',
        );
      }
      const variantMap = new Map(variants.map((v) => [v.id, v.productId]));
      for (const it of purchaseItems) {
        if (it.variantId && variantMap.get(it.variantId) !== it.productId) {
          throw new ApiError(
            400,
            'Hay variantes que no coinciden con su producto',
          );
        }
      }
    }

    // Branch
    let branchId = tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
      if (!branchId) {
        throw new ApiError(
          400,
          'No hay sucursal activa para recibir el inventario.',
        );
      }
    }

    // Si llega purchaseRequestId, validar que sea de la empresa y esté en
    // estado APPROVED (no CONVERTED_TO_PO ya).
    if (parsed.purchaseRequestId) {
      const pr = await prisma.purchaseRequest.findFirst({
        where: {
          id: parsed.purchaseRequestId,
          companyId: tenant.companyId,
          status: 'APPROVED',
        },
        select: { id: true },
      });
      if (!pr) {
        throw new ApiError(
          400,
          'La PR referenciada no existe o no está APPROVED.',
        );
      }
    }

    // Totales
    let subtotalAmount = 0;
    let taxAmount = 0;
    const itemsData = purchaseItems.map((it) => {
      const qty = Number(it.quantity);
      const unitCost = Number(it.cost);
      const sub = round2(qty * unitCost);
      const rate = Number(it.taxRate ?? 0);
      const tax = round2(sub * rate);
      subtotalAmount += sub;
      taxAmount += tax;
      return {
        productId: it.productId,
        variantId: it.variantId || null,
        quantity: qty,
        unitCost,
        subtotal: sub,
        taxRate: rate,
        tax,
      };
    });
    subtotalAmount = round2(subtotalAmount);
    taxAmount = round2(taxAmount);

    // Retenciones (snapshot al crear la PO). Defaults seguros para campos
    // nullable del Supplier (taxRegime, withholdsIVA/ISR, isrRate).
    const retention = calculateRetention({
      subtotal: subtotalAmount,
      tax: taxAmount,
      supplierTaxRegime: supplier?.taxRegime ?? null,
      withholdsIVA: supplier?.withholdsIVA ?? false,
      withholdsISR: supplier?.withholdsISR ?? false,
      isrRate: Number(supplier?.isrRate ?? 0.05),
    });
    const totalAmount = round2(retention.total);

    // Fase 21 · Multi-moneda. Snapshot del tipo de cambio al crear la PO.
    // Si currency=GTQ → rate=1.0. Si currency≠GTQ y no hay rate, throw 422.
    const poCurrency = normalizeCurrency(parsed.currency);

    if (mode === 'fast') {
      // Modo legacy: crea PO + GRN + Invoice + Payable + asiento atómicamente.
      // Cast a `as never` para los `data` con columnas nuevas de Fase 19
      // (subtotal/tax/withheld/etc.) que el cliente Prisma viejo no conoce
      // hasta `prisma generate`. Mismo patrón Fase 17/18.
      const purchase = await prisma.$transaction(async (tx) => {
        const fxRate = await getExchangeRate(
          tx as unknown as Parameters<typeof getExchangeRate>[0],
          tenant.companyId,
          poCurrency,
          new Date(),
        );
        const poFunctionalAmount = toFunctionalAmount(totalAmount, fxRate);

        const po = (await tx.purchaseOrder.create({
          data: {
            companyId: tenant.companyId,
            branchId: branchId!,
            supplierId,
            userId: tenant.userId,
            reference: reference || null,
            total: new PrismaNS.Decimal(totalAmount),
            subtotal: new PrismaNS.Decimal(subtotalAmount),
            tax: new PrismaNS.Decimal(taxAmount),
            withheldIVA: new PrismaNS.Decimal(retention.withheldIVA),
            withheldISR: new PrismaNS.Decimal(retention.withheldISR),
            status: 'INVOICED',
            taxRegime: (supplier as { taxRegime?: string | null }).taxRegime ?? null,
            invoiceNumber: parsed.invoiceNumber ?? reference ?? null,
            approvedById: tenant.userId,
            approvedAt: new Date(),
            receivedAt: new Date(),
            purchaseRequestId: parsed.purchaseRequestId ?? null,
            // Fase 21 · Multi-moneda · snapshot inmutable
            currency: poCurrency,
            exchangeRate: new PrismaNS.Decimal(fxRate),
            functionalAmount: new PrismaNS.Decimal(poFunctionalAmount),
            items: {
              create: itemsData.map((it) => ({
                productId: it.productId,
                variantId: it.variantId,
                quantity: new PrismaNS.Decimal(it.quantity),
                unitCost: new PrismaNS.Decimal(it.unitCost),
                subtotal: new PrismaNS.Decimal(it.subtotal),
                taxRate: new PrismaNS.Decimal(it.taxRate),
                quantityReceived: new PrismaNS.Decimal(it.quantity),
                quantityInvoiced: new PrismaNS.Decimal(it.quantity),
              })),
            },
          } as never,
          include: { items: true },
        })) as unknown as {
          id: string;
          createdAt: Date;
          items: Array<{ id: string; quantity: unknown; unitCost: unknown }>;
        };

        // GRN único, full quantity
        const grn = await tx.goodsReceivedNote.create({
          data: {
            companyId: tenant.companyId,
            purchaseOrderId: po.id,
            receivedById: tenant.userId,
            notes: 'GRN automático (modo fast)',
            items: {
              create: po.items.map((poItem) => ({
                purchaseOrderItemId: poItem.id,
                quantityReceived: new PrismaNS.Decimal(Number(poItem.quantity)),
                unitCost: new PrismaNS.Decimal(Number(poItem.unitCost)),
              })),
            },
          } as never,
        });

        // Stock movement por línea (WAC).
        for (const item of itemsData) {
          await recordStockMovement(tx, {
            companyId: tenant.companyId,
            productId: item.productId,
            variantId: item.variantId,
            branchId: branchId!,
            type: 'PURCHASE',
            quantity: item.quantity,
            unitCost: item.unitCost,
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.id,
            userId: tenant.userId,
            date: po.createdAt,
          });
        }

        // SupplierInvoice
        const invoiceNumber = parsed.invoiceNumber ?? reference ?? po.id.slice(0, 8);
        const invoiceDate = parsed.invoiceDate ?? po.createdAt;
        const creditDays = Number(
          (supplier as { creditDaysDefault?: number | null }).creditDaysDefault ?? 30,
        );
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + creditDays);

        await tx.supplierInvoice.create({
          data: ({
            companyId: tenant.companyId,
            purchaseOrderId: po.id,
            supplierId,
            registeredById: tenant.userId,
            invoiceNumber,
            invoiceDate,
            dueDate,
            subtotal: new PrismaNS.Decimal(subtotalAmount),
            tax: new PrismaNS.Decimal(taxAmount),
            withheldIVA: new PrismaNS.Decimal(retention.withheldIVA),
            withheldISR: new PrismaNS.Decimal(retention.withheldISR),
            total: new PrismaNS.Decimal(totalAmount),
            // Fase 21 · Multi-moneda · snapshot inmutable
            currency: poCurrency,
            exchangeRate: new PrismaNS.Decimal(fxRate),
            functionalAmount: new PrismaNS.Decimal(poFunctionalAmount),
          } as never),
        });

        // Payable
        await tx.supplierPayable.create({
          data: {
            companyId: tenant.companyId,
            supplierId,
            purchaseId: po.id,
            userId: tenant.userId,
            description: `Compra Ref: ${reference || po.id.slice(0, 8)}`,
            totalAmount: new PrismaNS.Decimal(totalAmount),
            paidAmount: new PrismaNS.Decimal(0),
            status: 'PENDING',
            dueDate,
          },
        });

        // Asiento contable dentro del $transaction.
        // Fase 21 · Las líneas siempre en GTQ (moneda funcional). Si la PO
        // es en moneda extranjera, escalamos los montos × rate.
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const lines = buildSupplierInvoiceJournalLines({
          subtotal: round2(subtotalAmount * fxRate),
          tax: round2(taxAmount * fxRate),
          withheldIVA: round2(retention.withheldIVA * fxRate),
          withheldISR: round2(retention.withheldISR * fxRate),
          isInventoryPurchase: true,
          description: `Compra ${reference ?? ''}`.trim(),
        });

        if (lines.length >= 2) {
          await createJournalEntry(tx, {
            companyId: tenant.companyId,
            branchId,
            date: po.createdAt,
            description: `Compra a proveedor${reference ? ` (Ref: ${reference})` : ''} — ${purchaseItems.length} producto(s)`,
            referenceType: 'PURCHASE',
            referenceId: po.id,
            userId: tenant.userId,
            lines,
          });
        }

        // Si vino de una PR, marcarla CONVERTED_TO_PO
        if (parsed.purchaseRequestId) {
          await tx.purchaseRequest.update({
            where: { id: parsed.purchaseRequestId },
            data: { status: 'CONVERTED_TO_PO' },
          });
        }

        // grn referenciado para evitar warning unused (auditoría de creación).
        void grn;
        return po;
      });

      return NextResponse.json(purchase, { status: 201 });
    }

    // Modo enterprise: solo crea PO. Stock se mueve al GRN; SupplierInvoice
    // y payable se crean al registrar la factura.
    const company = await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: { purchaseApprovalThreshold: true } as never,
    }) as unknown as { purchaseApprovalThreshold?: PrismaNS.Decimal } | null;

    const threshold = Number(company?.purchaseApprovalThreshold ?? 0);
    const initialStatus =
      totalAmount > threshold ? 'PENDING_APPROVAL' : 'APPROVED';

    const po = await prisma.$transaction(async (tx) => {
      const fxRate = await getExchangeRate(
        tx as unknown as Parameters<typeof getExchangeRate>[0],
        tenant.companyId,
        poCurrency,
        new Date(),
      );
      const poFunctionalAmount = toFunctionalAmount(totalAmount, fxRate);

      const created = await tx.purchaseOrder.create({
        data: {
          companyId: tenant.companyId,
          branchId: branchId!,
          supplierId,
          userId: tenant.userId,
          reference: reference || null,
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
          purchaseRequestId: parsed.purchaseRequestId ?? null,
          // Fase 21 · Multi-moneda · snapshot inmutable
          currency: poCurrency,
          exchangeRate: new PrismaNS.Decimal(fxRate),
          functionalAmount: new PrismaNS.Decimal(poFunctionalAmount),
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

      if (parsed.purchaseRequestId) {
        await tx.purchaseRequest.update({
          where: { id: parsed.purchaseRequestId },
          data: { status: 'CONVERTED_TO_PO' },
        });
      }

      return created;
    });

    return NextResponse.json(po, { status: 201 });
  } catch (error) {
    // Fase 21: surfacing del error de FX (422) antes del handler genérico.
    if (error instanceof ExchangeRateError) {
      return NextResponse.json(
        { error: error.message, code: 'EXCHANGE_RATE_NOT_FOUND' },
        { status: error.status },
      );
    }
    return handleApiError(error, '/api/purchases POST');
  }
}
