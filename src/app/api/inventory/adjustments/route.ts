import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const AdjustmentSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  newQuantity: z.number().int().min(0, 'La cantidad no puede ser negativa'),
  reason: z.string().min(2, 'El motivo es obligatorio'),
});

/**
 * GET: Consultar historial de ajustes de inventario
 */
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get('branchId') || tenant.branchId;

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
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = AdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { productId, variantId, newQuantity, reason } = parsed.data;

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
          variantId: (variantId || null) as string 
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
          variantId: (variantId || null) as string,
          userId: tenant.userId,
          oldQuantity,
          newQuantity,
          difference,
          reason,
        }
      });

      // 4. Actualizar el stock físico
      await tx.productStock.upsert({
        where: { 
          productId_branchId_variantId: { 
            productId, 
            branchId, 
            variantId: (variantId || null) as string 
          } 
        },
        update: { quantity: newQuantity },
        create: {
          productId,
          branchId,
          variantId: (variantId || null) as string,
          quantity: newQuantity,
          minStock: 5 // Default
        }
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
  } catch (error: any) {
    console.error('Error in inventory adjustment:', error);
    return NextResponse.json({ error: error.message || 'Error procesando el ajuste' }, { status: 500 });
  }
}
