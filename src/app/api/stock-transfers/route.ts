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

// List recent stock transfers (audit log)
export async function GET(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        companyId: tenant.companyId,
        action: 'STOCK_TRANSFER',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        changes: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

// Transfer stock between branches
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

    // Prepare transaction operations for all items
    const transactions = [];
    const auditDetails: any[] = [];

    for (const item of items) {
      const product = await prisma.product.findFirst({ 
        where: { id: item.productId, companyId: tenant.companyId },
        select: { id: true, name: true }
      });
      
      if (!product) throw new Error(`Producto no encontrado (ID: ${item.productId})`);

      const originStock = await prisma.productStock.findFirst({
        where: { productId: item.productId, branchId: fromBranchId, variantId: item.variantId || null },
      });

      if (!originStock || originStock.quantity < item.quantity) {
        throw new Error(`Stock insuficiente para "${product.name}". Disponible en ${fromBranch.name}: ${originStock?.quantity ?? 0}`);
      }

      // Solo deducimos del origen ("En tránsito")
      transactions.push(
        prisma.productStock.update({
          where: { id: originStock.id },
          data: { quantity: { decrement: item.quantity } },
        })
      );

      auditDetails.push({ product: product.name, qty: item.quantity });
    }

    // Create the master transfer document as PENDING
    const transferRecord = prisma.stockTransfer.create({
      data: {
        companyId: tenant.companyId,
        fromBranchId: fromBranchId,
        toBranchId: toBranchId,
        userId: tenant.userId,
        reference: notes,
        status: 'PENDING', // Mercadería en ruta
        items: {
          create: items.map((i: any) => ({
            productId: i.productId,
            variantId: i.variantId || null,
            quantity: i.quantity
          }))
        }
      }
    });

    transactions.push(transferRecord);

    // Execute everything atomically
    await prisma.$transaction(transactions);

    // Save one master audit log (Optional since we have the transfer doc now, but good for raw trails)
    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'STOCK_TRANSFER',
      entity: 'StockTransfer',
      entityId: 'BATCH',
      details: {
        from: fromBranch.name,
        to: toBranch.name,
        itemsTransferred: auditDetails.length,
        items: auditDetails,
        notes,
      },
    });

    return NextResponse.json({
      message: `Traslado de ${items.length} productos procesado con éxito de ${fromBranch.name} a ${toBranch.name}.`,
    }, { status: 201 });
  } catch (error) {
    console.error('Transfer error:', error);
    return NextResponse.json({ error: 'Error al procesar la transferencia' }, { status: 500 });
  }
}
