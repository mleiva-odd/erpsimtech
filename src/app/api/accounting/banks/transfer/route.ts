import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAccountingEntry } from '@/lib/accounting';

export async function POST(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { sourceBankId, targetBankId, amount, reference } = await req.json();

  if (!sourceBankId || !targetBankId || sourceBankId === targetBankId) {
    return NextResponse.json({ error: 'Cuentas de origen y destino inválidas.' }, { status: 400 });
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'El monto del traslado deber ser al menos Q0.01' }, { status: 400 });
  }

  try {
    const sourceBank = await prisma.bankAccount.findFirst({
      where: { id: sourceBankId, companyId: tenant.companyId, isActive: true }
    });
    const targetBank = await prisma.bankAccount.findFirst({
      where: { id: targetBankId, companyId: tenant.companyId, isActive: true }
    });

    if (!sourceBank || !targetBank) {
      return NextResponse.json({ error: 'Una de las cuentas bancarias es inválida o inactiva.' }, { status: 404 });
    }

    if (Number(sourceBank.balance) < amount) {
      return NextResponse.json({ error: 'Fondos insuficientes en la cuenta de origen.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Descuento origen
      await tx.bankAccount.update({
        where: { id: sourceBankId },
        data: { balance: { decrement: amount } }
      });

      // 2. Incremento destino
      await tx.bankAccount.update({
        where: { id: targetBankId },
        data: { balance: { increment: amount } }
      });

      // 3. Log Origen
      const txExp = await tx.bankTransaction.create({
        data: {
          bankAccountId: sourceBankId,
          userId: tenant.userId,
          type: 'EXPENSE',
          amount,
          reference: reference || 'Traslado Saliente',
          description: `Traslado manual de fondos hacia ${targetBank.name}`,
        }
      });

      // 4. Log Destino
      const txInc = await tx.bankTransaction.create({
        data: {
          bankAccountId: targetBankId,
          userId: tenant.userId,
          type: 'INCOME',
          amount,
          reference: reference || 'Traslado Entrante',
          description: `Ingreso de traslado manual desde ${sourceBank.name}`,
        }
      });

      // 5. Asientos contables (Movimientos compensatorios)
      await createAccountingEntry(tx, {
        companyId: tenant.companyId,
        type: 'EXPENSE',
        categoryName: 'Traslados Bancarios Salientes',
        description: `Traslado a ${targetBank.name}${reference ? ` (Ref: ${reference})` : ''}`,
        amount,
        referenceType: 'BANK_TRANSFER',
        referenceId: txExp.id,
        userId: tenant.userId,
        bankTransactionId: txExp.id,
      });

      await createAccountingEntry(tx, {
        companyId: tenant.companyId,
        type: 'INCOME',
        categoryName: 'Traslados Bancarios Entrantes',
        description: `Traslado desde ${sourceBank.name}${reference ? ` (Ref: ${reference})` : ''}`,
        amount,
        referenceType: 'BANK_TRANSFER',
        referenceId: txInc.id,
        userId: tenant.userId,
        bankTransactionId: txInc.id,
      });

    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error sistémico procesando el traslado' }, { status: 500 });
  }
}
