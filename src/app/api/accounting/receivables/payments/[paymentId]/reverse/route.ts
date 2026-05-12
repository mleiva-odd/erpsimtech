import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { reverseJournalEntry } from '@/lib/accounting';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { paymentId } = await params;
  const { notes } = await req.json().catch(() => ({ notes: '' }));

  try {
    const payment = await prisma.accountPayment.findUnique({
      where: { id: paymentId },
      include: { customer: true, bankAccount: true }
    });

    if (!payment || payment.customer.companyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
    }

    if (payment.status === 'VOID') {
      return NextResponse.json({ error: 'Este abono ya fue anulado anteriormente.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Marcar el pago original como VOID
      await tx.accountPayment.update({
        where: { id: payment.id },
        data: { 
          status: 'VOID',
          notes: notes ? `${payment.notes || ''} [ANULADO: ${notes}]` : `${payment.notes || ''} [ANULADO]`
        }
      });

      // 2. Regresar la deuda al cliente
      await tx.customer.update({
        where: { id: payment.customerId, companyId: tenant.companyId },
        data: { balance: { increment: payment.amount } }
      });

      // 3. Extraer el dinero del Banco Destino (Reverso)
      if (payment.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: payment.bankAccountId, companyId: tenant.companyId },
          data: { balance: { decrement: payment.amount } }
        });

        await tx.bankTransaction.create({
          data: {
            bankAccountId: payment.bankAccountId,
            userId: tenant.userId,
            type: 'EXPENSE',
            amount: payment.amount,
            reference: `Reverso Abono: ${payment.id.split('-')[0]}`,
            description: `Anulación de Abono de Cliente: ${payment.customer.name}`,
          }
        });
      }

      // 4. Asiento contrario (CRIT-1): reversamos el JournalEntry original.
      // Si no existe (cobro legacy sin migrar), el script de migración cubre
      // datos históricos — no abortamos.
      const originalEntry = await tx.journalEntry.findFirst({
        where: {
          companyId: tenant.companyId,
          referenceType: 'CUSTOMER_PAYMENT',
          referenceId: payment.id,
        },
        include: { reversedBy: { select: { id: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (originalEntry && originalEntry.reversedBy.length === 0) {
        await reverseJournalEntry(tx, originalEntry.id, {
          companyId: tenant.companyId,
          userId: tenant.userId,
          description: `Anulación de cobro a ${payment.customer.name}${notes ? ` — ${notes}` : ''}`,
          referenceType: 'CUSTOMER_PAYMENT_REVERSE',
          referenceId: payment.id,
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Abono anulado exitosamente y deuda restituida.' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error del servidor al anular pago.' }, { status: 500 });
  }
}
