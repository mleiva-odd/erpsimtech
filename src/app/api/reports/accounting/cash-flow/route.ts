import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ACCOUNTS } from '@/lib/accounting';

/**
 * GET /api/reports/accounting/cash-flow?from=&to=
 *
 * Flujo de Caja (versión simplificada): movimientos de las cuentas Caja
 * (1.1.01) y Bancos (1.1.02) en el período, agrupados por contrapartida.
 *
 * Una versión completa (operativo/inversión/financiamiento) se difiere a
 * Fase 22 — esto es suficiente para responder "¿de dónde entró/salió el
 * dinero?" en términos operacionales.
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const postedOnly = searchParams.get('posted') !== 'false';

  const startDate = from
    ? new Date(from)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endDate = to ? new Date(to) : new Date();
  endDate.setHours(23, 59, 59, 999);

  const cashAccounts = await prisma.chartOfAccount.findMany({
    where: {
      companyId: tenant.companyId,
      code: { in: [ACCOUNTS.CASH, ACCOUNTS.BANKS] },
    },
    select: { id: true, code: true, name: true },
  });
  const cashAccountIds = cashAccounts.map((a) => a.id);
  if (cashAccountIds.length === 0) {
    return NextResponse.json({
      period: { from: startDate, to: endDate },
      inflows: [],
      outflows: [],
      netFlow: 0,
    });
  }

  // Asientos que tocan caja o bancos en el período
  const journalWhere: Prisma.JournalEntryWhereInput = {
    companyId: tenant.companyId,
    ...(postedOnly ? { posted: true } : {}),
    date: { gte: startDate, lte: endDate },
    lines: { some: { accountId: { in: cashAccountIds } } },
  };

  const entries = await prisma.journalEntry.findMany({
    where: journalWhere,
    include: {
      lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } },
    },
  });

  type Bucket = { code: string; name: string; amount: number };
  const inflowsMap = new Map<string, Bucket>();
  const outflowsMap = new Map<string, Bucket>();
  let totalIn = 0;
  let totalOut = 0;

  type LineLite = { accountId: string; debit: unknown; credit: unknown; account: { code: string; name: string; type: string } };
  type EntryLite = { id: string; lines: LineLite[] };
  for (const e of entries as unknown as EntryLite[]) {
    // Sumamos el efecto neto de caja/bancos del asiento (DR-CR sobre esas cuentas)
    const cashEffect = e.lines.reduce((acc: number, l) => {
      if (cashAccountIds.includes(l.accountId)) {
        return acc + Number(l.debit) - Number(l.credit);
      }
      return acc;
    }, 0);
    if (Math.abs(cashEffect) < 0.005) continue;

    // Atribuimos el flujo a la(s) contrapartida(s) NO-cash. Si hay varias
    // simplemente las prorrateamos por peso de su movimiento opuesto.
    const counterLines = e.lines.filter((l) => !cashAccountIds.includes(l.accountId));
    const counterSum = counterLines.reduce((acc: number, l) => {
      if (cashEffect > 0) return acc + Number(l.credit);
      return acc + Number(l.debit);
    }, 0);

    for (const cl of counterLines) {
      const weight = cashEffect > 0 ? Number(cl.credit) : Number(cl.debit);
      if (weight <= 0 || counterSum <= 0) continue;
      const portion = (Math.abs(cashEffect) * weight) / counterSum;
      const dest = cashEffect > 0 ? inflowsMap : outflowsMap;
      const b = dest.get(cl.account.code) ?? { code: cl.account.code, name: cl.account.name, amount: 0 };
      b.amount += portion;
      dest.set(cl.account.code, b);
    }
    if (cashEffect > 0) totalIn += cashEffect;
    else totalOut += -cashEffect;
  }

  const inflows = Array.from(inflowsMap.values())
    .map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
  const outflows = Array.from(outflowsMap.values())
    .map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    period: { from: startDate, to: endDate },
    inflows,
    outflows,
    totals: {
      inflows: Math.round(totalIn * 100) / 100,
      outflows: Math.round(totalOut * 100) / 100,
    },
    netFlow: Math.round((totalIn - totalOut) * 100) / 100,
  });
}
