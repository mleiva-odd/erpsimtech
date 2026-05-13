import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { logStockMovementInline } from '@/lib/inventory';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';
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

      // 2. Reincorporate stock if requested + log StockMovement (Fase 15).
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

          await logStockMovementInline(tx, {
            companyId: tenant.companyId,
            productId: saleItem.productId,
            variantId: saleItem.variantId || null,
            branchId: sale.branchId,
            type: 'RETURN_FROM_CUSTOMER',
            quantity: returnItem.quantity,
            unitCost: Number(saleItem.unitCost ?? 0),
            referenceType: 'SALE_RETURN',
            referenceId: newReturn.id,
            userId: tenant.userId,
            notes: reason,
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

      // 4. Reembolso por método de pago original + JournalEntry de devolución
      //    (verificación cruzada Fase 20+21, fixes A-1 y A-2).
      //
      //    El refund se aplica proporcional al monto retornado, repartido en
      //    los métodos del Payment original NO crediticios. El crédito ya se
      //    descontó del Customer.balance en el paso 3.
      const nonCreditPayments = sale.payments.filter((p) => p.method !== 'CREDIT');
      const totalNonCredit = nonCreditPayments.reduce(
        (acc, p) => acc + Number(p.amount),
        0,
      );

      // Distribución proporcional del totalReturnAmount sobre los pagos no-crédito.
      const refundLines: Array<{ method: string; amount: number; bankAccountId: string | null }> = [];
      if (totalNonCredit > 0) {
        for (const p of nonCreditPayments) {
          const share = (Number(p.amount) / totalNonCredit) * totalReturnAmount;
          if (share <= 0) continue;
          refundLines.push({
            method: p.method,
            amount: Math.round(share * 100) / 100,
            bankAccountId: p.bankAccountId,
          });
        }
      }

      // Para cada método: CASH → CashRegisterTransaction (si hay caja), CARD/TRANSFER → BankTransaction.
      for (const refund of refundLines) {
        if (refund.method === 'CASH') {
          if (sale.cashRegisterId) {
            await tx.cashRegisterTransaction.create({
              data: {
                cashRegisterId: sale.cashRegisterId,
                userId: tenant.userId,
                type: 'REFUND',
                amount: refund.amount,
                description: `Devolución venta ${sale.id.slice(0, 8)}: ${reason}`,
              },
            });
          }
          // Si no hay cashRegisterId, no creamos CashRegisterTransaction pero
          // SÍ generamos el asiento contable abajo.
        } else if (refund.method === 'CARD' || refund.method === 'TRANSFER') {
          // Resolver bankAccountId: prefer el del payment original, fallback al
          // primer BankAccount activo de la empresa.
          let bankAccountId: string | null = refund.bankAccountId;
          if (!bankAccountId) {
            const defaultBank = await tx.bankAccount.findFirst({
              where: { companyId: tenant.companyId, type: 'BANK_ACCOUNT', isActive: true },
            });
            bankAccountId = defaultBank?.id ?? null;
          }
          if (bankAccountId) {
            await tx.bankTransaction.create({
              data: {
                bankAccountId,
                userId: tenant.userId,
                type: 'EXPENSE',
                amount: refund.amount,
                description: `Devolución ${refund.method} venta ${sale.id.slice(0, 8)}: ${reason}`,
                reconciled: false,
              },
            });
            await tx.bankAccount.update({
              where: { id: bankAccountId },
              data: { balance: { decrement: refund.amount } },
            });
          }
        }
      }

      // 5. Asiento contable de la devolución (partida doble):
      //    DR Devoluciones sobre Ventas (4.1.02) por totalReturnAmount
      //    CR Caja (por la parte CASH) + CR Bancos (CARD/TRANSFER) + CR Clientes (por la parte CREDIT, si aplica)
      const creditProportionLocal = (() => {
        if (!sale.customerId) return 0;
        const creditPayment = sale.payments.find((p) => p.method === 'CREDIT');
        if (!creditPayment) return 0;
        return (Number(creditPayment.amount) / Number(sale.total)) * totalReturnAmount;
      })();
      const creditReturnAmount = Math.round(creditProportionLocal * 100) / 100;

      const journalLines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [
        {
          accountCode: ACCOUNTS.SALES_RETURNS,
          debit: totalReturnAmount,
          description: 'Devoluciones sobre ventas',
        },
      ];
      // CR por cada refund line
      for (const refund of refundLines) {
        const accountCode = refund.method === 'CASH' ? ACCOUNTS.CASH : ACCOUNTS.BANKS;
        journalLines.push({
          accountCode,
          credit: refund.amount,
          description: `Salida por reembolso (${refund.method})`,
        });
      }
      // CR por la parte de crédito (decrement de Customer.balance compensa el AR)
      if (creditReturnAmount > 0) {
        journalLines.push({
          accountCode: ACCOUNTS.AR,
          credit: creditReturnAmount,
          description: 'Saldo a favor del cliente',
        });
      }

      // Validación defensiva: total CR debe coincidir con DR. Si por redondeo
      // hay diff < 0.01, ajustar la última línea. Si >= 0.01, log warning.
      const sumCredit = journalLines.reduce((acc, l) => acc + (l.credit ?? 0), 0);
      const diff = totalReturnAmount - sumCredit;
      if (Math.abs(diff) > 0 && Math.abs(diff) < 0.01 && journalLines.length > 1) {
        const lastCreditLine = [...journalLines].reverse().find((l) => l.credit !== undefined);
        if (lastCreditLine) {
          lastCreditLine.credit = Math.round(((lastCreditLine.credit ?? 0) + diff) * 100) / 100;
        }
      }

      // Solo emitir asiento si hay líneas CR (sino el cuadre falla).
      if (journalLines.length > 1) {
        await createJournalEntry(tx, {
          companyId: tenant.companyId,
          branchId: sale.branchId,
          date: newReturn.createdAt,
          description: `Devolución de venta ${sale.id.slice(0, 8)} — ${reason}`,
          referenceType: 'SALE_RETURN',
          referenceId: newReturn.id,
          userId: tenant.userId,
          lines: journalLines,
        });
      }

      // 6. If full return, mark sale as cancelled
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
