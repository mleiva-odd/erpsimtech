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
    });

    if (!activeRegister) {
      return NextResponse.json({ error: 'No hay turno de caja abierto para registrar egresos' }, { status: 400 });
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
