import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';

/**
 * Gestión individual de Remisiones (Detalle, Recepción y Anulación)
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: params.id, companyId: tenant.companyId },
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
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: params.id, companyId: tenant.companyId },
      include: { items: true }
    });

    if (!transfer) return NextResponse.json({ error: 'Traslado no encontrado' }, { status: 404 });
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Este traslado ya no se puede modificar' }, { status: 400 });

    // SEGURIDAD: Cada supervisor se hace cargo de su propia tienda (Recepción)
    const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';
    if (!isAdmin && transfer.toBranchId !== tenant.branchId) {
      return NextResponse.json({ 
        error: 'No tienes permiso para recibir mercadería en una sucursal que no es la tuya.' 
      }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Marcar como completado
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: 'COMPLETED' }
      });

      // 2. Incrementar stock en destino para cada item
      for (const item of transfer.items) {
        // Usamos upsert por si el producto aún no tiene registro en la sucursal de destino
        await tx.productStock.upsert({
          where: {
            productId_branchId_variantId: {
              productId: item.productId,
              branchId: transfer.toBranchId,
              variantId: item.variantId || null
            }
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            productId: item.productId,
            branchId: transfer.toBranchId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            minStock: 5 // Valor por defecto inicial
          }
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
  } catch (error) {
    console.error('Reception error:', error);
    return NextResponse.json({ error: 'Error al procesar la recepción' }, { status: 500 });
  }
}

/**
 * Anular Traslado (Revertir Stock al Origen)
 * Solo el supervisor de ORIGEN o el Gerente pueden anular.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: params.id, companyId: tenant.companyId },
      include: { items: true }
    });

    if (!transfer) return NextResponse.json({ error: 'Traslado no encontrado' }, { status: 404 });
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Solo se pueden anular traslados pendientes' }, { status: 400 });

    const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';
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
        await tx.productStock.update({
          where: {
            productId_branchId_variantId: {
              productId: item.productId,
              branchId: transfer.fromBranchId,
              variantId: item.variantId || null
            }
          },
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
