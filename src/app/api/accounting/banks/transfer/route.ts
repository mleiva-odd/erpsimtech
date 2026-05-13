import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
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

    // Fase 21 · Multi-moneda: bloqueamos transferencias entre cuentas con
    // monedas distintas. La conversión cross-currency requiere un asiento
    // doble manual (DR Bancos destino / CR Bancos origen + DR/CR FX_GAIN/LOSS)
    // que el flujo automático de transfer no contempla aún.
    if (
      (sourceBank.currency ?? 'GTQ').toUpperCase() !==
      (targetBank.currency ?? 'GTQ').toUpperCase()
    ) {
      return NextResponse.json(
        {
          error:
            'Las cuentas tienen monedas diferentes; usá conversión manual con asiento doble.',
          code: 'CURRENCY_MISMATCH',
          sourceCurrency: sourceBank.currency,
          targetCurrency: targetBank.currency,
        },
        { status: 400 },
      );
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

      // 5. Asiento contable partida doble:
      //   DR Bancos (destino) / CR Bancos (origen)
      // Como ambas piernas usan la misma cuenta del plan (1.1.02 Bancos), el
      // detalle por sub-cuenta bancaria queda en `description`. Cuando Fase 22
      // introduzca sub-cuentas hoja por banco, esto se reescribe.
      await createJournalEntry(tx, {
        companyId: tenant.companyId,
        date: txInc.createdAt,
        description: `Traslado bancario: ${sourceBank.name} → ${targetBank.name}${reference ? ` (Ref: ${reference})` : ''}`,
        referenceType: 'BANK_TRANSFER',
        referenceId: txInc.id,
        userId: tenant.userId,
        lines: [
          { accountCode: ACCOUNTS.BANKS, debit: amount, description: `Ingreso a ${targetBank.name}` },
          { accountCode: ACCOUNTS.BANKS, credit: amount, description: `Salida de ${sourceBank.name}` },
        ],
      });

    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error sistémico procesando el traslado' }, { status: 500 });
  }
}
