import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id: payableId } = await params;
  const { amount, method, reference, notes, bankAccountId } = await req.json();

  if (!amount || amount <= 0 || !method) {
    return NextResponse.json({ error: 'Monto y método de pago son obligatorios' }, { status: 400 });
  }
  
  if (!bankAccountId) {
    return NextResponse.json({ error: 'Debe seleccionar una cuenta bancaria origen' }, { status: 400 });
  }

  try {
    const payable = await prisma.supplierPayable.findFirst({
      where: { id: payableId, companyId: tenant.companyId },
      include: { supplier: { select: { name: true } } },
    });

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
      // 1. Create payment
      const p = await tx.supplierPayment.create({
        data: {
          payableId,
          userId: tenant.userId,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
          bankAccountId,
        },
      });

      // 2. Update payable status
      await tx.supplierPayable.update({
        where: { id: payableId },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });
      
      // 3. Create Bank Transaction (Outflow)
      await tx.bankTransaction.create({
        data: {
          bankAccountId: bankAccountId,
          type: 'EXPENSE',
          amount: amount,
          reference: reference || `Payable: ${payable.description.substring(0,20)}`,
          description: `Pago a proveedor: ${payable.supplier.name}`,
          userId: tenant.userId,
        }
      });
      
      // 4. Update Bank Account Balance (Decrease)
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: { decrement: amount } }
      });

      // 5. Asiento contable partida doble:
      //   DR Proveedores (2.1.01) — disminuye la CxP
      //   CR Bancos (1.1.02)      — sale dinero del banco
      await createJournalEntry(tx, {
        companyId: tenant.companyId,
        branchId: tenant.branchId,
        date: p.createdAt,
        description: `Abono a ${payable.supplier.name}: ${payable.description}${reference ? ` (Ref: ${reference})` : ''}`,
        referenceType: 'PAYABLE_PAYMENT',
        referenceId: p.id,
        userId: tenant.userId,
        lines: [
          { accountCode: ACCOUNTS.AP, debit: Number(amount), description: 'Proveedores (CxP)' },
          { accountCode: ACCOUNTS.BANKS, credit: Number(amount), description: `Pago a proveedor (${method})` },
        ],
      });

      return p;
    });

    return NextResponse.json({ payment, newStatus, remaining: remaining - amount }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 });
  }
}
