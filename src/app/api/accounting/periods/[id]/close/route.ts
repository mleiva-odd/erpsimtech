import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireOperationalPermission } from '@/lib/tenant';
import { ACCOUNTS, createJournalEntry, JournalError } from '@/lib/accounting';

/**
 * POST /api/accounting/periods/[id]/close — cierra un período contable.
 *
 * Pasos:
 *   1. Validar que no haya JournalEntry DRAFT (posted=false) en el período.
 *   2. Calcular saldo neto de cuentas INCOME y EXPENSE del período.
 *   3. Generar un asiento de cierre que transfiere ese neto a Utilidad del
 *      Ejercicio (3.2.02):
 *        - Ingresos (cuentas tipo INCOME, balance natural CR) → DR Ingresos
 *        - Egresos  (cuentas tipo EXPENSE, balance natural DR) → CR Egresos
 *        - Diferencia → CR Utilidad del Ejercicio (si hubo ganancia)
 *                      → DR Utilidad del Ejercicio (si hubo pérdida)
 *   4. Marcar el período como CLOSED.
 *
 * Una vez cerrado, ningún nuevo asiento puede tener fecha dentro del período
 * (createJournalEntry retorna 409).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const period = await prisma.accountingPeriod.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!period) {
      return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
    }
    if (period.status === 'CLOSED') {
      return NextResponse.json({ error: 'El período ya está cerrado.' }, { status: 400 });
    }

    // 1. Bloquear si hay drafts
    const draftCount = await prisma.journalEntry.count({
      where: { periodId: period.id, posted: false },
    });
    if (draftCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede cerrar: ${draftCount} asiento(s) en estado DRAFT. Publicalos o eliminálos antes de cerrar.`,
        },
        { status: 409 },
      );
    }

    // 2. Calcular netos de INCOME y EXPENSE
    const lines = await prisma.journalLine.findMany({
      where: {
        journal: { periodId: period.id, companyId: tenant.companyId, posted: true },
        account: { type: { in: ['INCOME', 'EXPENSE'] } },
      },
      include: { account: { select: { id: true, code: true, type: true } } },
    });

    // Agrupar por cuenta para hacer un solo movimiento por cuenta en el asiento
    type Balance = { code: string; type: 'INCOME' | 'EXPENSE'; debit: number; credit: number };
    const byAccount = new Map<string, Balance>();
    for (const l of lines) {
      const key = l.account.code;
      const b = byAccount.get(key) ?? {
        code: l.account.code,
        type: l.account.type as 'INCOME' | 'EXPENSE',
        debit: 0,
        credit: 0,
      };
      b.debit += Number(l.debit);
      b.credit += Number(l.credit);
      byAccount.set(key, b);
    }

    const closingLines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];
    let totalIncome = 0;
    let totalExpense = 0;
    for (const b of byAccount.values()) {
      if (b.type === 'INCOME') {
        // Cuentas de ingresos tienen balance natural CR (credit − debit > 0).
        const balance = b.credit - b.debit;
        if (Math.abs(balance) < 0.005) continue;
        totalIncome += balance;
        // Cierre invierte: DR para llevarlo a 0
        closingLines.push({
          accountCode: b.code,
          debit: balance > 0 ? balance : 0,
          credit: balance < 0 ? -balance : 0,
          description: 'Cierre del período',
        });
      } else {
        // Cuentas de egresos tienen balance natural DR (debit − credit > 0).
        const balance = b.debit - b.credit;
        if (Math.abs(balance) < 0.005) continue;
        totalExpense += balance;
        // Cierre invierte: CR para llevarlo a 0
        closingLines.push({
          accountCode: b.code,
          credit: balance > 0 ? balance : 0,
          debit: balance < 0 ? -balance : 0,
          description: 'Cierre del período',
        });
      }
    }

    const netResult = totalIncome - totalExpense;
    if (Math.abs(netResult) >= 0.005) {
      // Si neto > 0 → utilidad → CR Utilidad del Ejercicio
      // Si neto < 0 → pérdida → DR Utilidad del Ejercicio
      if (netResult > 0) {
        closingLines.push({
          accountCode: ACCOUNTS.CURRENT_EARNINGS,
          credit: netResult,
          description: 'Utilidad del ejercicio (cierre)',
        });
      } else {
        closingLines.push({
          accountCode: ACCOUNTS.CURRENT_EARNINGS,
          debit: -netResult,
          description: 'Pérdida del ejercicio (cierre)',
        });
      }
    }

    // 3. Persistir asiento de cierre + marcar período CLOSED
    const closingDate = new Date(Date.UTC(period.year, period.month - 1, 28, 23, 59, 59));
    await prisma.$transaction(async (tx) => {
      if (closingLines.length >= 2) {
        await createJournalEntry(tx, {
          companyId: tenant.companyId,
          date: closingDate,
          description: `Cierre del período ${period.year}-${String(period.month).padStart(2, '0')}`,
          referenceType: 'PERIOD_CLOSE',
          referenceId: period.id,
          userId: tenant.userId,
          posted: true,
          lines: closingLines,
        });
      }
      await tx.accountingPeriod.update({
        where: { id: period.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: tenant.userId,
        },
      });
    });

    return NextResponse.json({
      success: true,
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        status: 'CLOSED',
        totalIncome,
        totalExpense,
        netResult,
      },
    });
  } catch (error) {
    if (error instanceof JournalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma error closing period:', error);
    } else {
      console.error('Error closing period:', error);
    }
    return NextResponse.json({ error: 'Error al cerrar el período' }, { status: 500 });
  }
}
