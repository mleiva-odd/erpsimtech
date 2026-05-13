import type { Prisma } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Casts a `any` deliberados: el cliente Prisma TS no tiene los campos
// nuevos de Fase 17 (Sale.dueDate, Customer.maxOverdueDays, etc.) ni los
// modelos CustomerCredit/CustomerCreditApplication hasta que el dueño
// corra `npx prisma generate` en su entorno con red. El shim en
// src/types/prisma-phase17.d.ts permite que TS sepa de los delegates,
// pero los selects/wheres siguen siendo estrictos a nivel del cliente
// generado actual. Cuando esto se regenere, los casts pueden afinarse.

/**
 * Fase 17 · Cálculo de aging (antigüedad de saldos) para CxC y CxP.
 *
 * Buckets estándar:
 *   - current:  no vencido (dueDate >= asOf o dueDate null)
 *   - d1_30:    1 a 30 días vencido
 *   - d31_60:   31 a 60 días vencido
 *   - d61_90:   61 a 90 días vencido
 *   - d90_plus: más de 90 días vencido
 *
 * Diseño simplificado para el legacy: el saldo del cliente
 * (`Customer.balance`) es agregado, no rastreamos saldo por documento.
 * Estrategia adoptada: el balance total del cliente se atribuye al bucket
 * de la dueDate **más antigua** entre sus sales a crédito con status
 * COMPLETED|OVERDUE. Conservador para cobranza (overstate del monto
 * vencido). Cuando se introduzca `PaymentApplication` por documento
 * (Fase 20+), se reemplaza por el método preciso.
 *
 * Para CxP usamos el mismo patrón pero por `SupplierPayable` que SÍ
 * trackea saldo por documento (paidAmount vs totalAmount). Aging exacto.
 */

/**
 * Buckets de aging. La forma legacy (current/d1_30/d31_60/d61_90/d90_plus/total)
 * se mantiene como alias para compat con UI/reports existentes. Cuando una
 * empresa configura `Company.agingBucketDays` distinto (ej. [15, 30, 45]),
 * se exponen también las keys dinámicas `bucket0..bucketN` que la UI puede
 * consumir genéricamente.
 *
 * Default thresholds = [30, 60, 90] → keys legacy current/d1_30/d31_60/d61_90/d90_plus.
 */
export interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
  /** Dinámico: cuando bucketDays no es el default, expone bucket0..bucketN. */
  [key: string]: number;
}

export const DEFAULT_AGING_BUCKET_DAYS = [30, 60, 90] as const;

export interface CustomerAging {
  customerId: string;
  customerName: string;
  customerNit: string | null;
  totalBalance: number;
  oldestDueDate: Date | null;
  oldestOverdueDays: number;
  buckets: AgingBuckets;
}

export interface SupplierAging {
  supplierId: string;
  supplierName: string;
  supplierNit: string | null;
  totalBalance: number;
  oldestDueDate: Date | null;
  oldestOverdueDays: number;
  buckets: AgingBuckets;
}

export type BucketKey = string;

/**
 * Determina la key del bucket según los umbrales configurados.
 *
 * Para los thresholds default `[30, 60, 90]` devuelve las keys legacy:
 *   `current` | `d1_30` | `d31_60` | `d61_90` | `d90_plus`
 *
 * Para thresholds custom (ej. `[15, 30, 45]`) devuelve:
 *   `current` | `d1_15` | `d16_30` | `d31_45` | `d46_plus`
 *
 * Si `dueDate` es null o futuro → `current`.
 *
 * El `bucketDays` debe estar ordenado ascendentemente. Default fallback
 * a `DEFAULT_AGING_BUCKET_DAYS` si se omite (compat con call sites antiguos).
 */
export function computeBucket(
  dueDate: Date | null | undefined,
  asOf: Date,
  bucketDays: readonly number[] = DEFAULT_AGING_BUCKET_DAYS,
): BucketKey {
  if (!dueDate) return 'current';
  const days = daysOverdue(dueDate, asOf);
  if (days <= 0) return 'current';

  // Encontrar el primer threshold >= days. Si ninguno, es el overflow bucket.
  let prevThreshold = 0;
  for (const threshold of bucketDays) {
    if (days <= threshold) {
      return formatBucketKey(prevThreshold + 1, threshold);
    }
    prevThreshold = threshold;
  }
  // Overflow: días > último threshold.
  return formatBucketKey(prevThreshold + 1, null);
}

/**
 * Formatea key bucket. `null` `upper` = overflow (sin tope).
 * Para mantener compat con UIs viejas, mapea los 3 thresholds default
 * a las keys legacy.
 */
function formatBucketKey(lower: number, upper: number | null): BucketKey {
  // Caso especial: si matches el default 30/60/90, usar keys legacy.
  if (upper === 30 && lower === 1) return 'd1_30';
  if (upper === 60 && lower === 31) return 'd31_60';
  if (upper === 90 && lower === 61) return 'd61_90';
  if (upper === null && lower === 91) return 'd90_plus';
  // Custom: keys dinámicas.
  if (upper === null) return `d${lower}_plus`;
  return `d${lower}_${upper}`;
}

/**
 * Lista de keys que el bucket emite para una config dada.
 * Útil para la UI saber qué columnas renderizar.
 */
export function bucketKeysFor(
  bucketDays: readonly number[] = DEFAULT_AGING_BUCKET_DAYS,
): BucketKey[] {
  const keys: BucketKey[] = ['current'];
  let prev = 0;
  for (const t of bucketDays) {
    keys.push(formatBucketKey(prev + 1, t));
    prev = t;
  }
  keys.push(formatBucketKey(prev + 1, null));
  return keys;
}

/** Días vencidos entre dueDate y asOf (negativo si futuro). */
export function daysOverdue(dueDate: Date, asOf: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const due = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  ).getTime();
  const ref = new Date(
    asOf.getFullYear(),
    asOf.getMonth(),
    asOf.getDate(),
  ).getTime();
  return Math.floor((ref - due) / msPerDay);
}

function emptyBuckets(
  bucketDays: readonly number[] = DEFAULT_AGING_BUCKET_DAYS,
): AgingBuckets {
  // Inicializa todas las keys que la config va a usar a 0.
  // Mantiene siempre las keys legacy en 0 para que la UI vieja siga funcionando.
  const base: AgingBuckets = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
    total: 0,
  };
  for (const key of bucketKeysFor(bucketDays)) {
    if (!(key in base)) base[key] = 0;
  }
  return base;
}

function addToBucket(buckets: AgingBuckets, key: BucketKey, amount: number): void {
  buckets[key] = (buckets[key] ?? 0) + amount;
  buckets.total += amount;
}

/**
 * Lee `Company.agingBucketDays` (configurable). Fallback al default si la
 * empresa no tiene config o si tx no puede leerla.
 */
async function getCompanyBucketDays(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<readonly number[]> {
  try {
    const c = (await (tx as any).company.findUnique({
      where: { id: companyId },
      select: { agingBucketDays: true } as never,
    })) as { agingBucketDays?: number[] | null } | null;
    if (c?.agingBucketDays && Array.isArray(c.agingBucketDays) && c.agingBucketDays.length > 0) {
      // Ordenar ascendente por seguridad.
      return [...c.agingBucketDays].sort((a, b) => a - b);
    }
  } catch {
    /* schema column may not exist yet — fallback al default */
  }
  return DEFAULT_AGING_BUCKET_DAYS;
}

/**
 * Aging de cuentas por cobrar (CxC) por cliente.
 *
 * Asignación de balance: ver doc del módulo arriba.
 */
export async function computeReceivablesAging(
  tx: Prisma.TransactionClient,
  companyId: string,
  asOf: Date = new Date(),
): Promise<CustomerAging[]> {
  const bucketDays = await getCompanyBucketDays(tx, companyId);

  const customers = (await (tx as any).customer.findMany({
    where: {
      companyId,
      balance: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      nit: true,
      balance: true,
      sales: {
        where: {
          status: { in: ['COMPLETED', 'OVERDUE', 'PENDING'] },
          dueDate: { not: null },
          payments: { some: { method: 'CREDIT' } },
        },
        select: { id: true, dueDate: true, total: true, createdAt: true },
        orderBy: { dueDate: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })) as any[];

  return customers.map((c) => {
    const buckets = emptyBuckets(bucketDays);
    const balance = Number(c.balance);
    const oldestSale = c.sales?.[0];
    const oldestDue: Date | null = oldestSale?.dueDate ?? null;
    const overdueDays = oldestDue ? Math.max(0, daysOverdue(oldestDue, asOf)) : 0;
    const bucketKey = computeBucket(oldestDue, asOf, bucketDays);
    addToBucket(buckets, bucketKey, balance);

    return {
      customerId: c.id,
      customerName: c.name,
      customerNit: c.nit ?? null,
      totalBalance: balance,
      oldestDueDate: oldestDue,
      oldestOverdueDays: overdueDays,
      buckets,
    };
  });
}

/**
 * Aging de cuentas por pagar (CxP) por proveedor.
 *
 * Para cada SupplierPayable con saldo pendiente (totalAmount - paidAmount > 0),
 * clasificamos su saldo en el bucket que corresponda a su dueDate.
 * Suma por proveedor.
 */
export async function computePayablesAging(
  tx: Prisma.TransactionClient,
  companyId: string,
  asOf: Date = new Date(),
): Promise<SupplierAging[]> {
  const bucketDays = await getCompanyBucketDays(tx, companyId);

  const payables = (await (tx as any).supplierPayable.findMany({
    where: {
      companyId,
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    },
    select: {
      id: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      supplier: { select: { id: true, name: true, nit: true } },
    },
  })) as any[];

  const bySupplier = new Map<string, SupplierAging>();

  for (const p of payables) {
    const pendingAmount = Number(p.totalAmount) - Number(p.paidAmount);
    if (pendingAmount <= 0) continue;
    const key = p.supplier.id as string;

    let entry = bySupplier.get(key);
    if (!entry) {
      entry = {
        supplierId: p.supplier.id,
        supplierName: p.supplier.name,
        supplierNit: p.supplier.nit ?? null,
        totalBalance: 0,
        oldestDueDate: null,
        oldestOverdueDays: 0,
        buckets: emptyBuckets(bucketDays),
      };
      bySupplier.set(key, entry);
    }

    const bucketKey = computeBucket(p.dueDate, asOf, bucketDays);
    addToBucket(entry.buckets, bucketKey, pendingAmount);
    entry.totalBalance += pendingAmount;

    // Track the oldest dueDate
    if (p.dueDate) {
      const overdueDays = Math.max(0, daysOverdue(p.dueDate, asOf));
      if (!entry.oldestDueDate || p.dueDate < entry.oldestDueDate) {
        entry.oldestDueDate = p.dueDate;
        entry.oldestOverdueDays = overdueDays;
      }
    }
  }

  return Array.from(bySupplier.values()).sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName),
  );
}
