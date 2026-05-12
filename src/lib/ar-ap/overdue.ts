import type { PrismaClient } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Casts a `any` deliberados: ver explicación en aging.ts.

/**
 * Fase 17 · Cron diario para marcar documentos vencidos como OVERDUE
 * y reversar OVERDUE → COMPLETED cuando el cliente ya pagó (M1 fix).
 *
 * Se invoca desde `POST /api/cron/mark-overdue` (handler con secret
 * `X-Cron-Secret`). Idempotente: docs ya OVERDUE o ya pagados no se tocan.
 *
 * Ámbito:
 *   - Sales: status=COMPLETED + dueDate < now() + customer.balance > 0
 *     → SaleStatus.OVERDUE
 *   - Sales: status=OVERDUE + customer.balance=0 → SaleStatus.COMPLETED
 *     (reversa M1: cuando el cliente liquidó su deuda, las sales viejas
 *     ya no deben seguir en OVERDUE inflando aging y bloqueando ventas).
 *   - SupplierPayables: status IN (PENDING, PARTIAL) + dueDate < now()
 *     + saldo pendiente > 0 → PayableStatus.OVERDUE
 *   - SupplierPayables: status=OVERDUE + saldo=0 → PayableStatus.PAID
 *     (idempotente con flujo de pago normal).
 *
 * Devuelve contadores separados por dirección para logging.
 */
export async function markOverdueDocuments(
  prisma: PrismaClient,
  companyId?: string,
): Promise<{
  salesMarkedOverdue: number;
  salesUnmarkedOverdue: number;
  payablesMarkedOverdue: number;
  payablesUnmarkedOverdue: number;
  newlyOverdueSaleIds: string[];
}> {
  const now = new Date();

  // Sales: marcar OVERDUE.
  const salesToMark = (await (prisma as any).sale.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      status: 'COMPLETED',
      dueDate: { lt: now, not: null },
      customer: { is: { balance: { gt: 0 } } },
    },
    select: { id: true },
  })) as any[];

  let salesMarkedOverdue = 0;
  const newlyOverdueSaleIds: string[] = salesToMark.map((s) => s.id as string);
  if (newlyOverdueSaleIds.length > 0) {
    const result = (await (prisma as any).sale.updateMany({
      where: { id: { in: newlyOverdueSaleIds } },
      data: { status: 'OVERDUE' },
    })) as { count: number };
    salesMarkedOverdue = result.count;
  }

  // Sales: reversa OVERDUE → COMPLETED cuando el cliente pagó toda su deuda.
  // M1 fix: sin esto, sales históricas OVERDUE inflaban el aging para
  // siempre y `assertCustomerCanBuyOnCredit` las contaba como mora viva.
  const salesToUnmark = (await (prisma as any).sale.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      status: 'OVERDUE',
      customer: { is: { balance: { lte: 0 } } },
    },
    select: { id: true },
  })) as any[];

  let salesUnmarkedOverdue = 0;
  if (salesToUnmark.length > 0) {
    const result = (await (prisma as any).sale.updateMany({
      where: { id: { in: salesToUnmark.map((s) => s.id as string) } },
      data: { status: 'COMPLETED' },
    })) as { count: number };
    salesUnmarkedOverdue = result.count;
  }

  // SupplierPayable: usa su propio saldo (totalAmount - paidAmount > 0).
  const payablesToMark = (await (prisma as any).supplierPayable.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      status: { in: ['PENDING', 'PARTIAL'] },
      dueDate: { lt: now, not: null },
    },
    select: { id: true, totalAmount: true, paidAmount: true },
  })) as any[];

  const ids = payablesToMark
    .filter((p) => Number(p.totalAmount) - Number(p.paidAmount) > 0)
    .map((p) => p.id as string);

  let payablesMarkedOverdue = 0;
  if (ids.length > 0) {
    const result = (await (prisma as any).supplierPayable.updateMany({
      where: { id: { in: ids } },
      data: { status: 'OVERDUE' },
    })) as { count: number };
    payablesMarkedOverdue = result.count;
  }

  // SupplierPayable: reversa OVERDUE → PAID cuando saldo llegó a 0.
  // El flujo normal de payment ya marca PAID; este chequeo es defensivo
  // para payables que quedaron mal sincronizados.
  const payablesPaidOverdue = (await (prisma as any).supplierPayable.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      status: 'OVERDUE',
    },
    select: { id: true, totalAmount: true, paidAmount: true },
  })) as any[];

  const fullyPaidIds = payablesPaidOverdue
    .filter((p) => Number(p.totalAmount) - Number(p.paidAmount) <= 0)
    .map((p) => p.id as string);

  let payablesUnmarkedOverdue = 0;
  if (fullyPaidIds.length > 0) {
    const result = (await (prisma as any).supplierPayable.updateMany({
      where: { id: { in: fullyPaidIds } },
      data: { status: 'PAID' },
    })) as { count: number };
    payablesUnmarkedOverdue = result.count;
  }

  return {
    salesMarkedOverdue,
    salesUnmarkedOverdue,
    payablesMarkedOverdue,
    payablesUnmarkedOverdue,
    newlyOverdueSaleIds,
  };
}

/**
 * Notificaciones in-app: cuando una Sale pasa a OVERDUE, generar una
 * Notification visible para el dueño/cobranzas.
 *
 * En el modelo legacy Notification no tiene `userId` ni `targetRole`
 * (toda la empresa ve la notif). Fase 22 (UI/UX) agrega targeting.
 */
export async function notifyOverdueSales(
  prisma: PrismaClient,
  saleIds: string[],
): Promise<number> {
  if (saleIds.length === 0) return 0;

  const sales = (await (prisma as any).sale.findMany({
    where: { id: { in: saleIds } },
    select: {
      id: true,
      companyId: true,
      invoiceNumber: true,
      total: true,
      dueDate: true,
      customer: { select: { name: true } },
    },
  })) as any[];

  for (const s of sales) {
    if (!s.dueDate) continue;
    const days = Math.floor(
      (new Date().getTime() - new Date(s.dueDate).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    await prisma.notification.create({
      data: {
        companyId: s.companyId,
        title: `Factura vencida: ${s.invoiceNumber ?? String(s.id).slice(0, 8)}`,
        message: `Cliente ${s.customer?.name ?? 'sin nombre'} tiene factura vencida hace ${days} días por Q${Number(s.total).toFixed(2)}.`,
        type: 'WARNING',
      },
    });
  }

  return sales.length;
}
