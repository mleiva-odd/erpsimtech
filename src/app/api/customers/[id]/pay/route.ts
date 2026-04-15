import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const PaySchema = z.object({
  amount: z.number().positive('El monto a abonar debe ser mayor a 0'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;
  const body = await req.json();
  const parsed = PaySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { amount } = parsed.data;

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    if (Number(customer.balance) < amount) {
      return NextResponse.json({ error: 'El abono supera el saldo deudor del cliente' }, { status: 400 });
    }

    const activeRegister = await prisma.cashRegister.findFirst({
      where: { userId: tenant.userId, status: 'OPEN' },
      select: { id: true },
    });

    if (!activeRegister) {
      return NextResponse.json({ error: 'Debes tener una caja abierta para registrar abonos en efectivo' }, { status: 400 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Actualizamos el balance del cliente restando el abono con guardia transaccional
      const balanceUpdate = await tx.customer.updateMany({
        where: {
          id: resolvedParams.id,
          companyId: tenant.companyId,
          balance: { gte: amount as any },
        },
        data: {
          balance: {
            decrement: amount
          }
        }
      });

      if (balanceUpdate.count !== 1) {
        throw new Error('El saldo cambió mientras se procesaba el abono. Intenta de nuevo.');
      }

      const updatedCustomer = await tx.customer.findUnique({
        where: { id: resolvedParams.id },
      });
      if (!updatedCustomer) {
        throw new Error('Cliente no encontrado tras aplicar el abono.');
      }

      // 2. Crear el registro legal de Abono (AccountPayment)
      const payment = await (tx as any).accountPayment.create({
        data: {
          amount,
          customerId: customer.id,
          userId: tenant.userId,
          cashRegisterId: activeRegister.id,
          method: 'CASH', // Valor por defecto
          reference: 'Abono en Caja'
        }
      });

      return { updatedCustomer, payment };
    });

    // Registrar en el log de auditoría
    await prisma.auditLog.create({
      data: {
        companyId: tenant.companyId,
        userId: tenant.userId,
        entity: 'AccountPayment',
        entityId: transactionResult.payment.id,
        action: 'PAYMENT_RECEIVED',
        changes: { amount, oldBalance: customer.balance, newBalance: transactionResult.updatedCustomer.balance }
      }
    });

    return NextResponse.json(transactionResult.updatedCustomer, { status: 200 });
  } catch (error) {
    console.error('Error registrando abono:', error);
    return NextResponse.json({ error: 'Error procesando el abono' }, { status: 500 });
  }
}
