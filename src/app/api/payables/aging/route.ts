import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';
import {
  bucketDefinitionsFor,
  computePayablesAgingDetailed,
  type BucketDefinition,
} from '@/lib/ar-ap/aging';

/**
 * Fase 22c · Aging de cuentas por pagar con drill-down.
 *
 * Mismo contrato que /api/receivables/aging pero con `suppliers`
 * en lugar de `customers`. Aging exacto: cada payable contribuye su
 * saldo pendiente al bucket de su propia dueDate.
 *
 * Permiso: `treasury:view` o `treasury:manage`.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BucketSupplierSummary {
  supplierId: string;
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
  suppliers: BucketSupplierSummary[];
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
    const { suppliers, bucketDays } = await prisma.$transaction(async (tx) =>
      computePayablesAgingDetailed(tx, tenant.companyId, asOf),
    );

    const defs = bucketDefinitionsFor(bucketDays);
    const buckets: BucketSummary[] = defs.map((d) => ({
      ...d,
      total: 0,
      count: 0,
      suppliers: [],
    }));
    const byKey = new Map(buckets.map((b) => [b.key, b]));

    let totalOutstanding = 0;
    let totalCurrent = 0;

    for (const s of suppliers) {
      totalOutstanding += s.totalBalance;
      totalCurrent += s.buckets.current ?? 0;

      const byBucket = new Map<string, BucketSupplierSummary>();
      for (const inv of s.invoices) {
        let summary = byBucket.get(inv.bucketKey);
        if (!summary) {
          summary = {
            supplierId: s.supplierId,
            name: s.supplierName,
            nit: s.supplierNit,
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
        bucket.suppliers.push(summary);
        bucket.total += summary.total;
        bucket.count += summary.count;
      }
    }

    for (const b of buckets) {
      b.suppliers.sort((a, b2) => b2.total - a.total);
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
    console.error('[payables/aging] error:', err);
    return NextResponse.json(
      { error: 'Error al calcular aging de CxP' },
      { status: 500 },
    );
  }
}
