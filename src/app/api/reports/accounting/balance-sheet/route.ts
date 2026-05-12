import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/**
 * GET /api/reports/accounting/balance-sheet?date=YYYY-MM-DD
 *
 * Balance General: saldos acumulados desde inicio hasta `date` (inclusive),
 * agrupados por tipo de cuenta. Verifica Activo = Pasivo + Patrimonio.
 *
 * Nota: el resultado del ejercicio acumulado (INCOME − EXPENSE hasta la
 * fecha) se suma como "Utilidad del Ejercicio" en patrimonio. Una vez que
 * se cierra el período (transferencia a 3.2.02), no se duplica.
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const cutoff = dateParam ? new Date(dateParam) : new Date();
  cutoff.setHours(23, 59, 59, 999);
  const postedOnly = searchParams.get('posted') !== 'false';

  const lines = await prisma.journalLine.findMany({
    where: {
      journal: {
        companyId: tenant.companyId,
        date: { lte: cutoff },
        ...(postedOnly ? { posted: true } : {}),
      },
    },
    include: { account: { select: { code: true, name: true, type: true } } },
  });

  type Row = { code: string; name: string; type: string; debit: number; credit: number; balance: number };
  const byAccount = new Map<string, Row>();
  for (const l of lines) {
    const r = byAccount.get(l.account.code) ?? {
      code: l.account.code,
      name: l.account.name,
      type: l.account.type,
      debit: 0,
      credit: 0,
      balance: 0,
    };
    r.debit += Number(l.debit);
    r.credit += Number(l.credit);
    byAccount.set(l.account.code, r);
  }

  const assets: Row[] = [];
  const liabilities: Row[] = [];
  const equity: Row[] = [];
  let netIncome = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const r of byAccount.values()) {
    const natural = r.type === 'ASSET' || r.type === 'EXPENSE' ? r.debit - r.credit : r.credit - r.debit;
    r.balance = Math.round(natural * 100) / 100;
    if (r.type === 'ASSET') {
      assets.push(r);
      totalAssets += r.balance;
    } else if (r.type === 'LIABILITY') {
      liabilities.push(r);
      totalLiabilities += r.balance;
    } else if (r.type === 'EQUITY') {
      equity.push(r);
      totalEquity += r.balance;
    } else if (r.type === 'INCOME') {
      netIncome += r.balance;
    } else if (r.type === 'EXPENSE') {
      netIncome -= r.balance;
    }
  }

  // Agregar utilidad neta del ejercicio si no fue cerrada todavía
  if (Math.abs(netIncome) >= 0.005) {
    equity.push({
      code: 'UTIL_EJ',
      name: 'Utilidad del Ejercicio (acumulada, no cerrada)',
      type: 'EQUITY',
      debit: 0,
      credit: 0,
      balance: Math.round(netIncome * 100) / 100,
    });
    totalEquity += netIncome;
  }

  assets.sort((a, b) => a.code.localeCompare(b.code));
  liabilities.sort((a, b) => a.code.localeCompare(b.code));
  equity.sort((a, b) => a.code.localeCompare(b.code));

  const totalLiabPlusEquity = totalLiabilities + totalEquity;
  return NextResponse.json({
    cutoffDate: cutoff,
    assets,
    liabilities,
    equity,
    totals: {
      assets: Math.round(totalAssets * 100) / 100,
      liabilities: Math.round(totalLiabilities * 100) / 100,
      equity: Math.round(totalEquity * 100) / 100,
      liabilitiesPlusEquity: Math.round(totalLiabPlusEquity * 100) / 100,
    },
    isBalanced: Math.abs(totalAssets - totalLiabPlusEquity) < 0.01,
    diff: Math.round((totalAssets - totalLiabPlusEquity) * 100) / 100,
  });
}
