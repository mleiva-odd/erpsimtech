import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';

const ReturnSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(3, 'Debes escribir una razón válida.'),
  amount: z.number().positive(),
  stockAdded: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = ReturnSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { saleId, reason, amount, stockAdded } = parsed.data;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      include: { items: { include: { product: { include: { bundleItems: true } } } } }
    });

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada en esta empresa.' }, { status: 404 });
    }

    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Create Return record
      const newReturn = await tx.saleReturn.create({
        data: {
          saleId,
          userId: tenant.userId,
          reason,
          amount,
          stockAdded,
        }
      });

      // 2. Return physical stock to the assigned branch of the sale
      if (stockAdded && sale.status === 'COMPLETED') {
         for (const item of sale.items) {
             const product = item.product as any; // Cast to avoid typed errors on old cache
             
             if (product.isBundle) {
                 for (const bundleItem of product.bundleItems) {
                    await tx.productStock.updateMany({
                       where: { productId: bundleItem.componentId, branchId: sale.branchId, variantId: (null as any) },
                       data: { quantity: { increment: item.quantity * bundleItem.quantity } }
                    });
                 }
             } else {
                 await tx.productStock.updateMany({
                    where: { productId: item.productId, branchId: sale.branchId, variantId: item.variantId },
                    data: { quantity: { increment: item.quantity } }
                 });
             }
         }
      }

      // 3. Mark sale as canceled if amount == sale.total ideally, but we'll leave that logic flexibly for later
      
      return newReturn;
    });

    // 4. Record Audit Log
    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      entity: 'SaleReturn',
      entityId: transaction.id,
      action: 'SALE_RETURNED',
      details: { saleId, amount, reason }
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Ocurrió un error al procesar la devolución.' }, { status: 500 });
  }
}
