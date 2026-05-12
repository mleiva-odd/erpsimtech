import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { computePayablesAging } from '@/lib/ar-ap/aging';

/**
 * Fase 17 · Aging de cuentas por pagar (CxP).
 *
 * Misma forma que aging-receivables. Aging exacto porque
 * `SupplierPayable` sí trackea saldo por documento.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const result = await requirePermission('treasury:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const asOfParam = req.nextUrl.searchParams.get('asOf');
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return NextResponse.json(
      { error: '`asOf` no es una fecha válida (ISO 8601 esperado)' },
      { status: 400 },
    );
  }

  try {
    const aging = await prisma.$transaction(async (tx) =>
      computePayablesAging(tx, tenant.companyId, asOf),
    );

    const totals = aging.reduce(
      (acc, s) => {
        acc.current += s.buckets.current;
        acc.d1_30 += s.buckets.d1_30;
        acc.d31_60 += s.buckets.d31_60;
        acc.d61_90 += s.buckets.d61_90;
        acc.d90_plus += s.buckets.d90_plus;
        acc.total += s.buckets.total;
        return acc;
      },
      { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
    );

    return NextResponse.json({
      asOf: asOf.toISOString(),
      suppliers: aging,
      totals,
    });
  } catch (err) {
    console.error('[aging-payables] error:', err);
    return NextResponse.json(
      { error: 'Error al calcular aging' },
      { status: 500 },
    );
  }
}
