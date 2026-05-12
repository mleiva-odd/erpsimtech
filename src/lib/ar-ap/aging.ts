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

export interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

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

export type BucketKey = keyof Omit<AgingBuckets, 'total'>;

/**
 * Clasifica un dueDate en su bucket según asOf.
 * Si dueDate es null o futuro → 'current'.
 */
export function computeBucket(
  dueDate: Date | null | undefined,
  asOf: Date,
): BucketKey {
  if (!dueDate) return 'current';
  const days = daysOverdue(dueDate, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
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

function emptyBuckets(): AgingBuckets {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
}

function addToBucket(buckets: AgingBuckets, key: BucketKey, amount: number): void {
  buckets[key] += amount;
  buckets.total += amount;
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
    const buckets = emptyBuckets();
    const balance = Number(c.balance);
    const oldestSale = c.sales?.[0];
    const oldestDue: Date | null = oldestSale?.dueDate ?? null;
    const overdueDays = oldestDue ? Math.max(0, daysOverdue(oldestDue, asOf)) : 0;
    const bucketKey = computeBucket(oldestDue, asOf);
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
        buckets: emptyBuckets(),
      };
      bySupplier.set(key, entry);
    }

    const bucketKey = computeBucket(p.dueDate, asOf);
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
