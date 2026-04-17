import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const PaymentSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a cero'),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * GET: Obtener historial de abonos de un cliente
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const payments = await prisma.accountPayment.findMany({
      where: {
        customerId: resolvedParams.id,
        customer: { companyId: tenant.companyId }
      },
      include: {
        user: { select: { name: true } },
        cashRegister: { select: { branch: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(payments);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

/**
 * POST: Registrar un nuevo abono a cuenta por cobrar
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const body = await req.json();
    const parsed = PaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { amount, method, reference, notes } = parsed.data;
    const guardedAmount = new Prisma.Decimal(amount);

    // 1. Verificar si hay caja abierta para ingresos en efectivo
    let activeRegisterId = null;
    if (method === 'CASH') {
       const activeRegister = await prisma.cashRegister.findFirst({
         where: {
           userId: tenant.userId,
           status: 'OPEN',
           branch: { companyId: tenant.companyId },
         },
       });
       if (!activeRegister) {
         return NextResponse.json({ error: 'No tienes un turno de caja abierto para recibir pagos en efectivo.' }, { status: 400 });
       }
       activeRegisterId = activeRegister.id;
    }

    // 2. Transacción Atómica
    const payment = await prisma.$transaction(async (tx) => {
      // Verificar cliente y saldo actual
      const customer = await tx.customer.findUnique({
        where: { id: resolvedParams.id, companyId: tenant.companyId }
      });

      if (!customer) throw new Error('Cliente no encontrado');
      if (Number(customer.balance) < amount) {
        throw new Error('El abono supera el saldo deudor del cliente');
      }

      // Crear el registro de abono
      const newPayment = await tx.accountPayment.create({
        data: {
          customerId: resolvedParams.id,
          userId: tenant.userId,
          cashRegisterId: activeRegisterId,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
        }
      });

      // Actualizar saldo del cliente (disminuye la deuda)
      const balanceUpdate = await tx.customer.updateMany({
        where: {
          id: resolvedParams.id,
          companyId: tenant.companyId,
          balance: { gte: guardedAmount },
        },
        data: {
          balance: { decrement: amount }
        }
      });

      if (balanceUpdate.count !== 1) {
        throw new Error('El saldo cambió mientras se procesaba el abono. Intenta de nuevo.');
      }

      return newPayment;
    });

    // 3. Auditoría
    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'CUSTOMER_PAYMENT_RECORDED',
      entity: 'AccountPayment',
      entityId: payment.id,
      details: {
        amount,
        method,
        customerId: resolvedParams.id,
        newBalance: 'updated'
      }
    });

    return NextResponse.json(payment, { status: 201 });
    } catch (error) {
      console.error('Error recording payment:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Error al procesar el abono') }, { status: 500 });
  }
}
