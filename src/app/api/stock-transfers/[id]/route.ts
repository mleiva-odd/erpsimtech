import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;
  const transferId = resolvedParams.id;
  const body = await req.json();
  const { action } = body; // 'RECEIVE' or 'CANCEL'

  if (action !== 'RECEIVE') {
    return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
  }

  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: transferId, companyId: tenant.companyId },
      include: { items: true, toBranch: true, fromBranch: true }
    });

    if (!transfer) {
      return NextResponse.json({ error: 'Traslado no encontrado.' }, { status: 404 });
    }

    if (transfer.status !== 'PENDING') {
      return NextResponse.json({ error: `El traslado ya ha sido procesado o anulado (Estado actual: ${transfer.status}).` }, { status: 400 });
    }

    const transactions = [];

    // 1. Marca como completado
    transactions.push(
      prisma.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: 'COMPLETED' }
      })
    );

    // 2. Suma inventario al almacén de destino (El de orígen ya se restó cuando se creó la transferencia)
    for (const item of transfer.items) {
      const targetStock = await prisma.productStock.findFirst({
        where: { productId: item.productId, branchId: transfer.toBranchId, variantId: item.variantId || null },
      });
      
      if (targetStock) {
         transactions.push(
            prisma.productStock.update({
               where: { id: targetStock.id },
               data: { quantity: { increment: item.quantity } }
            })
         );
      } else {
         transactions.push(
            prisma.productStock.create({
               data: {
                 productId: item.productId,
                 variantId: item.variantId || null,
                 branchId: transfer.toBranchId,
                 quantity: item.quantity,
                 minStock: 5
               }
            })
         );
      }
    }

    await prisma.$transaction(transactions);

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      entity: 'StockTransfer',
      entityId: transfer.id,
      action: 'STOCK_RECEIVED',
      details: { 
        transferId: transfer.id,
        itemsReceived: transfer.items.length 
      }
    });

    return NextResponse.json({ message: `¡Carga verificada y recibida exitosamente en ${transfer.toBranch.name}!` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error procesando recepción.' }, { status: 500 });
  }
}
