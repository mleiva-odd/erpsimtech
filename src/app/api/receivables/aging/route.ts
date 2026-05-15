import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';
import {
  bucketDefinitionsFor,
  computeReceivablesAgingDetailed,
  type BucketDefinition,
} from '@/lib/ar-ap/aging';

/**
 * Fase 22c · Aging de cuentas por cobrar con drill-down.
 *
 * GET /api/receivables/aging?asOf=YYYY-MM-DD
 *
 * Response shape:
 *   {
 *     asOf: string,                          // ISO date
 *     bucketDays: number[],                  // umbrales configurados
 *     buckets: BucketSummary[],              // 1 entry por bucket dinámico
 *     totalOutstanding: number,              // suma global
 *     totalCurrent: number,                  // saldo "al día"
 *     totalOverdue: number,                  // total - current
 *   }
 *
 *   BucketSummary = {
 *     key, label, lower, upper, total, count,
 *     customers: [{ customerId, name, nit, total, count, invoices: [...] }]
 *   }
 *
 * Nota: a diferencia del endpoint legacy
 * `/api/reports/accounting/aging-receivables` (que atribuye el balance
 * total del cliente al bucket de la dueDate más antigua), este endpoint
 * distribuye el saldo POR FACTURA en su bucket real. Para clientes
 * legacy con `balance > 0` pero sin ventas a crédito abiertas, se atribuye
 * al bucket que indica la función base (mismo criterio que el legacy).
 *
 * Permiso: `treasury:view` o `treasury:manage`.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BucketCustomerSummary {
  customerId: string;
  name: string;
  nit: string | null;
  total: number;
  count: number;
  invoices: Array<{
    id: string;
    reference: string | null;
    issuedAt: string;
    dueDate: string | null;
    daysOverdue: number;
    bucketKey: string;
    outstanding: number;
    total: number;
    status: string | null;
  }>;
}

interface BucketSummary extends BucketDefinition {
  total: number;
  count: number;
  customers: BucketCustomerSummary[];
}

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
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
    const { customers, bucketDays } = await prisma.$transaction(async (tx) =>
      computeReceivablesAgingDetailed(tx, tenant.companyId, asOf),
    );

    const defs = bucketDefinitionsFor(bucketDays);
    const buckets: BucketSummary[] = defs.map((d) => ({
      ...d,
      total: 0,
      count: 0,
      customers: [],
    }));
    const byKey = new Map(buckets.map((b) => [b.key, b]));

    let totalOutstanding = 0;
    let totalCurrent = 0;

    for (const c of customers) {
      totalOutstanding += c.totalBalance;
      totalCurrent += c.buckets.current ?? 0;

      // Distribuir las facturas del cliente a su bucket real.
      // Agrupamos las invoices del cliente por bucketKey para crear
      // una entrada `BucketCustomerSummary` por bucket donde tenga
      // facturas. El "total" del cliente dentro del bucket = suma
      // de outstanding de sus facturas en ese bucket.
      const byBucket = new Map<string, BucketCustomerSummary>();
      for (const inv of c.invoices) {
        let summary = byBucket.get(inv.bucketKey);
        if (!summary) {
          summary = {
            customerId: c.customerId,
            name: c.customerName,
            nit: c.customerNit,
            total: 0,
            count: 0,
            invoices: [],
          };
          byBucket.set(inv.bucketKey, summary);
        }
        summary.total += inv.outstanding;
        summary.count += 1;
        summary.invoices.push(inv);
      }

      for (const [bucketKey, summary] of byBucket) {
        const bucket = byKey.get(bucketKey);
        if (!bucket) continue;
        bucket.customers.push(summary);
        bucket.total += summary.total;
        bucket.count += summary.count;
      }

      // Para clientes sin facturas (saldo legacy sin sales abiertas), el
      // balance se atribuye al bucket calculado por la función base.
      if (c.invoices.length === 0 && c.totalBalance > 0) {
        // Mismo criterio que la función base: bucket de oldest due, o
        // "current" si no hay dueDate. La key correcta vive en
        // `c.buckets`: tomar el primer bucket con monto > 0.
        const bucketEntry = Object.entries(c.buckets).find(
          ([k, v]) => k !== 'total' && Number(v) > 0,
        );
        const bucketKey = bucketEntry?.[0] ?? 'current';
        const bucket = byKey.get(bucketKey);
        if (bucket) {
          bucket.customers.push({
            customerId: c.customerId,
            name: c.customerName,
            nit: c.customerNit,
            total: c.totalBalance,
            count: 0,
            invoices: [],
          });
          bucket.total += c.totalBalance;
        }
      }
    }

    // Ordenar customers dentro de cada bucket por total desc para que el
    // mayor saldo aparezca primero.
    for (const b of buckets) {
      b.customers.sort((a, b2) => b2.total - a.total);
    }

    return NextResponse.json({
      asOf: asOf.toISOString(),
      bucketDays: [...bucketDays],
      buckets,
      totalOutstanding,
      totalCurrent,
      totalOverdue: totalOutstanding - totalCurrent,
    });
  } catch (err) {
    console.error('[receivables/aging] error:', err);
    return NextResponse.json(
      { error: 'Error al calcular aging de CxC' },
      { status: 500 },
    );
  }
}
