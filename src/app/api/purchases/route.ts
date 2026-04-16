import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';

function isPositiveNumber(value: unknown) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export async function GET(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
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
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const userPayload: any = result.tenant; // Type assertion since Tenant typing may not expose userId directly

  const body = await req.json();
  const { supplierId, reference, items } = body;

  if (!supplierId || !items || !items.length) {
    return NextResponse.json({ error: 'Faltan datos logísticos (proveedor o items).' }, { status: 400 });
  }

  for (const item of items) {
    if (!item?.productId || !isPositiveNumber(item.quantity) || !isPositiveNumber(item.cost)) {
      return NextResponse.json({ error: 'Cada línea de compra debe tener producto, cantidad y costo válidos.' }, { status: 400 });
    }
  }

  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, companyId: result.tenant.companyId, active: true },
      select: { id: true },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado o inactivo' }, { status: 404 });
    }

    const productIds = [...new Set(items.map((item: any) => String(item.productId)))] as string[];
    const validProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: result.tenant.companyId },
      select: { id: true },
    });

    if (validProducts.length !== productIds.length) {
      return NextResponse.json({ error: 'Uno o más productos no pertenecen a esta empresa' }, { status: 400 });
    }

    const variantIds = [...new Set(items.map((item: any) => item.variantId).filter(Boolean).map(String))] as string[];
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

      for (const item of items) {
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
    const itemsData = items.map((item: any) => {
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
          userId: userPayload.userId, // El empleado que recibe
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
             where: { variantId: item.variantId, branchId }
           });
        } else {
           existingStock = await tx.productStock.findFirst({
             where: { productId: item.productId, variantId: (null as any), branchId }
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

        // Persist the latest acquisition cost on the concrete SKU that was received.
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { cost: item.unitCost }
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { cost: item.unitCost }
          });
        }
      }

      return po;
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Error sistémico procesando el ingreso a bodega' }, { status: 500 });
  }
}
