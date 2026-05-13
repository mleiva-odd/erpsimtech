/**
 * Fase 21 · Multi-moneda · Helpers de tipo de cambio.
 *
 * Provee `getExchangeRate(tx, companyId, currency, date)` que busca el rate
 * vigente más cercano a `date` (hacia atrás, "rate al cierre del día") para
 * la moneda solicitada. Si la moneda es la funcional (GTQ), devuelve 1.0
 * sin tocar la DB. Si no hay rate cargado para una moneda extranjera, throw
 * `ExchangeRateNotFoundError` (status 422).
 *
 * Diseño deliberado:
 *   - El helper NO crea rates implícitos. Si falta el rate, el flujo de
 *     venta/compra/cobro/pago debe abortar — caso contrario, la diferencia
 *     cambiaria queda silenciosa y la contabilidad cuadra mal sin auditoría.
 *   - El rate de FX se busca por `date <= fecha del documento` (gana el más
 *     reciente). Esto permite cargar rates por adelantado o post-hoc.
 *   - Multiplicación amount × rate se redondea a 2 decimales (Decimal 15,2
 *     en el snapshot). Decimal 18,8 del rate solo se persiste en el snapshot
 *     del documento; los reportes consolidados usan `functionalAmount`.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { FUNCTIONAL_CURRENCY } from './types';

type Tx = Prisma.TransactionClient | PrismaClient;

export class ExchangeRateError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ExchangeRateError';
    this.status = status;
  }
}

/** Normaliza una currency arbitraria a ISO-3 mayúsculas. */
export function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? FUNCTIONAL_CURRENCY).trim().toUpperCase();
}

/** True si la currency es la moneda funcional (GTQ). */
export function isFunctionalCurrency(currency: string | null | undefined): boolean {
  return normalizeCurrency(currency) === FUNCTIONAL_CURRENCY;
}

/**
 * Convierte una fecha cualquiera a un `Date` con hora 00:00:00 UTC.
 * Necesario porque `ExchangeRate.date` se persiste como `@db.Date` (sin hora).
 */
function toDateOnly(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return d;
}

/**
 * Busca el tipo de cambio vigente para `currency` en `date` (o anterior).
 *
 * Reglas:
 *   - Si currency === GTQ (funcional), retorna 1.0 sin tocar DB.
 *   - Busca el rate con `date <= input.date` más reciente para la empresa.
 *   - Si no encuentra, lanza `ExchangeRateError(422)` con mensaje accionable.
 *
 * @returns rate como `number` (no Decimal). Las consultas downstream lo
 * multiplican por `amount` (también number) y guardan el resultado en
 * Decimal(15,2) → 18,8 según corresponda.
 */
export async function getExchangeRate(
  tx: Tx,
  companyId: string,
  currency: string,
  date: Date,
): Promise<number> {
  const cur = normalizeCurrency(currency);
  if (cur === FUNCTIONAL_CURRENCY) {
    return 1.0;
  }

  const dateOnly = toDateOnly(date);

  // `ExchangeRate` puede no estar en el cliente Prisma generado todavía hasta
  // que se corra `prisma generate`. Cast defensivo (patrón Fase 17/18/19/20).
  const found = await (tx as unknown as {
    exchangeRate: {
      findFirst: (args: unknown) => Promise<{ rate: unknown; date: Date } | null>;
    };
  }).exchangeRate.findFirst({
    where: {
      companyId,
      currency: cur,
      date: { lte: dateOnly },
    },
    orderBy: { date: 'desc' },
  });

  if (!found) {
    throw new ExchangeRateError(
      `No hay tipo de cambio cargado para ${cur} con fecha <= ${dateOnly.toISOString().slice(0, 10)}. ` +
        `Cargá uno en Settings → Tipos de Cambio (manual o Banguat) antes de operar.`,
    );
  }

  return Number(found.rate);
}

/**
 * Devuelve `amount * rate` redondeado a 2 decimales (centavos GTQ).
 * Usado para calcular `functionalAmount` snapshot en cada documento.
 */
export function toFunctionalAmount(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return 0;
  return Math.round(amount * rate * 100) / 100;
}
