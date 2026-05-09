import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAnyPermission, requireBranchAccess, requireOperationalPermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const AdjustmentSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  newQuantity: z.number().int().min(0, 'La cantidad no puede ser negativa'),
  reason: z.string().min(2, 'El motivo es obligatorio'),
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function setProductStockQuantity(tx: Prisma.TransactionClient, input: {
  productId: string;
  branchId: string;
  variantId: string | null;
  quantity: number;
  minStock?: number;
}) {
  const minStock = input.minStock ?? 5;

  if (input.variantId) {
    await tx.productStock.upsert({
      where: {
        productId_branchId_variantId: {
          productId: input.productId,
          branchId: input.branchId,
          variantId: input.variantId,
        }
      },
      update: { quantity: input.quantity, minStock },
      create: {
        productId: input.productId,
        branchId: input.branchId,
        variantId: input.variantId,
        quantity: input.quantity,
        minStock,
      }
    });
    return;
  }

  const existing = await tx.productStock.findFirst({
    where: {
      productId: input.productId,
      branchId: input.branchId,
      variantId: null,
    },
    select: { id: true },
  });

  if (existing) {
    await tx.productStock.update({
      where: { id: existing.id },
      data: { quantity: input.quantity, minStock },
    });
    return;
  }

  await tx.productStock.create({
    data: {
      productId: input.productId,
      branchId: input.branchId,
      variantId: null,
      quantity: input.quantity,
      minStock,
    }
  });
}

/**
 * GET: Consultar historial de ajustes de inventario
 */
export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['inventory:view', 'inventory:adjust', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const branchResult = await requireBranchAccess(tenant, searchParams.get('branchId') || tenant.branchId);
    if ('error' in branchResult) return branchResult.error;
    const branchId = branchResult.branchId;

    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        companyId: tenant.companyId,
        ...(branchId && { branchId }),
      },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { select: { name: true } },
        user: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(adjustments);
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener historial de ajustes' }, { status: 500 });
  }
}

/**
 * POST: Registrar un nuevo ajuste manual de inventario
 */
export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission(['inventory:adjust', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = AdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { productId, variantId, newQuantity, reason } = parsed.data;

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          id: variantId,
          productId,
          product: { companyId: tenant.companyId },
        },
        select: { id: true },
      });

      if (!variant) {
        return NextResponse.json({ error: 'La variante no pertenece al producto o empresa actual' }, { status: 400 });
      }
    }

    // Identificar sucursal destino
    let branchId = tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      if (!mainBranch) return NextResponse.json({ error: 'No hay sucursal activa' }, { status: 400 });
      branchId = mainBranch.id;
    }

    // Proceso Atómico
    const adjustment = await prisma.$transaction(async (tx) => {
      // 1. Verificar existencia y pertenencia del producto
      const product = await tx.product.findUnique({
        where: { id: productId, companyId: tenant.companyId },
      });
      if (!product) throw new Error('Producto no encontrado en esta empresa');

      // 2. Obtener stock actual en esta sucursal
      const currentStock = await tx.productStock.findFirst({
        where: { 
          productId, 
          branchId, 
          variantId: variantId || null,
        }
      });

      const oldQuantity = currentStock?.quantity || 0;
      const difference = newQuantity - oldQuantity;

      if (difference === 0) throw new Error('La nueva cantidad es igual a la actual, no se requiere ajuste.');

      // 3. Crear registro de ajuste
      const newAdjustment = await tx.inventoryAdjustment.create({
        data: {
          companyId: tenant.companyId,
          branchId,
          productId,
          variantId: variantId || null,
          userId: tenant.userId,
          oldQuantity,
          newQuantity,
          difference,
          reason,
        }
      });

      // 4. Actualizar el stock físico
      await setProductStockQuantity(tx, {
        productId,
        branchId,
        variantId: variantId || null,
        quantity: newQuantity,
        minStock: 5,
      });

      return newAdjustment;
    });

    // 5. Auditoría
    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      branchId,
      action: 'INVENTORY_ADJUSTED',
      entity: 'InventoryAdjustment',
      entityId: adjustment.id,
      details: {
        productId,
        variantId,
        oldQuantity: adjustment.oldQuantity,
        newQuantity,
        difference: adjustment.difference,
        reason
      }
    });

    return NextResponse.json(adjustment, { status: 201 });
  } catch (error) {
    console.error('Error in inventory adjustment:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Error procesando el ajuste') }, { status: 500 });
  }
}
