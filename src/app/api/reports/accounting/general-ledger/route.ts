import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/**
 * GET /api/reports/accounting/general-ledger?accountCode=...
 *
 * Libro Mayor por cuenta: lista cronológica de movimientos de una cuenta
 * con saldo running.
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const accountCode = searchParams.get('accountCode');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const postedOnly = searchParams.get('posted') !== 'false';

  if (!accountCode) {
    return NextResponse.json({ error: 'accountCode requerido' }, { status: 400 });
  }

  const account = await prisma.chartOfAccount.findUnique({
    where: { companyId_code: { companyId: tenant.companyId, code: accountCode } },
    select: { id: true, code: true, name: true, type: true, isPosting: true },
  });
  if (!account) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
  }

  const journalWhere: Prisma.JournalEntryWhereInput = {
    companyId: tenant.companyId,
    ...(postedOnly ? { posted: true } : {}),
  };
  if (from || to) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    journalWhere.date = dateFilter;
  }

  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id, journal: journalWhere },
    include: {
      journal: {
        select: {
          id: true,
          date: true,
          description: true,
          referenceType: true,
          referenceId: true,
        },
      },
    },
    orderBy: [{ journal: { date: 'asc' } }, { journal: { createdAt: 'asc' } }],
  });

  const isNaturalDebit = account.type === 'ASSET' || account.type === 'EXPENSE';
  let running = 0;
  const movements = lines.map((l) => {
    const dr = Number(l.debit);
    const cr = Number(l.credit);
    running += isNaturalDebit ? dr - cr : cr - dr;
    return {
      journalId: l.journal.id,
      date: l.journal.date,
      description: l.journal.description,
      referenceType: l.journal.referenceType,
      referenceId: l.journal.referenceId,
      debit: dr,
      credit: cr,
      balance: Math.round(running * 100) / 100,
    };
  });

  return NextResponse.json({
    account,
    movements,
    finalBalance: Math.round(running * 100) / 100,
  });
}
