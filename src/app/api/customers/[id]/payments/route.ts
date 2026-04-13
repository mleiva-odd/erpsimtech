import { NextRequest, NextResponse } from 'next/server';
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

    // 1. Verificar si hay caja abierta para ingresos en efectivo
    let activeRegisterId = null;
    if (method === 'CASH') {
       const activeRegister = await prisma.cashRegister.findFirst({
         where: { userId: tenant.userId, status: 'OPEN' },
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
      await tx.customer.update({
        where: { id: resolvedParams.id },
        data: {
          balance: { decrement: amount }
        }
      });

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
  } catch (error: any) {
    console.error('Error recording payment:', error);
    return NextResponse.json({ error: error.message || 'Error al procesar el abono' }, { status: 500 });
  }
}
