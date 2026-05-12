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
    const payment = await prisma.supplierPayment.findUnique({
      where: { id: paymentId },
      include: { payable: { include: { supplier: true } } }
    });

    if (!payment || payment.payable.companyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Abono a proveedor no encontrado.' }, { status: 404 });
    }

    if (payment.status === 'VOID') {
      return NextResponse.json({ error: 'Este abono ya fue anulado anteriormente.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Marcar el pago original como VOID
      await tx.supplierPayment.update({
        where: { id: payment.id },
        data: { 
          status: 'VOID',
          notes: notes ? `${payment.notes || ''} [ANULADO: ${notes}]` : `${payment.notes || ''} [ANULADO]`
        }
      });

      // 2. Regresar la deuda al Payable
      const payable = payment.payable;
      const newPaidAmount = Number(payable.paidAmount) - Number(payment.amount);
      const newStatus = newPaidAmount <= 0 ? 'PENDING' : 'PARTIAL';

      await tx.supplierPayable.update({
        where: { id: payable.id, companyId: tenant.companyId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus
        }
      });

      // 3. Devolver el dinero al Banco Origen (Reverso)
      if (payment.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: payment.bankAccountId, companyId: tenant.companyId },
          data: { balance: { increment: payment.amount } }
        });

        await tx.bankTransaction.create({
          data: {
            bankAccountId: payment.bankAccountId,
            userId: tenant.userId,
            type: 'INCOME',
            amount: payment.amount,
            reference: `Reverso Pago Prov: ${payment.id.split('-')[0]}`,
            description: `Reintegro por Anulación de Pago a Proveedor: ${payable.supplier.name}`,
          }
        });
      }

      // 4. Asiento contrario (CRIT-1): reversamos el JournalEntry original.
      // Si no existe (pago legacy sin migrar), el script de migración cubre
      // datos históricos — no abortamos.
      const originalEntry = await tx.journalEntry.findFirst({
        where: {
          companyId: tenant.companyId,
          referenceType: 'PAYABLE_PAYMENT',
          referenceId: payment.id,
        },
        include: { reversedBy: { select: { id: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (originalEntry && originalEntry.reversedBy.length === 0) {
        await reverseJournalEntry(tx, originalEntry.id, {
          companyId: tenant.companyId,
          userId: tenant.userId,
          description: `Anulación de pago a ${payable.supplier.name}${notes ? ` — ${notes}` : ''}`,
          referenceType: 'PAYABLE_PAYMENT_REVERSE',
          referenceId: payment.id,
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Pago a proveedor anulado y saldo restituido.' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error del servidor al anular pago a proveedor.' }, { status: 500 });
  }
}
