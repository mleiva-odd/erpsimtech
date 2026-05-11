import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { createAccountingEntry } from '@/lib/accounting';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { customerId } = await params;
  const { amount, method, reference, notes, bankAccountId } = await req.json();

  if (!amount || amount <= 0 || !method) {
    return NextResponse.json({ error: 'Monto y método de pago son obligatorios' }, { status: 400 });
  }
  
  if (!bankAccountId) {
    return NextResponse.json({ error: 'Debe seleccionar una cuenta bancaria destino' }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId: tenant.companyId },
    });

    if (!customer) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    // Validate Bank Account
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, companyId: tenant.companyId, isActive: true },
    });
    if (!bankAccount) {
      return NextResponse.json({ error: 'Cuenta bancaria inválida o inactiva' }, { status: 400 });
    }

    const remaining = Number(customer.balance);
    if (amount > remaining) {
      return NextResponse.json({ error: `El abono excede el saldo adeudado (Q${remaining.toFixed(2)})` }, { status: 400 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      // 1. Create AccountPayment (receipt of customer payment)
      const p = await tx.accountPayment.create({
        data: {
          customerId,
          userId: tenant.userId,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
          bankAccountId,
        },
      });

      // 2. Reduce Customer Balance
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: amount } },
      });
      
      // 3. Create Bank Transaction (Inflow)
      const bankTx = await tx.bankTransaction.create({
        data: {
          bankAccountId: bankAccountId,
          type: 'INCOME',
          amount: amount,
          reference: reference || `Cobro: ${customer.name.substring(0,20)}`,
          description: `Abono de Cliente: ${customer.name}`,
          userId: tenant.userId,
        }
      });
      
      // 4. Update Bank Account Balance (Increase)
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: { increment: amount } }
      });

      // 5. Register accounting entry
      await createAccountingEntry(tx, {
        companyId: tenant.companyId,
        type: 'INCOME',
        categoryName: 'Cobros a Clientes',
        description: `Abono al crédito de ${customer.name}${reference ? ` (Ref: ${reference})` : ''}`,
        amount,
        referenceType: 'CUSTOMER_PAYMENT',
        referenceId: p.id,
        userId: tenant.userId,
        bankTransactionId: bankTx.id,
      });

      return p;
    });

    return NextResponse.json({ payment, remaining: remaining - amount }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar cobro' }, { status: 500 });
  }
}
