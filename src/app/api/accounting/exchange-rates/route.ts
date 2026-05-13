/**
 * Fase 21 · Multi-moneda · CRUD de tipos de cambio.
 *
 *   GET  /api/accounting/exchange-rates?currency=&date=&from=&to=
 *        Lista los rates de la empresa. Filtros opcionales:
 *          - currency: filtra por una moneda (ISO-3).
 *          - date: rate vigente para esa fecha exacta.
 *          - from / to: rango de fechas inclusivo.
 *        Sin filtros, devuelve los últimos 100 ordenados por fecha desc.
 *
 *   POST /api/accounting/exchange-rates
 *        Alta manual de un rate. Body:
 *          { currency: 'USD', date: '2026-05-12', rate: 7.85,
 *            source?: 'MANUAL'|'BANGUAT'|'API', notes?: string }
 *        El par (companyId, currency, date) es único — segundo POST con la
 *        misma combinación responde 409.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';

const CurrencySchema = z
  .string()
  .trim()
  .min(3)
  .max(3)
  .regex(/^[A-Z]{3}$/, 'Currency debe ser ISO-3 mayúsculas (USD, EUR, ...)');

const CreateExchangeRateSchema = z.object({
  currency: CurrencySchema,
  date: z.coerce.date(),
  rate: z.coerce.number().positive('rate debe ser > 0'),
  source: z.enum(['MANUAL', 'BANGUAT', 'API']).optional().default('MANUAL'),
  notes: z.string().trim().max(500).optional().nullable(),
});

/** Convierte a Date con hora 00 UTC (alineado con @db.Date). */
function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission([
    'treasury:manage',
    'accounting:manage',
    'reports:view',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const currency = searchParams.get('currency');
  const dateStr = searchParams.get('date');
  const fromStr = searchParams.get('from');
  const toStr = searchParams.get('to');

  const where: Record<string, unknown> = { companyId: tenant.companyId };

  if (currency) {
    const cur = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) {
      return NextResponse.json(
        { error: 'currency debe ser ISO-3 (3 letras mayúsculas).' },
        { status: 400 },
      );
    }
    where.currency = cur;
  }

  if (dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'date inválida' }, { status: 400 });
    }
    where.date = toDateOnly(d);
  } else if (fromStr || toStr) {
    const range: { gte?: Date; lte?: Date } = {};
    if (fromStr) {
      const f = new Date(fromStr);
      if (Number.isNaN(f.getTime())) {
        return NextResponse.json({ error: 'from inválido' }, { status: 400 });
      }
      range.gte = toDateOnly(f);
    }
    if (toStr) {
      const t = new Date(toStr);
      if (Number.isNaN(t.getTime())) {
        return NextResponse.json({ error: 'to inválido' }, { status: 400 });
      }
      range.lte = toDateOnly(t);
    }
    where.date = range;
  }

  const rates = await (prisma as unknown as {
    exchangeRate: {
      findMany: (args: unknown) => Promise<unknown[]>;
    };
  }).exchangeRate.findMany({
    where,
    orderBy: [{ date: 'desc' }, { currency: 'asc' }],
    take: 100,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ rates });
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission(['treasury:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = CreateExchangeRateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { currency, date, rate, source, notes } = parsed.data;
    const dateOnly = toDateOnly(date);

    const created = await (prisma as unknown as {
      exchangeRate: {
        create: (args: unknown) => Promise<unknown>;
      };
    }).exchangeRate.create({
      data: {
        companyId: tenant.companyId,
        currency,
        date: dateOnly,
        rate: new PrismaNS.Decimal(rate),
        source,
        notes: notes ?? null,
        createdById: tenant.userId,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Ya existe un tipo de cambio para esa moneda en esa fecha. Editalo o borralo primero.' },
        { status: 409 },
      );
    }
    console.error('exchange-rates POST error:', error);
    return NextResponse.json({ error: 'Error al crear el tipo de cambio.' }, { status: 500 });
  }
}
