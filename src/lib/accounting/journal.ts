import type { Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import { ensureAccountingPeriod } from './seed';

type Tx = Prisma.TransactionClient | PrismaClient;

export class JournalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'JournalError';
    this.status = status;
  }
}

/**
 * Tolerancia para errores de redondeo en partida doble.
 * 0.005 = medio centavo. Permite que sumas como
 *   0.10 + 0.10 + 0.10 = 0.30000000000000004
 * pasen sin ruido, mientras sigue detectando errores reales (≥ 1 ct).
 */
const BALANCE_TOLERANCE = 0.005;

export type JournalLineInput = {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  costCenterId?: string;
};

export type CreateJournalEntryInput = {
  companyId: string;
  branchId?: string | null;
  date: Date;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  userId: string;
  /**
   * `posted=true` (default): asiento publicado inmediato.
   * `posted=false`: queda en DRAFT, requiere publicación explícita
   * vía `POST /api/accounting/journal/[id]/post`.
   */
  posted?: boolean;
  lines: JournalLineInput[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Crea un asiento contable (partida doble) con sus líneas.
 *
 * Responsabilidades:
 *  - Validar Σ debit == Σ credit con tolerancia (BALANCE_TOLERANCE).
 *  - Resolver accountCode → accountId; throw si la cuenta no existe.
 *  - Validar que cada cuenta tenga `isPosting=true`.
 *  - Resolver/crear el `AccountingPeriod` correspondiente; bloquear si CLOSED.
 *  - Persistir cabecera + líneas en la misma transacción.
 *
 * Debe llamarse SIEMPRE dentro de un `$transaction` del caller (`tx` es
 * `Prisma.TransactionClient`). Si el caller no tiene transacción, pasa
 * el PrismaClient global, pero pierde atomicidad — esto NO es lo deseado
 * para flujos de venta/compra/pago.
 */
export async function createJournalEntry(
  tx: Tx,
  input: CreateJournalEntryInput,
) {
  if (!input.lines || input.lines.length < 2) {
    throw new JournalError(
      'Un asiento contable requiere al menos 2 líneas (partida doble).',
    );
  }

  // 1) Validar balance DR == CR
  let totalDr = 0;
  let totalCr = 0;
  for (const line of input.lines) {
    const dr = Number(line.debit ?? 0);
    const cr = Number(line.credit ?? 0);
    if (dr < 0 || cr < 0) {
      throw new JournalError(
        'Los montos de débito y crédito deben ser no-negativos.',
      );
    }
    if (dr > 0 && cr > 0) {
      throw new JournalError(
        `Una línea no puede tener débito y crédito a la vez (cuenta ${line.accountCode}).`,
      );
    }
    if (dr === 0 && cr === 0) {
      throw new JournalError(
        `Una línea debe tener débito o crédito > 0 (cuenta ${line.accountCode}).`,
      );
    }
    totalDr += dr;
    totalCr += cr;
  }

  if (Math.abs(totalDr - totalCr) > BALANCE_TOLERANCE) {
    throw new JournalError(
      `Asiento desbalanceado: DR=${round2(totalDr)} ≠ CR=${round2(totalCr)} (diferencia: ${round2(totalDr - totalCr)}).`,
    );
  }

  // 2) Resolver período (crear OPEN si no existe; bloquear si CLOSED)
  const period = await ensureAccountingPeriod(tx, input.companyId, input.date);
  if (period.status === 'CLOSED') {
    throw new JournalError(
      `El período contable ${input.date.getUTCFullYear()}-${String(input.date.getUTCMonth() + 1).padStart(2, '0')} está CERRADO. No se aceptan nuevos asientos.`,
      409,
    );
  }

  // 3) Resolver códigos → accountIds + validar isPosting
  const codes = Array.from(new Set(input.lines.map((l) => l.accountCode)));
  const accounts = await tx.chartOfAccount.findMany({
    where: { companyId: input.companyId, code: { in: codes } },
    select: { id: true, code: true, isPosting: true, active: true },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  for (const code of codes) {
    const acct = byCode.get(code);
    if (!acct) {
      throw new JournalError(
        `Cuenta contable no existe en el plan de cuentas: ${code}. ` +
          `Sembrá el plan con seedChartOfAccounts antes de operar.`,
      );
    }
    if (!acct.active) {
      throw new JournalError(
        `Cuenta contable inactiva: ${code}. No acepta asientos.`,
      );
    }
    if (!acct.isPosting) {
      throw new JournalError(
        `Cuenta padre (no-posting) no acepta líneas directas: ${code}. ` +
          `Usá una cuenta hoja.`,
      );
    }
  }

  // 4) Crear cabecera y líneas
  const posted = input.posted !== false; // default true
  const journal = await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      branchId: input.branchId ?? null,
      periodId: period.id,
      date: input.date,
      description: input.description,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      userId: input.userId,
      posted,
      postedAt: posted ? new Date() : null,
      lines: {
        create: input.lines.map((l) => ({
          accountId: byCode.get(l.accountCode)!.id,
          debit: new PrismaNS.Decimal(round2(Number(l.debit ?? 0))),
          credit: new PrismaNS.Decimal(round2(Number(l.credit ?? 0))),
          description: l.description ?? null,
          costCenterId: l.costCenterId ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  return journal;
}

/**
 * Publica un asiento DRAFT. Verifica balance (defensivo) y setea
 * `posted=true, postedAt=now()`. Si ya está posteado, no hace nada.
 * Bloquea si el período está CLOSED.
 */
export async function postJournalEntry(
  tx: Tx,
  journalId: string,
  companyId: string,
) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: journalId },
    include: { lines: true, period: true },
  });
  if (!entry || entry.companyId !== companyId) {
    throw new JournalError('Asiento contable no encontrado.', 404);
  }
  if (entry.posted) {
    return entry;
  }
  if (entry.period.status === 'CLOSED') {
    throw new JournalError(
      'El período del asiento está CERRADO. No se puede publicar.',
      409,
    );
  }
  const totalDr = entry.lines.reduce((s: number, l: { debit: unknown }) => s + Number(l.debit), 0);
  const totalCr = entry.lines.reduce((s: number, l: { credit: unknown }) => s + Number(l.credit), 0);
  if (Math.abs(totalDr - totalCr) > BALANCE_TOLERANCE) {
    throw new JournalError(
      `Asiento desbalanceado al publicar: DR=${round2(totalDr)} ≠ CR=${round2(totalCr)}.`,
    );
  }
  return tx.journalEntry.update({
    where: { id: journalId },
    data: { posted: true, postedAt: new Date() },
    include: { lines: true },
  });
}

/**
 * Crea un asiento contrario (reversa) del journalId dado.
 * Las líneas se invierten: cada DR del original se convierte en CR
 * y viceversa, manteniendo las mismas cuentas. Marca el nuevo asiento
 * con `reversedById = journalId` para auditoría.
 *
 * Usado por:
 *  - Anulación de venta (CRIT-2)
 *  - Reversa de cobro/pago (CRIT-1)
 *  - Anulación de compra
 */
export async function reverseJournalEntry(
  tx: Tx,
  journalId: string,
  options: {
    companyId: string;
    userId: string;
    description: string;
    date?: Date;
    referenceType?: string | null;
    referenceId?: string | null;
  },
) {
  const original = await tx.journalEntry.findUnique({
    where: { id: journalId },
    include: {
      lines: { include: { account: true } },
      reversedBy: { select: { id: true } },
    },
  });
  if (!original || original.companyId !== options.companyId) {
    throw new JournalError('Asiento original no encontrado.', 404);
  }
  if (original.reversedBy.length > 0) {
    throw new JournalError('Este asiento ya fue reversado anteriormente.', 409);
  }

  const reverseDate = options.date ?? new Date();

  // Reusamos createJournalEntry para que valide balance y período.
  const reversal = await createJournalEntry(tx, {
    companyId: options.companyId,
    branchId: original.branchId,
    date: reverseDate,
    description: options.description,
    referenceType: options.referenceType ?? original.referenceType,
    referenceId: options.referenceId ?? original.referenceId,
    userId: options.userId,
    posted: true,
    lines: (original.lines as Array<{
      account: { code: string };
      debit: unknown;
      credit: unknown;
      description: string | null;
      costCenterId: string | null;
    }>).map((l) => ({
      accountCode: l.account.code,
      debit: Number(l.credit),
      credit: Number(l.debit),
      description: l.description ?? undefined,
      costCenterId: l.costCenterId ?? undefined,
    })),
  });

  // Vinculamos la reversa al original. Hacemos UPDATE en el original
  // para marcar que ya fue reversado (defensa contra doble reversa).
  // Nota: la columna `reversedById` está en el NUEVO asiento apuntando al
  // viejo. Para registrar que el viejo "ya fue reversado" usamos el campo
  // reversedById del nuevo y la relación inversa `reversedBy[]` del viejo.
  await tx.journalEntry.update({
    where: { id: reversal.id },
    data: { reversedById: original.id },
  });

  return reversal;
}
