import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requireTenant } from '@/lib/tenant';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';

const ReturnItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const ReturnSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(3, 'Debes escribir una razón válida.'),
  stockAdded: z.boolean().default(true),
  refundMethod: z.enum(['CASH', 'CARD', 'TRANSFER']).default('CASH'),
  reference: z.string().optional().nullable(),
  items: z.array(ReturnItemSchema).min(1, 'Debes indicar al menos un ítem a devolver.'),
});

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

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

    const { saleId, reason, stockAdded, refundMethod, reference, items } = parsed.data;
    const consolidatedItems = Array.from(
      items.reduce((map, item) => {
        map.set(item.saleItemId, (map.get(item.saleItemId) ?? 0) + item.quantity);
        return map;
      }, new Map<string, number>())
    ).map(([saleItemId, quantity]) => ({ saleItemId, quantity }));

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      include: {
        items: {
          include: {
            product: {
              include: {
                bundleItems: true,
              },
            },
          },
        },
        returns: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada en esta empresa.' }, { status: 404 });
    }

    if (sale.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Solo se permiten devoluciones sobre ventas completadas.' }, { status: 400 });
    }

    const branchResult = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchResult) return branchResult.error;

    const legacyReturns = sale.returns.filter((saleReturn) => saleReturn.items.length === 0 && Number(saleReturn.amount) > 0);
    if (legacyReturns.length > 0) {
      return NextResponse.json({
        error: 'Esta venta ya tiene devoluciones antiguas sin detalle. Revísala manualmente antes de procesar nuevas devoluciones.',
      }, { status: 409 });
    }

    const saleItemMap = new Map(sale.items.map((item) => [item.id, item]));
    const returnedQuantities = new Map<string, number>();

    for (const saleReturn of sale.returns) {
      for (const returnItem of saleReturn.items) {
        returnedQuantities.set(
          returnItem.saleItemId,
          (returnedQuantities.get(returnItem.saleItemId) ?? 0) + returnItem.quantity
        );
      }
    }

    const selectedItems = consolidatedItems.map((requestedItem) => {
      const saleItem = saleItemMap.get(requestedItem.saleItemId);
      if (!saleItem) {
        throw new Error('Hay ítems que no pertenecen a la venta original.');
      }

      const alreadyReturned = returnedQuantities.get(requestedItem.saleItemId) ?? 0;
      const remainingQuantity = saleItem.quantity - alreadyReturned;

      if (requestedItem.quantity > remainingQuantity) {
        throw new Error(`La devolución excede la cantidad pendiente de "${saleItem.product.name}". Pendiente: ${remainingQuantity}.`);
      }

      return {
        saleItem,
        quantity: requestedItem.quantity,
      };
    });

    const grossSelectedSubtotal = selectedItems.reduce(
      (sum, item) => sum + Number(item.saleItem.unitPrice) * item.quantity,
      0
    );

    const saleSubtotal = Number(sale.subtotal);
    const saleTotal = Number(sale.total);
    const refundRatio = saleSubtotal > 0 ? saleTotal / saleSubtotal : 1;
    const refundAmount = roundMoney(grossSelectedSubtotal * refundRatio);
    const previousRefundAmount = roundMoney(
      sale.returns.reduce((sum, saleReturn) => sum + Number(saleReturn.amount), 0)
    );

    if (refundAmount <= 0) {
      return NextResponse.json({ error: 'La devolución calculada no produce un monto válido.' }, { status: 400 });
    }

    if (roundMoney(previousRefundAmount + refundAmount) > roundMoney(saleTotal)) {
      return NextResponse.json({ error: 'La devolución excede el monto total de la venta.' }, { status: 409 });
    }

    let activeRegisterId: string | null = null;
    if (refundMethod === 'CASH') {
      const activeRegister = await prisma.cashRegister.findFirst({
        where: {
          userId: tenant.userId,
          status: 'OPEN',
          branch: { companyId: tenant.companyId },
        },
        select: { id: true },
      });

      if (!activeRegister) {
        return NextResponse.json({ error: 'Debes tener una caja abierta para procesar devoluciones en efectivo.' }, { status: 400 });
      }

      activeRegisterId = activeRegister.id;
    }

    let remainingAllocation = refundAmount;
    const allocationBase = selectedItems.map((selectedItem, index) => {
      const rawAmount = roundMoney(Number(selectedItem.saleItem.unitPrice) * selectedItem.quantity * refundRatio);
      const amount = index === selectedItems.length - 1 ? roundMoney(remainingAllocation) : rawAmount;
      remainingAllocation = roundMoney(remainingAllocation - amount);

      return {
        saleItemId: selectedItem.saleItem.id,
        quantity: selectedItem.quantity,
        amount,
      };
    });

    const transaction = await prisma.$transaction(async (tx) => {
      const newReturn = await tx.saleReturn.create({
        data: {
          saleId,
          userId: tenant.userId,
          reason,
          amount: refundAmount,
          stockAdded,
          items: {
            create: allocationBase,
          },
        },
        include: {
          items: true,
        },
      });

      if (stockAdded) {
        for (const selectedItem of selectedItems) {
          if (selectedItem.saleItem.product.isBundle) {
            for (const bundleItem of selectedItem.saleItem.product.bundleItems) {
              await tx.productStock.upsert({
                where: {
                  productId_branchId_variantId: {
                    productId: bundleItem.componentId,
                    branchId: sale.branchId,
                    variantId: bundleItem.variantId || null,
                  } as any,
                },
                update: {
                  quantity: { increment: selectedItem.quantity * bundleItem.quantity },
                },
                create: {
                  productId: bundleItem.componentId,
                  branchId: sale.branchId,
                  variantId: (bundleItem.variantId || null) as any,
                  quantity: selectedItem.quantity * bundleItem.quantity,
                  minStock: 5,
                },
              });
            }
          } else {
            await tx.productStock.upsert({
              where: {
                productId_branchId_variantId: {
                  productId: selectedItem.saleItem.productId,
                  branchId: sale.branchId,
                  variantId: selectedItem.saleItem.variantId || null,
                } as any,
              },
              update: {
                quantity: { increment: selectedItem.quantity },
              },
              create: {
                productId: selectedItem.saleItem.productId,
                branchId: sale.branchId,
                variantId: (selectedItem.saleItem.variantId || null) as any,
                quantity: selectedItem.quantity,
                minStock: 5,
              },
            });
          }
        }
      }

      if (refundMethod === 'CASH' && activeRegisterId) {
        await tx.cashRegisterTransaction.create({
          data: {
            cashRegisterId: activeRegisterId,
            userId: tenant.userId,
            type: 'REFUND',
            amount: refundAmount,
            description: `Devolución venta ${sale.id.slice(0, 8)}: ${reason}`,
            reference: reference || null,
          },
        });
      }

      return newReturn;
    });

    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      entity: 'SaleReturn',
      entityId: transaction.id,
      action: 'SALE_RETURNED',
      details: {
        saleId,
        amount: refundAmount,
        reason,
        stockAdded,
        refundMethod,
        reference,
        items: allocationBase,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ocurrió un error al procesar la devolución.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
