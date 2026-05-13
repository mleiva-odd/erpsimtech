import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';
import {
  getExchangeRate,
  toFunctionalAmount,
  normalizeCurrency,
  calculateFxDifference,
  ExchangeRateError,
} from '@/lib/currency';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id: payableId } = await params;
  const { amount, method, reference, notes, bankAccountId, currency: bodyCurrency } = await req.json();

  if (!amount || amount <= 0 || !method) {
    return NextResponse.json({ error: 'Monto y método de pago son obligatorios' }, { status: 400 });
  }
  
  if (!bankAccountId) {
    return NextResponse.json({ error: 'Debe seleccionar una cuenta bancaria origen' }, { status: 400 });
  }

  try {
    const payable = (await prisma.supplierPayable.findFirst({
      where: { id: payableId, companyId: tenant.companyId },
      include: {
        supplier: { select: { name: true } },
        purchase: ({ select: { currency: true, exchangeRate: true } } as never),
      } as never,
    })) as unknown as
      | {
          id: string;
          totalAmount: unknown;
          paidAmount: unknown;
          description: string;
          supplier: { name: string };
          purchase?: { currency?: string | null; exchangeRate?: unknown } | null;
        }
      | null;

    if (!payable) return NextResponse.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 });

    // Validate Bank Account
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, companyId: tenant.companyId, isActive: true },
    });
    if (!bankAccount) {
      return NextResponse.json({ error: 'Cuenta bancaria inválida o inactiva' }, { status: 400 });
    }
    
    // Validate we have enough balance if strictly desired, but in many systems balance goes negative if overdraft.
    // We will allow it for now, but deduct it in BankTransaction.

    const remaining = Number(payable.totalAmount) - Number(payable.paidAmount);
    if (amount > remaining) {
      return NextResponse.json({ error: `El abono excede el saldo pendiente (Q${remaining.toFixed(2)})` }, { status: 400 });
    }

    const newPaidAmount = Number(payable.paidAmount) + amount;
    const newStatus = newPaidAmount >= Number(payable.totalAmount) ? 'PAID' : 'PARTIAL';

    const payment = await prisma.$transaction(async (tx) => {
      // Fase 21 · Multi-moneda. Resolver currency del pago:
      //   1) body.currency si vino,
      //   2) la currency de la PO/SupplierInvoice de origen,
      //   3) GTQ.
      // originalRate = snapshot al emitir la PO. currentRate = rate vigente.
      const resolvedCurrency = normalizeCurrency(
        bodyCurrency ?? payable.purchase?.currency ?? 'GTQ',
      );
      const originalRate = payable.purchase?.exchangeRate != null
        ? Number(payable.purchase.exchangeRate)
        : null;

      const currentRate = await getExchangeRate(
        tx as unknown as Parameters<typeof getExchangeRate>[0],
        tenant.companyId,
        resolvedCurrency,
        new Date(),
      );
      const paymentFunctional = toFunctionalAmount(Number(amount), currentRate);

      // 1. Create payment con snapshot del rate vigente.
      const p = await tx.supplierPayment.create({
        data: ({
          payableId,
          userId: tenant.userId,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
          bankAccountId,
          currency: resolvedCurrency,
          exchangeRate: currentRate,
          functionalAmount: paymentFunctional,
        } as never),
      });

      // 2. Update payable status
      await tx.supplierPayable.update({
        where: { id: payableId },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });

      // 3. Create Bank Transaction (Outflow)
      await tx.bankTransaction.create({
        data: ({
          bankAccountId: bankAccountId,
          type: 'EXPENSE',
          amount: amount,
          reference: reference || `Payable: ${payable.description.substring(0,20)}`,
          description: `Pago a proveedor: ${payable.supplier.name}`,
          userId: tenant.userId,
          currency: resolvedCurrency,
          exchangeRate: currentRate,
          functionalAmount: paymentFunctional,
        } as never),
      });

      // 4. Update Bank Account Balance (Decrease, en la moneda nativa)
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: { decrement: amount } }
      });

      // 5. Asiento contable partida doble (en GTQ funcional):
      //   DR Proveedores (2.1.01) — disminuye la CxP por el equivalente
      //     GTQ ORIGINAL (rate al emitir la PO).
      //   CR Bancos (1.1.02)      — sale dinero del banco por el equivalente
      //     GTQ ACTUAL (rate de hoy).
      //   DR/CR Diferencia cambiaria (FX_LOSS o FX_GAIN) según corresponda.
      //
      // PAYMENT side: rate sube → pagamos más GTQ → LOSS.
      const effectiveOriginalRate = originalRate ?? currentRate;
      const apOriginalAmount =
        Math.round(Number(amount) * effectiveOriginalRate * 100) / 100;
      const fx = calculateFxDifference({
        originalRate: effectiveOriginalRate,
        currentRate,
        foreignAmount: Number(amount),
        side: 'PAYMENT',
        currency: resolvedCurrency,
      });

      const journalLines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        description?: string;
      }> = [
        { accountCode: ACCOUNTS.AP, debit: apOriginalAmount, description: 'Proveedores (CxP)' },
        { accountCode: ACCOUNTS.BANKS, credit: paymentFunctional, description: `Pago a proveedor (${method})` },
      ];
      if (fx.gain > 0) {
        journalLines.push({
          accountCode: ACCOUNTS.FX_GAIN,
          credit: fx.gain,
          description: `Diferencia cambiaria positiva (${resolvedCurrency})`,
        });
      } else if (fx.loss > 0) {
        journalLines.push({
          accountCode: ACCOUNTS.FX_LOSS,
          debit: fx.loss,
          description: `Diferencia cambiaria negativa (${resolvedCurrency})`,
        });
      }

      await createJournalEntry(tx, {
        companyId: tenant.companyId,
        branchId: tenant.branchId,
        date: p.createdAt,
        description: `Abono a ${payable.supplier.name}: ${payable.description}${reference ? ` (Ref: ${reference})` : ''}`,
        referenceType: 'PAYABLE_PAYMENT',
        referenceId: p.id,
        userId: tenant.userId,
        lines: journalLines,
      });

      return p;
    });

    return NextResponse.json({ payment, newStatus, remaining: remaining - amount }, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof ExchangeRateError) {
      return NextResponse.json(
        { error: error.message, code: 'EXCHANGE_RATE_NOT_FOUND' },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 });
  }
}
