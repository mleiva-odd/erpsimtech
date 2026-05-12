/**
 * Asignación atómica de correlativos en `TaxSeries`.
 *
 * El correlativo SAT es un campo crítico: `(companyId, branchId, seriePrefix,
 * numero)` debe ser único globalmente para la empresa, sin huecos
 * detectables (SAT puede auditar). Dos certificaciones concurrentes NO pueden
 * obtener el mismo número.
 *
 * Implementación: lock optimista vía `updateMany ... where nextNumber = X`.
 * Si el `count` post-update es 1, el lock fue mío y `X` es mi correlativo.
 * Si es 0, alguien me ganó la carrera — reintento (hasta `MAX_RETRIES`).
 *
 * Alternativa rechazada: `SELECT ... FOR UPDATE` + `UPDATE`. Funciona, pero
 * `updateMany` con `where: { nextNumber }` es más liviano y no requiere
 * isolation level Serializable.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type { TaxDocumentTypeCode } from './types';
import { FelError } from './types';

type Tx = Prisma.TransactionClient | PrismaClient;

const MAX_RETRIES = 5;

export interface ReserveCorrelativoInput {
  companyId: string;
  branchId: string;
  documentType: TaxDocumentTypeCode;
  /** Si null, usa la serie ACTIVE por defecto para (branch, type). */
  prefix?: string;
}

export interface ReservedCorrelativo {
  seriesId: string;
  prefix: string;
  numero: number;
  /** Formato de visualización ej "A-000123". */
  numeroDisplay: string;
}

function formatDisplay(prefix: string, numero: number): string {
  const padded = String(numero).padStart(6, '0');
  return `${prefix}-${padded}`;
}

/**
 * Reserva atómicamente el próximo correlativo. Throw `FelError` si:
 *   - No existe serie activa para (companyId, branchId, type).
 *   - El rango asignado por SAT (`rangeFrom..rangeTo`) está agotado.
 *   - Tras `MAX_RETRIES` no se pudo ganar el lock (contención extrema).
 */
export async function reserveCorrelativo(
  tx: Tx,
  input: ReserveCorrelativoInput,
): Promise<ReservedCorrelativo> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const series = await tx.taxSeries.findFirst({
      where: {
        companyId: input.companyId,
        branchId: input.branchId,
        documentType: input.documentType,
        active: true,
        ...(input.prefix ? { prefix: input.prefix } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        prefix: true,
        nextNumber: true,
        rangeFrom: true,
        rangeTo: true,
      },
    });

    if (!series) {
      throw new FelError(
        `No hay serie ${input.documentType} activa para esta sucursal. ` +
          `Configurá una desde Settings.`,
        { code: 'FEL_NO_SERIES', status: 409 },
      );
    }

    const candidate = series.nextNumber;
    if (series.rangeFrom != null && candidate < series.rangeFrom) {
      // Caso raro: alguien seteó nextNumber por debajo del rango. Forzamos
      // al inicio del rango.
      const updateResult = await tx.taxSeries.updateMany({
        where: { id: series.id, nextNumber: candidate },
        data: { nextNumber: series.rangeFrom },
      });
      if (updateResult.count === 0) continue; // alguien más lo movió
      continue; // re-loop para tomar el nuevo nextNumber
    }
    if (series.rangeTo != null && candidate > series.rangeTo) {
      throw new FelError(
        `Rango de la serie ${series.prefix} agotado (${series.rangeFrom}..${series.rangeTo}). ` +
          `Solicitá una nueva autorización a SAT.`,
        { code: 'FEL_SERIES_EXHAUSTED', status: 409 },
      );
    }

    // Intento de lock atómico:
    const updateResult = await tx.taxSeries.updateMany({
      where: { id: series.id, nextNumber: candidate },
      data: { nextNumber: candidate + 1 },
    });

    if (updateResult.count === 1) {
      return {
        seriesId: series.id,
        prefix: series.prefix,
        numero: candidate,
        numeroDisplay: formatDisplay(series.prefix, candidate),
      };
    }

    // Otro request ganó la carrera. Re-loop.
  }

  throw new FelError(
    'No se pudo reservar el correlativo tras múltiples intentos (alta contención).',
    { code: 'FEL_SERIES_CONTENTION', status: 503 },
  );
}

export { formatDisplay as formatCorrelativoDisplay };
