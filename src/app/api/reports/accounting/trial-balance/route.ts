import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/**
 * GET /api/reports/accounting/trial-balance
 *
 * Balance de Comprobación: lista todas las cuentas (hoja) con sus totales
 * de débito y crédito y el saldo neto del período.
 *
 * Query:
 *   - periodId (recomendado): filtra por período exacto.
 *   - from / to (alternativa): filtra por rango de fechas.
 *   - posted=true|false (default true): incluye solo asientos publicados.
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const periodId = searchParams.get('periodId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const postedOnly = searchParams.get('posted') !== 'false';

  const journalWhere: Record<string, unknown> = {
    companyId: tenant.companyId,
    ...(postedOnly ? { posted: true } : {}),
  };
  if (periodId) {
    journalWhere.periodId = periodId;
  } else if (from || to) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    journalWhere.date = dateFilter;
  }

  const lines = await prisma.journalLine.findMany({
    where: { journal: journalWhere },
    include: { account: { select: { id: true, code: true, name: true, type: true } } },
  });

  type Row = {
    accountId: string;
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
  };
  const rows = new Map<string, Row>();
  for (const l of lines) {
    const r = rows.get(l.accountId) ?? {
      accountId: l.accountId,
      code: l.account.code,
      name: l.account.name,
      type: l.account.type,
      debit: 0,
      credit: 0,
      balance: 0,
    };
    r.debit += Number(l.debit);
    r.credit += Number(l.credit);
    rows.set(l.accountId, r);
  }
  const result_rows = Array.from(rows.values()).map((r) => {
    // Saldo natural: ASSET/EXPENSE = DR − CR, LIABILITY/EQUITY/INCOME = CR − DR
    const natural = r.type === 'ASSET' || r.type === 'EXPENSE' ? r.debit - r.credit : r.credit - r.debit;
    return { ...r, balance: natural };
  });
  result_rows.sort((a, b) => a.code.localeCompare(b.code));

  const totals = result_rows.reduce(
    (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
    { debit: 0, credit: 0 },
  );

  return NextResponse.json({
    rows: result_rows,
    totals,
    isBalanced: Math.abs(totals.debit - totals.credit) < 0.005,
  });
}
