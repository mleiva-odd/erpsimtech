import type { Prisma } from '@prisma/client';
import { daysOverdue } from './aging';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Casts a `any` deliberados: ver explicación en aging.ts.

/**
 * Fase 17 · CustomerCredit · aplicar saldos a favor a ventas a crédito y
 * bloquear ventas a crédito cuando el cliente tiene mora más allá del umbral.
 */

export class ARAPError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'ARAP_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Aplica CustomerCredit(s) disponibles a una venta a crédito.
 * Estrategia FIFO: primero los créditos más viejos (createdAt asc).
 *
 * Side effects (todos dentro de `tx`):
 *   - Crea CustomerCreditApplication por cada crédito usado.
 *   - Decrementa CustomerCredit.balance y avanza status si llega a 0.
 *   - Decrementa Customer.balance por el monto aplicado.
 *   - NO genera asiento contable (el handler de venta o cobro lo hace).
 */
export async function applyCustomerCreditsToSale(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    customerId: string;
    saleId: string;
    amountDue: number;
    userId: string;
  },
): Promise<{
  applied: number;
  remaining: number;
  applications: Array<{ creditId: string; amount: number }>;
}> {
  if (input.amountDue <= 0) {
    return { applied: 0, remaining: 0, applications: [] };
  }

  const credits = (await (tx as any).customerCredit.findMany({
    where: {
      companyId: input.companyId,
      customerId: input.customerId,
      status: { in: ['ACTIVE', 'PARTIALLY_APPLIED'] },
      balance: { gt: 0 },
    },
    orderBy: { createdAt: 'asc' },
  })) as any[];

  let remaining = input.amountDue;
  const applications: Array<{ creditId: string; amount: number }> = [];

  for (const c of credits) {
    if (remaining <= 0) break;
    const available = Number(c.balance);
    const toApply = Math.min(available, remaining);

    await (tx as any).customerCreditApplication.create({
      data: {
        customerCreditId: c.id,
        saleId: input.saleId,
        amount: toApply,
        userId: input.userId,
      },
    });

    const newBalance = available - toApply;
    const original = Number(c.amount);
    const newStatus =
      newBalance <= 0
        ? 'FULLY_APPLIED'
        : newBalance < original
          ? 'PARTIALLY_APPLIED'
          : 'ACTIVE';

    await (tx as any).customerCredit.update({
      where: { id: c.id },
      data: { balance: newBalance, status: newStatus },
    });

    applications.push({ creditId: c.id, amount: toApply });
    remaining -= toApply;
  }

  const applied = input.amountDue - remaining;

  if (applied > 0) {
    // Decrementar saldo del cliente: el credit consumió parte de su deuda.
    await tx.customer.update({
      where: { id: input.customerId },
      data: { balance: { decrement: applied } as any },
    });
  }

  return { applied, remaining, applications };
}

/**
 * Lanza ARAPError(409) si el cliente NO puede comprar a crédito por mora.
 *
 * Reglas:
 *   1. Si el nuevo monto a crédito + balance actual > creditLimit → bloquear.
 *   2. Si hay alguna Sale con dueDate < now() - maxOverdueDays → bloquear.
 */
export async function assertCustomerCanBuyOnCredit(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    newCreditAmount: number;
    asOf?: Date;
  },
): Promise<void> {
  const asOf = input.asOf ?? new Date();

  const customer = (await (tx as any).customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      name: true,
      balance: true,
      creditLimit: true,
      maxOverdueDays: true,
      sales: {
        where: {
          status: { in: ['COMPLETED', 'OVERDUE'] },
          dueDate: { not: null, lt: asOf },
          payments: { some: { method: 'CREDIT' } },
        },
        select: { id: true, dueDate: true, invoiceNumber: true },
      },
    },
  })) as any;

  if (!customer) {
    throw new ARAPError('Cliente no encontrado', 404, 'CUSTOMER_NOT_FOUND');
  }

  // Regla 1 · credit limit
  // m3 fix (verificación Fase 17): preservar la regresión vs handler legacy
  // que rechazaba clientes con creditLimit=0. Ahora también validamos esto.
  const newBalance = Number(customer.balance) + input.newCreditAmount;
  const limit = Number(customer.creditLimit);
  if (limit <= 0) {
    throw new ARAPError(
      `El cliente ${customer.name} no tiene crédito autorizado (límite Q0).`,
      409,
      'NO_CREDIT_AUTHORIZED',
    );
  }
  if (newBalance > limit) {
    throw new ARAPError(
      `Excede límite de crédito (Q${limit.toFixed(2)}). Saldo actual + venta = Q${newBalance.toFixed(2)}.`,
      409,
      'CREDIT_LIMIT_EXCEEDED',
    );
  }

  // Regla 2 · mora más allá del umbral
  const maxOverdueDays = Number(customer.maxOverdueDays ?? 30);
  for (const s of (customer.sales ?? []) as any[]) {
    if (!s.dueDate) continue;
    const days = daysOverdue(s.dueDate, asOf);
    if (days > maxOverdueDays) {
      const ref = s.invoiceNumber ?? String(s.id).slice(0, 8);
      throw new ARAPError(
        `Cliente tiene factura ${ref} vencida hace ${days} días (umbral: ${maxOverdueDays}). Cobre primero antes de vender a crédito.`,
        409,
        'CUSTOMER_OVERDUE_BLOCKED',
      );
    }
  }
}

/**
 * Genera CustomerCredit por devolución (SALE_RETURN) cuando una venta a
 * crédito se devuelve y queda saldo a favor.
 */
export async function createSaleReturnCredit(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    customerId: string;
    amount: number;
    saleReturnId: string;
    userId: string;
    notes?: string;
  },
): Promise<{ creditId: string }> {
  if (input.amount <= 0) {
    throw new ARAPError(
      'Monto debe ser positivo para generar credit por devolución',
      400,
      'INVALID_AMOUNT',
    );
  }

  const credit = (await (tx as any).customerCredit.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      amount: input.amount,
      balance: input.amount,
      status: 'ACTIVE',
      reason: 'SALE_RETURN',
      referenceType: 'SALE_RETURN',
      referenceId: input.saleReturnId,
      notes: input.notes ?? null,
      userId: input.userId,
    },
  })) as any;

  return { creditId: credit.id as string };
}
