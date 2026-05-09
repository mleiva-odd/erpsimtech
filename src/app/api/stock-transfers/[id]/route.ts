import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import type { TenantContext } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';

async function incrementProductStock(tx: Prisma.TransactionClient, input: {
  productId: string;
  branchId: string;
  variantId: string | null;
  quantity: number;
}) {
  if (input.variantId) {
    await tx.productStock.upsert({
      where: {
        productId_branchId_variantId: {
          productId: input.productId,
          branchId: input.branchId,
          variantId: input.variantId,
        }
      },
      update: { quantity: { increment: input.quantity } },
      create: {
        productId: input.productId,
        branchId: input.branchId,
        variantId: input.variantId,
        quantity: input.quantity,
        minStock: 5,
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
      data: { quantity: { increment: input.quantity } },
    });
    return;
  }

  await tx.productStock.create({
    data: {
      productId: input.productId,
      branchId: input.branchId,
      variantId: null,
      quantity: input.quantity,
      minStock: 5,
    }
  });
}

async function receiveTransfer(transferId: string, tenant: TenantContext) {
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id: transferId, companyId: tenant.companyId },
    include: { items: true }
  });

  if (!transfer) return NextResponse.json({ error: 'Traslado no encontrado' }, { status: 404 });
  if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Este traslado ya no se puede modificar' }, { status: 400 });

  const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');
  if (!isAdmin && transfer.toBranchId !== tenant.branchId) {
    return NextResponse.json({
      error: 'No tienes permiso para recibir mercadería en una sucursal que no es la tuya.'
    }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: 'COMPLETED' }
    });

    for (const item of transfer.items) {
      await incrementProductStock(tx, {
        productId: item.productId,
        branchId: transfer.toBranchId,
        variantId: item.variantId || null,
        quantity: item.quantity,
      });
    }
  });

  createAuditLog({
    companyId: tenant.companyId,
    userId: tenant.userId,
    action: 'STOCK_TRANSFER_RECEIVED',
    entity: 'StockTransfer',
    entityId: transfer.id,
    details: { from: transfer.fromBranchId, to: transfer.toBranchId }
  });

  return NextResponse.json({ message: 'Mercadería recibida y cargada al inventario local exitosamente.' });
}

/**
 * Gestión individual de Remisiones (Detalle, Recepción y Anulación)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAnyPermission(['inventory:transfer', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: id, companyId: tenant.companyId },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true, barcode: true } },
            variant: { select: { name: true } }
          }
        },
        user: { select: { name: true } }
      }
    });

    if (!transfer) return NextResponse.json({ error: 'Traslado no encontrado' }, { status: 404 });

    return NextResponse.json(transfer);
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener el detalle' }, { status: 500 });
  }
}

/**
 * Confirmar Recepción de Mercadería
 * Solo el supervisor de la sucursal de DESTINO puede confirmar.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireOperationalPermission(['inventory:transfer', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    return await receiveTransfer(id, tenant);
  } catch (error) {
    console.error('Reception error:', error);
    return NextResponse.json({ error: 'Error al procesar la recepción' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return PUT(req, { params });
}

/**
 * Anular Traslado (Revertir Stock al Origen)
 * Solo el supervisor de ORIGEN o el Gerente pueden anular.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireOperationalPermission(['inventory:transfer', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: id, companyId: tenant.companyId },
      include: { items: true }
    });

    if (!transfer) return NextResponse.json({ error: 'Traslado no encontrado' }, { status: 404 });
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Solo se pueden anular traslados pendientes' }, { status: 400 });

    const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');
    if (!isAdmin && transfer.fromBranchId !== tenant.branchId) {
      return NextResponse.json({ 
        error: 'No tienes permiso para anular un envío que no se originó en tu sucursal.' 
      }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Marcar como cancelado
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: 'CANCELLED' }
      });

      // 2. Regresar stock al origen
      for (const item of transfer.items) {
        const originStock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchId: transfer.fromBranchId,
            variantId: item.variantId || null,
          },
          select: { id: true },
        });

        if (!originStock) {
          throw new Error('No se encontró el stock de origen para revertir el traslado.');
        }

        await tx.productStock.update({
          where: { id: originStock.id },
          data: { quantity: { increment: item.quantity } }
        });
      }
    });

    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'STOCK_TRANSFER_CANCELLED',
      entity: 'StockTransfer',
      entityId: transfer.id,
      details: { reason: 'Anulado por usuario' }
    });

    return NextResponse.json({ message: 'Traslado anulado exitosamente. La mercadería ha vuelto al inventario de origen.' });
  } catch (error) {
    console.error('Cancellation error:', error);
    return NextResponse.json({ error: 'Error al anular el traslado' }, { status: 500 });
  }
}
