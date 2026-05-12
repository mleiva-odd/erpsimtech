/**
 * Mock minimal de `Prisma.TransactionClient` para tests unitarios de los
 * helpers de partida doble. Sin DB real — solo en memoria.
 *
 * Soporta los métodos que `createJournalEntry`, `reverseJournalEntry`,
 * `postJournalEntry` y `ensureAccountingPeriod` consumen:
 *   - chartOfAccount.findMany / findUnique
 *   - accountingPeriod.findUnique / create / update
 *   - journalEntry.create / findUnique / update
 *   - journalLine.* (no llamado directo, va vía nested writes)
 */

type Account = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  isPosting: boolean;
  active: boolean;
  parentId: string | null;
};

type Period = {
  id: string;
  companyId: string;
  year: number;
  month: number;
  status: 'OPEN' | 'CLOSED';
};

type Line = {
  id: string;
  journalId: string;
  accountId: string;
  debit: { toString(): string };
  credit: { toString(): string };
  description: string | null;
  costCenterId: string | null;
};

type Entry = {
  id: string;
  companyId: string;
  branchId: string | null;
  periodId: string;
  date: Date;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  userId: string;
  posted: boolean;
  postedAt: Date | null;
  reversedById: string | null;
  createdAt: Date;
  lines: Line[];
};

let idCounter = 1;
function newId() {
  return `id-${idCounter++}`;
}

export function makeMockTx(initialAccounts: Omit<Account, 'id'>[] = []) {
  const accounts: Account[] = initialAccounts.map((a) => ({ ...a, id: newId() }));
  const periods: Period[] = [];
  const entries: Entry[] = [];

  const toNumber = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    if (typeof v === 'object' && v !== null && 'toString' in v) {
      return Number((v as { toString(): string }).toString());
    }
    return Number(v);
  };
  const decimalize = (v: unknown) => {
    const n = toNumber(v);
    return {
      toString: () => n.toFixed(2),
      valueOf: () => n,
    };
  };

  const tx = {
    chartOfAccount: {
      findUnique: async ({ where }: { where: { companyId_code: { companyId: string; code: string } } }) => {
        const w = where.companyId_code;
        return accounts.find((a) => a.companyId === w.companyId && a.code === w.code) ?? null;
      },
      findMany: async ({ where }: { where: { companyId: string; code: { in: string[] } } }) => {
        return accounts.filter(
          (a) => a.companyId === where.companyId && where.code.in.includes(a.code),
        );
      },
      create: async ({ data }: { data: Omit<Account, 'id'> }) => {
        const created = { ...data, id: newId() };
        accounts.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Account> }) => {
        const found = accounts.find((a) => a.id === where.id);
        if (!found) throw new Error('not found');
        Object.assign(found, data);
        return found;
      },
    },
    accountingPeriod: {
      findUnique: async ({ where }: { where: { companyId_year_month: { companyId: string; year: number; month: number } } }) => {
        const w = where.companyId_year_month;
        return periods.find((p) => p.companyId === w.companyId && p.year === w.year && p.month === w.month) ?? null;
      },
      create: async ({ data }: { data: Omit<Period, 'id'> }) => {
        const created = { ...data, id: newId() };
        periods.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Period> }) => {
        const found = periods.find((p) => p.id === where.id);
        if (!found) throw new Error('period not found');
        Object.assign(found, data);
        return found;
      },
    },
    journalEntry: {
      create: async ({ data, include }: { data: any; include?: any }) => {
        const entryId = newId();
        const lines: Line[] = (data.lines?.create ?? []).map((l: any) => ({
          id: newId(),
          journalId: entryId,
          accountId: l.accountId,
          debit: decimalize(l.debit),
          credit: decimalize(l.credit),
          description: l.description ?? null,
          costCenterId: l.costCenterId ?? null,
        }));
        const entry: Entry = {
          id: entryId,
          companyId: data.companyId,
          branchId: data.branchId ?? null,
          periodId: data.periodId,
          date: data.date,
          description: data.description,
          referenceType: data.referenceType ?? null,
          referenceId: data.referenceId ?? null,
          userId: data.userId,
          posted: data.posted ?? true,
          postedAt: data.postedAt ?? null,
          reversedById: null,
          createdAt: new Date(),
          lines,
        };
        entries.push(entry);
        if (include?.lines) return entry;
        return { ...entry, lines: undefined };
      },
      findUnique: async ({ where, include }: { where: { id: string }; include?: any }) => {
        const entry = entries.find((e) => e.id === where.id);
        if (!entry) return null;
        const result: any = { ...entry };
        if (include?.lines) {
          if (include.lines.include?.account) {
            result.lines = entry.lines.map((l) => ({
              ...l,
              account: accounts.find((a) => a.id === l.accountId)!,
            }));
          } else {
            result.lines = entry.lines;
          }
        }
        if (include?.reversedBy) {
          result.reversedBy = entries
            .filter((e) => e.reversedById === entry.id)
            .map((e) => ({ id: e.id }));
        }
        if (include?.period) {
          result.period = periods.find((p) => p.id === entry.periodId);
        }
        return result;
      },
      findFirst: async ({ where, include }: { where: any; include?: any }) => {
        const found = entries.find(
          (e) =>
            e.companyId === where.companyId &&
            (where.referenceType ? e.referenceType === where.referenceType : true) &&
            (where.referenceId ? e.referenceId === where.referenceId : true),
        );
        if (!found) return null;
        const result: any = { ...found };
        if (include?.reversedBy) {
          result.reversedBy = entries
            .filter((e) => e.reversedById === found.id)
            .map((e) => ({ id: e.id }));
        }
        return result;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Entry> }) => {
        const found = entries.find((e) => e.id === where.id);
        if (!found) throw new Error('entry not found');
        Object.assign(found, data);
        return found;
      },
    },
    _state: { accounts, periods, entries },
  };

  return tx;
}

export type MockTx = ReturnType<typeof makeMockTx>;
