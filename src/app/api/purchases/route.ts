import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { createAccountingEntryAsync } from '@/lib/accounting';
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

        // 2. Adjust Physical Stock automatically and update internal product cost
      for (const item of itemsData) {
        let existingStock;
        
        if (item.variantId) {
           existingStock = await tx.productStock.findFirst({
             where: { productId: item.productId, variantId: item.variantId, branchId }
           });
        } else {
           existingStock = await tx.productStock.findFirst({
             where: { productId: item.productId, variantId: null, branchId }
           });
        }

        if (existingStock) {
           await tx.productStock.update({
             where: { id: existingStock.id },
             data: { quantity: { increment: item.quantity } }
           });
        } else {
           await tx.productStock.create({
             data: {
               productId: item.productId,
               variantId: item.variantId || null,
               branchId,
               quantity: item.quantity,
               minStock: 5
             }
           });
        }

        // 3. Persist the latest acquisition cost on the concrete SKU that was received.
        // productVariant no tiene companyId directo (lo hereda via productId, que ya
        // fue validado más arriba en el bloque de validación de productos).
        // Para Product agregamos companyId al where como defense in depth.
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { cost: item.unitCost }
          });
        } else {
          await tx.product.update({
            where: { id: item.productId, companyId: result.tenant.companyId },
            data: { cost: item.unitCost }
          });
        }
      }

      // 4. Create Supplier Payable (Debt)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // Default 30 net days

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

      return po;
    });
    // Automatic accounting entry for purchase expense
    await createAccountingEntryAsync(prisma, {
      companyId: result.tenant.companyId,
      branchId: branchId || undefined,
      type: 'EXPENSE',
      categoryName: 'Compras de Inventario',
      description: `Compra a proveedor ${reference ? `(Ref: ${reference})` : ''} — ${purchaseItems.length} producto(s)`,
      amount: totalAmount,
      referenceType: 'PURCHASE',
      referenceId: purchase.id,
      userId: result.tenant.userId,
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases POST');
  }
}
