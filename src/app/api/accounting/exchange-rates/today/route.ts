/**
 * Fase 22c-5 · Multi-moneda UI · Endpoint helper "tasa de hoy".
 *
 *   GET /api/accounting/exchange-rates/today?currency=USD
 *
 * Devuelve la tasa MÁS RECIENTE (date <= hoy UTC) para la moneda solicitada.
 *
 * Casos:
 *   - `currency=GTQ` → 200 con `{ currency: 'GTQ', rate: 1, isFunctional: true }`.
 *   - Hay tasa hoy o en el pasado → 200 con `{ currency, rate, date, source,
 *     id, ageDays, warning, isFunctional: false }`. `warning=true` si la tasa
 *     tiene >7 días de antigüedad.
 *   - No hay tasa registrada → 404 con `{ error, suggestedDate }`.
 *   - currency inválida → 400.
 *
 * Permisos: `treasury:view`, `treasury:manage`, `accounting:manage` o
 * `reports:view` (consulta de lectura, sin lateral effects). `settings:manage`
 * también permitido para flujos administrativos.
 *
 * Se usa desde la UI de creación de Sale/PO al elegir moneda extranjera para
 * mostrar `ExchangeRateBadge` (USD @ 7.85 GTQ) y advertir si falta capturar
 * el tipo de cambio del día.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';
import { FUNCTIONAL_CURRENCY, normalizeCurrency } from '@/lib/currency';

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface DbExchangeRate {
  id: string;
  currency: string;
  date: Date;
  rate: unknown;
  source: 'MANUAL' | 'BANGUAT' | 'API';
  notes: string | null;
}

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission([
    'treasury:view',
    'treasury:manage',
    'reports:view',
    'settings:manage',
    'sales:view',
    'purchases:view',
    'purchases:create',
    'pos:access',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const currencyRaw = searchParams.get('currency') ?? FUNCTIONAL_CURRENCY;
  const currency = normalizeCurrency(currencyRaw);

  if (!/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json(
      { error: 'currency debe ser ISO-3 (3 letras mayúsculas).' },
      { status: 400 },
    );
  }

  const today = toDateOnly(new Date());

  if (currency === FUNCTIONAL_CURRENCY) {
    return NextResponse.json({
      currency,
      rate: 1,
      isFunctional: true,
      date: today.toISOString().slice(0, 10),
      ageDays: 0,
      warning: false,
    });
  }

  const found = (await (prisma as unknown as {
    exchangeRate: {
      findFirst: (args: unknown) => Promise<DbExchangeRate | null>;
    };
  }).exchangeRate.findFirst({
    where: {
      companyId: tenant.companyId,
      currency,
      date: { lte: today },
    },
    orderBy: { date: 'desc' },
  })) as DbExchangeRate | null;

  if (!found) {
    return NextResponse.json(
      {
        error: `No hay tipo de cambio cargado para ${currency}.`,
        suggestedDate: today.toISOString().slice(0, 10),
        currency,
      },
      { status: 404 },
    );
  }

  const rateDate = toDateOnly(found.date);
  const ageMs = today.getTime() - rateDate.getTime();
  const ageDays = Math.max(0, Math.round(ageMs / (1000 * 60 * 60 * 24)));

  return NextResponse.json({
    id: found.id,
    currency: found.currency,
    rate: Number(found.rate),
    date: rateDate.toISOString().slice(0, 10),
    source: found.source,
    notes: found.notes,
    ageDays,
    warning: ageDays > 7,
    isFunctional: false,
  });
}
