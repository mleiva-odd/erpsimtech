import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const TransferItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive('La cantidad debe ser mayor a cero'),
});

const TransferBatchSchema = z.object({
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  items: z.array(TransferItemSchema).min(1, 'Agrega al menos un producto a la transferencia'),
  notes: z.string().optional(),
});

// List stock transfers (with logistical status)
export async function GET(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';
    
    const transfers = await prisma.stockTransfer.findMany({
      where: {
        companyId: tenant.companyId,
        ...(!isAdmin && {
          OR: [
            { fromBranchId: tenant.branchId || '' },
            { toBranchId: tenant.branchId || '' }
          ]
        })
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        user: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true } },
            variant: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(transfers);
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener traslados' }, { status: 500 });
  }
}

// Transfer stock between branches (Create Remittance)
export async function POST(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = TransferBatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { fromBranchId, toBranchId, items, notes } = parsed.data;

  // SEGURIDAD: Cada supervisor se hace cargo de su tienda
  const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';
  if (!isAdmin && fromBranchId !== tenant.branchId) {
    return NextResponse.json({ 
      error: 'No tienes permiso para enviar mercadería desde una sucursal que no es la tuya.' 
    }, { status: 403 });
  }

  if (fromBranchId === toBranchId) {
    return NextResponse.json({ error: 'El Origen y Destino no pueden ser la misma sucursal' }, { status: 400 });
  }

  try {
    const [fromBranch, toBranch] = await Promise.all([
      prisma.branch.findFirst({ where: { id: fromBranchId, companyId: tenant.companyId } }),
      prisma.branch.findFirst({ where: { id: toBranchId, companyId: tenant.companyId } }),
    ]);

    if (!fromBranch || !toBranch) {
      return NextResponse.json({ error: 'Sucursales no encontradas o sin acceso' }, { status: 404 });
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const validProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId: tenant.companyId,
      },
      select: { id: true },
    });

    if (validProducts.length !== productIds.length) {
      return NextResponse.json({ error: 'Uno o más productos no pertenecen a esta empresa' }, { status: 400 });
    }

    const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))] as string[];
    if (variantIds.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: {
          id: { in: variantIds },
          product: { companyId: tenant.companyId },
        },
        select: { id: true, productId: true },
      });

      if (variants.length !== variantIds.length) {
        return NextResponse.json({ error: 'Hay variantes fuera de esta empresa' }, { status: 400 });
      }

      const variantMap = new Map(variants.map((variant) => [variant.id, variant.productId]));
      for (const item of items) {
        if (item.variantId && variantMap.get(item.variantId) !== item.productId) {
          return NextResponse.json({ error: 'Hay variantes que no coinciden con su producto' }, { status: 400 });
        }
      }
    }

    const transfer = await prisma.$transaction(async (tx) => {
      // 1. Validar y Reservar Stock en Origen
      for (const item of items) {
        const originStock = await tx.productStock.findFirst({
          where: { productId: item.productId, branchId: fromBranchId, variantId: (item.variantId || null) as any },
          include: { product: true }
        });

        if (!originStock || originStock.quantity < item.quantity) {
          throw new Error(`Stock insuficiente para "${originStock?.product.name || 'Producto'}". Disp: ${originStock?.quantity ?? 0}`);
        }

        // Restar del origen (Mercadería sale hacia "Tránsito")
        const stockUpdate = await tx.productStock.updateMany({
          where: {
            id: originStock.id,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity } },
        });
        if (stockUpdate.count !== 1) {
          throw new Error(`El stock cambió mientras se procesaba el traslado de "${originStock.product.name}"`);
        }
      }

      // 2. Crear documento de Remisión (PENDIENTE)
      return tx.stockTransfer.create({
        data: {
          companyId: tenant.companyId,
          fromBranchId,
          toBranchId,
          userId: tenant.userId,
          reference: notes,
          status: 'PENDING',
          items: {
            create: items.map((i: any) => ({
              productId: i.productId,
              variantId: i.variantId || null,
              quantity: i.quantity
            }))
          }
        }
      });
    });

    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'STOCK_TRANSFER_SENT',
      entity: 'StockTransfer',
      entityId: transfer.id,
      details: { from: fromBranch.name, to: toBranch.name, items: items.length },
    });

    return NextResponse.json({
      message: `Guía de remisión creada. Mercadería en tránsito hacia ${toBranch.name}.`,
      transferId: transfer.id
    }, { status: 201 });
  } catch (error) {
    console.error('Transfer error:', error);
    return NextResponse.json({ error: 'Error al procesar la transferencia' }, { status: 500 });
  }
}
