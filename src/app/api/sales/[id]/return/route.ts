import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const ReturnItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const CreateReturnSchema = z.object({
  reason: z.string().min(1, 'El motivo de devolución es obligatorio'),
  stockAdded: z.boolean().default(true),
  items: z.array(ReturnItemSchema).min(1, 'Debe seleccionar al menos un ítem'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;
  const saleId = resolvedParams.id;

  const body = await req.json();
  const parsed = CreateReturnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { reason, stockAdded, items } = parsed.data;

  try {
    // Get the sale with its items and existing returns
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      include: {
        items: { include: { returnItems: true } },
        payments: true,
      },
    });

    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    if (sale.status === 'CANCELLED') return NextResponse.json({ error: 'No se puede devolver una venta anulada.' }, { status: 400 });
    if (sale.status === 'QUOTE') return NextResponse.json({ error: 'No se puede devolver una cotización.' }, { status: 400 });

    // Validate return quantities
    let totalReturnAmount = 0;

    for (const returnItem of items) {
      const saleItem = sale.items.find(si => si.id === returnItem.saleItemId);
      if (!saleItem) {
        return NextResponse.json({ error: `Ítem ${returnItem.saleItemId} no pertenece a esta venta.` }, { status: 400 });
      }

      // Calculate already returned quantity for this item
      const alreadyReturned = saleItem.returnItems.reduce((acc, ri) => acc + ri.quantity, 0);
      const maxReturnable = saleItem.quantity - alreadyReturned;

      if (returnItem.quantity > maxReturnable) {
        return NextResponse.json({
          error: `No se pueden devolver ${returnItem.quantity} unidades del ítem. Máximo disponible: ${maxReturnable}.`,
        }, { status: 400 });
      }

      totalReturnAmount += Number(saleItem.unitPrice) * returnItem.quantity;
    }

    // Check if this return covers ALL remaining items (full return)
    const isFullReturn = sale.items.every(saleItem => {
      const alreadyReturned = saleItem.returnItems.reduce((acc, ri) => acc + ri.quantity, 0);
      const returnItemData = items.find(ri => ri.saleItemId === saleItem.id);
      const newReturn = returnItemData?.quantity || 0;
      return (alreadyReturned + newReturn) >= saleItem.quantity;
    });

    const saleReturn = await prisma.$transaction(async (tx) => {
      // 1. Create the return record
      const newReturn = await tx.saleReturn.create({
        data: {
          saleId,
          userId: tenant.userId,
          reason,
          amount: totalReturnAmount,
          stockAdded,
          items: {
            create: items.map(ri => {
              const saleItem = sale.items.find(si => si.id === ri.saleItemId)!;
              return {
                saleItemId: ri.saleItemId,
                quantity: ri.quantity,
                amount: Number(saleItem.unitPrice) * ri.quantity,
              };
            }),
          },
        },
        include: { items: true },
      });

      // 2. Reincorporate stock if requested
      if (stockAdded) {
        for (const returnItem of items) {
          const saleItem = sale.items.find(si => si.id === returnItem.saleItemId)!;
          await tx.productStock.updateMany({
            where: {
              productId: saleItem.productId,
              branchId: sale.branchId,
              variantId: saleItem.variantId || null,
            },
            data: { quantity: { increment: returnItem.quantity } },
          });
        }
      }

      // 3. If sale had credit payment, reduce customer balance
      if (sale.customerId) {
        const creditPayment = sale.payments.find(p => p.method === 'CREDIT');
        if (creditPayment) {
          // Proportional credit return
          const creditProportion = Number(creditPayment.amount) / Number(sale.total);
          const creditReturn = totalReturnAmount * creditProportion;
          if (creditReturn > 0) {
            await tx.customer.update({
              where: { id: sale.customerId },
              data: { balance: { decrement: creditReturn } },
            });
          }
        }
      }

      // 4. If full return, mark sale as cancelled
      if (isFullReturn) {
        await tx.sale.update({
          where: { id: saleId },
          data: { status: 'CANCELLED' },
        });
      }

      return newReturn;
    });

    // Audit log
    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_RETURNED',
      entity: 'SaleReturn',
      entityId: saleReturn.id,
      details: { saleId, amount: totalReturnAmount, items: items.length, isFullReturn },
    });

    return NextResponse.json(saleReturn, { status: 201 });
  } catch (error) {
    console.error('Error processing return:', error);
    const message = error instanceof Error ? error.message : 'Error al procesar la devolución';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
