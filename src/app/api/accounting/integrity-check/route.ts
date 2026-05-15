import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

/**
 * GET /api/accounting/integrity-check
 *
 * Auditoría rápida del estado de la contabilidad. Retorna:
 *   - unbalancedEntries: asientos donde Σ DR ≠ Σ CR (deberían ser 0)
 *   - linesOnNonPostingAccounts: líneas en cuentas padre (deberían ser 0)
 *   - inactiveAccountLines: líneas en cuentas inactivas
 *   - totalsByType: suma global de DR/CR por tipo de cuenta
 *   - balanced: true si DR total == CR total global
 */
export async function GET(req: NextRequest) {
  void req;
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage', 'reports:view']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  // 1) Asientos desbalanceados
  const allEntries = await prisma.journalEntry.findMany({
    where: { companyId: tenant.companyId, posted: true },
    select: {
      id: true,
      date: true,
      description: true,
      referenceType: true,
      referenceId: true,
      lines: { select: { debit: true, credit: true } },
    },
  });
  type EntryWithLines = { id: string; date: Date; description: string; referenceType: string | null; referenceId: string | null; lines: Array<{ debit: unknown; credit: unknown }> };
  const unbalancedEntries = (allEntries as EntryWithLines[])
    .map((e) => {
      const dr = e.lines.reduce((s: number, l) => s + Number(l.debit), 0);
      const cr = e.lines.reduce((s: number, l) => s + Number(l.credit), 0);
      const diff = dr - cr;
      return { id: e.id, date: e.date, description: e.description, dr, cr, diff };
    })
    .filter((e) => Math.abs(e.diff) > 0.005);

  // 2) Líneas en cuentas no-posting
  const linesOnNonPostingAccounts = await prisma.journalLine.findMany({
    where: {
      journal: { companyId: tenant.companyId },
      account: { isPosting: false },
    },
    select: {
      id: true,
      journalId: true,
      debit: true,
      credit: true,
      account: { select: { code: true, name: true } },
    },
  });

  // 3) Líneas en cuentas inactivas
  const inactiveAccountLines = await prisma.journalLine.findMany({
    where: {
      journal: { companyId: tenant.companyId },
      account: { active: false },
    },
    select: {
      id: true,
      journalId: true,
      account: { select: { code: true, name: true } },
    },
  });

  // 4) Totales globales por tipo de cuenta
  const allLines = await prisma.journalLine.findMany({
    where: { journal: { companyId: tenant.companyId, posted: true } },
    select: { debit: true, credit: true, account: { select: { type: true } } },
  });
  const totalsByType: Record<string, { debit: number; credit: number }> = {};
  let totalDr = 0;
  let totalCr = 0;
  for (const l of allLines) {
    const t = l.account.type;
    totalsByType[t] = totalsByType[t] ?? { debit: 0, credit: 0 };
    totalsByType[t].debit += Number(l.debit);
    totalsByType[t].credit += Number(l.credit);
    totalDr += Number(l.debit);
    totalCr += Number(l.credit);
  }

  return NextResponse.json({
    unbalancedEntries,
    linesOnNonPostingAccounts,
    inactiveAccountLines,
    totalsByType,
    grandTotals: { debit: totalDr, credit: totalCr },
    balanced: Math.abs(totalDr - totalCr) < 0.01,
    diff: Math.round((totalDr - totalCr) * 100) / 100,
  });
}
