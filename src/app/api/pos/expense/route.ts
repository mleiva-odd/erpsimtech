import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const ExpenseSchema = z.object({
  amount: z.number().positive('El monto debe ser numérico y mayor a 0'),
  description: z.string().min(3, 'Debes proveer una descripción detallada'),
  type: z.enum(['EXPENSE', 'WITHDRAWAL', 'REFUND']).default('EXPENSE'),
});

export async function POST(req: NextRequest) {
  const result = await requireRole('CASHIER');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = ExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { amount, description, type } = parsed.data;

    // Obtener caja abierta
    const activeRegister = await prisma.cashRegister.findFirst({
      where: {
        userId: tenant.userId,
        status: 'OPEN',
        branch: { companyId: tenant.companyId },
      },
      orderBy: { openedAt: 'desc' },
      include: {
        sales: {
          include: { payments: true }
        },
        transactions: true,
        customerPayments: true,
      },
    });

    if (!activeRegister) {
      return NextResponse.json({ error: 'No hay turno de caja abierto para registrar egresos' }, { status: 400 });
    }

    const cashPayments = activeRegister.sales
      .flatMap((sale) => sale.payments)
      .filter((payment) => payment.method === 'CASH')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const cashAbonos = activeRegister.customerPayments
      .filter((payment) => payment.method === 'CASH')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const totalExpenses = activeRegister.transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const availableCash = Number(activeRegister.openingBalance) + cashPayments + cashAbonos - totalExpenses;

    if (amount > availableCash + 0.05) {
      return NextResponse.json({
        error: `Fondos insuficientes en caja. Disponible: Q${availableCash.toFixed(2)}, solicitado: Q${amount.toFixed(2)}.`,
      }, { status: 400 });
    }

    // Registrar egreso de caja
    const transaction = await prisma.cashRegisterTransaction.create({
      data: {
        cashRegisterId: activeRegister.id,
        userId: tenant.userId,
        type: type,
        amount: amount,
        description: description,
      }
    });

    createAuditLog({
      companyId: tenant.companyId,
      branchId: activeRegister.branchId,
      userId: tenant.userId,
      action: 'CASH_TRANSACTION_RECORDED',
      entity: 'CashRegisterTransaction',
      entityId: transaction.id,
      details: { amount, description, type },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error('Error registrando egreso de caja:', error);
    return NextResponse.json({ error: 'Hubo un error del servidor al intentar guardar el egreso' }, { status: 500 });
  }
}
