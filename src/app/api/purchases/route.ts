import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';
import { recordStockMovement } from '@/lib/inventory';
import { handleApiError } from '@/lib/api-error';

const PurchaseItemSchema = z.object({
  productId: z.string().uuid('productId inválido'),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive('quantity debe ser positiva'),
  cost: z.coerce.number().positive('cost debe ser positivo'),
});

const CreatePurchaseSchema = z.object({
  supplierId: z.string().uuid('supplierId requerido'),
  reference: z.string().trim().max(120).optional().nullable(),
  items: z.array(PurchaseItemSchema).min(1, 'La compra debe tener al menos un ítem'),
});

type PurchaseItemInput = z.infer<typeof PurchaseItemSchema>;

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['purchases:view', 'purchases:create', 'settings:manage']);
  if ('error' in result) return result.error;
  
  // Get recent purchases for the tenant's branch
  const branchCondition = result.tenant.branchId ? { branchId: result.tenant.branchId } : {};

  const purchases = await prisma.purchaseOrder.findMany({
    where: { companyId: result.tenant.companyId, ...branchCondition },
    include: {
      supplier: { select: { name: true } },
      user: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, sku: true, unitOfMeasure: true } } }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return NextResponse.json({ purchases });
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission(['purchases:create', 'settings:manage']);
  if ('error' in result) return result.error;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreatePurchaseSchema.parse(body);
    const { supplierId, reference } = parsed;
    const purchaseItems: PurchaseItemInput[] = parsed.items;
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, companyId: result.tenant.companyId, active: true },
      select: { id: true },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado o inactivo' }, { status: 404 });
    }

    const productIds = [...new Set(purchaseItems.map((item) => String(item.productId)))];
    const validProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: result.tenant.companyId },
      select: { id: true },
    });

    if (validProducts.length !== productIds.length) {
      return NextResponse.json({ error: 'Uno o más productos no pertenecen a esta empresa' }, { status: 400 });
    }

    const variantIds = [...new Set(purchaseItems.map((item) => item.variantId).filter((value): value is string => Boolean(value)).map(String))];
    if (variantIds.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: {
          id: { in: variantIds },
          product: { companyId: result.tenant.companyId },
        },
        select: { id: true, productId: true },
      });
      const variantMap = new Map(variants.map((variant) => [variant.id, variant.productId]));

      if (variants.length !== variantIds.length) {
        return NextResponse.json({ error: 'Hay variantes que no pertenecen a esta empresa' }, { status: 400 });
      }

      for (const item of purchaseItems) {
        if (item.variantId && variantMap.get(item.variantId) !== item.productId) {
          return NextResponse.json({ error: 'Hay variantes que no coinciden con su producto' }, { status: 400 });
        }
      }
    }

    let branchId = result.tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: result.tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
      if (!branchId) throw new Error("No hay sucursal activa para recibir el inventario.");
    }

    let totalAmount = 0;
    const itemsData = purchaseItems.map((item) => {
      const sub = Number(item.quantity) * Number(item.cost);
      totalAmount += sub;
      return {
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: Number(item.quantity),
        unitCost: Number(item.cost),
        subtotal: sub,
      };
    });

    // Atomic transaction for bullet-proof financial logs
    const purchase = await prisma.$transaction(async (tx) => {
      // 1. Create Purchase Record
      const po = await tx.purchaseOrder.create({
        data: {
          companyId: result.tenant.companyId,
          branchId,
          supplierId,
          userId: result.tenant.userId,
          reference: reference || null,
          total: totalAmount,
          status: 'COMPLETED',
          items: {
            create: itemsData
          }
        }
      });

      // 2. Registrar movimiento de stock (Fase 15): recalcula WAC, suma a
      //    ProductStock y persiste Product.cost / ProductVariant.cost con el
      //    nuevo costo promedio ponderado. Un movimiento por línea.
      for (const item of itemsData) {
        await recordStockMovement(tx, {
          companyId: result.tenant.companyId,
          productId: item.productId,
          variantId: item.variantId || null,
          branchId: branchId!,
          type: 'PURCHASE',
          quantity: item.quantity,
          unitCost: item.unitCost,
          referenceType: 'PURCHASE_ORDER',
          referenceId: po.id,
          userId: result.tenant.userId,
          date: po.createdAt,
        });
      }

      // 3. Create Supplier Payable (Debt)
      // Fase 17: dueDate = createdAt + supplier.creditDaysDefault (no más hardcoded 30).
      // Si el proveedor no tiene creditDaysDefault o no se encuentra, default 30 días.
      const supplierForCredit = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { creditDaysDefault: true } as never,
      }) as unknown as { creditDaysDefault?: number } | null;
      const creditDays = Number(supplierForCredit?.creditDaysDefault ?? 30);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + creditDays);

      await tx.supplierPayable.create({
        data: {
          companyId: result.tenant.companyId,
          supplierId,
          purchaseId: po.id,
          userId: result.tenant.userId,
          description: `Compra Ref: ${reference || po.id.split('-')[0]}`,
          totalAmount: totalAmount,
          paidAmount: 0,
          status: 'PENDING',
          dueDate: dueDate,
        }
      });

      // 4. Asiento contable de la compra DENTRO del $transaction (H3):
      //   DR Inventario (1.2.01) por totalAmount
      //   CR Proveedores (2.1.01) por totalAmount
      // (Fase 16 separará el IVA crédito fiscal cuando el campo `tax` exista
      // en PurchaseOrder. Por ahora, la compra se imputa íntegra a inventario.)
      await createJournalEntry(tx, {
        companyId: result.tenant.companyId,
        branchId,
        date: po.createdAt,
        description: `Compra a proveedor${reference ? ` (Ref: ${reference})` : ''} — ${purchaseItems.length} producto(s)`,
        referenceType: 'PURCHASE',
        referenceId: po.id,
        userId: result.tenant.userId,
        lines: [
          { accountCode: ACCOUNTS.INVENTORY, debit: totalAmount, description: 'Inventario' },
          { accountCode: ACCOUNTS.AP, credit: totalAmount, description: 'Cuentas por Pagar a Proveedores' },
        ],
      });

      return po;
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases POST');
  }
}
