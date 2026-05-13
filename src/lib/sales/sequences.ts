/**
 * Reserva atómica de `DeliveryNote.noteNumber` (Fase 20).
 *
 * Reemplaza el patrón antiguo (read-last + increment + insert) que tenía
 * race condition documentada en `phase-20-discovery.md` §3 / H6.
 *
 * Patrón: lock optimista vía `updateMany ... where nextNumber = X`. Si
 * count==1, gané la carrera y X es mi número. Si count==0, alguien más
 * lo tomó — reintento hasta `MAX_RETRIES`.
 *
 * Si la empresa todavía no tiene `DeliveryNoteSequence`, se la siembra
 * usando el correlativo existente más alto en `DeliveryNote.noteNumber`
 * para no romper la numeración. La migración 20260525000100 ya hace este
 * backfill, pero dejamos el upsert defensivo en caso de empresas creadas
 * después del backfill.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

const MAX_RETRIES = 5;

export interface ReservedNoteNumber {
  sequenceId: string;
  prefix: string;
  numero: number;
  /** Formato display ej "ND-000123". */
  noteNumber: string;
}

function pad(n: number, width = 6): string {
  return String(n).padStart(width, '0');
}

async function ensureSequence(tx: Tx, companyId: string): Promise<{ id: string; nextNumber: number; prefix: string }> {
  const existing = await (tx as unknown as { deliveryNoteSequence: { findUnique: (a: unknown) => Promise<unknown> } })
    .deliveryNoteSequence.findUnique({ where: { companyId } }) as
    | { id: string; nextNumber: number; prefix: string }
    | null;
  if (existing) return existing;

  // Si no existe, calcular nextNumber a partir de noteNumber existentes.
  const notes = await (tx as unknown as { deliveryNote: { findMany: (a: unknown) => Promise<Array<{ noteNumber: string | null }>> } })
    .deliveryNote.findMany({
      where: { companyId, noteNumber: { not: null } },
      select: { noteNumber: true },
    });
  let maxNum = 0;
  for (const n of notes) {
    const m = n.noteNumber?.match(/(\d+)$/);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v) && v > maxNum) maxNum = v;
    }
  }
  const created = await (tx as unknown as { deliveryNoteSequence: { create: (a: unknown) => Promise<unknown> } })
    .deliveryNoteSequence.create({
      data: {
        companyId,
        nextNumber: maxNum + 1,
        prefix: 'ND-',
      },
    }) as { id: string; nextNumber: number; prefix: string };
  return created;
}

/**
 * Reserva atómicamente el próximo `noteNumber` para una empresa.
 * Throw si tras `MAX_RETRIES` no se logra el lock (contención extrema).
 */
export async function reserveNoteNumber(
  tx: Tx,
  companyId: string,
): Promise<ReservedNoteNumber> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const seq = await ensureSequence(tx, companyId);
    const candidate = seq.nextNumber;
    const updateResult = await (tx as unknown as {
      deliveryNoteSequence: { updateMany: (a: unknown) => Promise<{ count: number }> };
    }).deliveryNoteSequence.updateMany({
      where: { companyId, nextNumber: candidate },
      data: { nextNumber: candidate + 1 },
    });
    if (updateResult.count === 1) {
      return {
        sequenceId: seq.id,
        prefix: seq.prefix,
        numero: candidate,
        noteNumber: `${seq.prefix}${pad(candidate)}`,
      };
    }
    // Otro request ganó la carrera. Re-loop.
  }
  throw new Error('No se pudo reservar el número de nota de envío tras múltiples intentos (alta contención).');
}
