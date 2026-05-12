import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { computeReceivablesAging } from '@/lib/ar-ap/aging';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fase 17 · Estado de cuenta del cliente.
 *
 * Lista cronológica de ventas + pagos + saldo + aging.
 *
 * Query params:
 *   - from / to: rango de fechas (ISO). Default: últimos 6 meses.
 *   - format: 'json' (default) | 'csv'.
 *
 * Para PDF: se genera client-side en la UI usando jspdf con el JSON.
 * (Evitamos generar PDF server-side para no agregar deps pesadas y porque
 * los reportes existentes ya usan ese patrón.)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('customers:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const format = (sp.get('format') ?? 'json').toLowerCase();
  const fromParam = sp.get('from');
  const toParam = sp.get('to');

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getFullYear(), to.getMonth() - 6, to.getDate());

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  // Tenant guard: el cliente debe ser de esta empresa.
  const customer = (await (prisma as any).customer.findFirst({
    where: { id, companyId: tenant.companyId },
    select: {
      id: true,
      name: true,
      nit: true,
      email: true,
      phone: true,
      address: true,
      balance: true,
      creditLimit: true,
      creditDaysDefault: true,
      maxOverdueDays: true,
    },
  })) as any;

  if (!customer) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const [sales, payments, credits, aging] = await Promise.all([
    (prisma as any).sale.findMany({
      where: {
        companyId: tenant.companyId,
        customerId: id,
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        status: true,
        dueDate: true,
        createdAt: true,
        payments: {
          select: { method: true, amount: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.accountPayment.findMany({
      where: {
        customerId: id,
        customer: { is: { companyId: tenant.companyId } },
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        amount: true,
        method: true,
        reference: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    (prisma as any).customerCredit.findMany({
      where: {
        companyId: tenant.companyId,
        customerId: id,
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        amount: true,
        balance: true,
        status: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.$transaction(async (tx) =>
      computeReceivablesAging(tx, tenant.companyId, to),
    ),
  ]);

  const myAging = aging.find((a) => a.customerId === id);

  const payload = {
    customer,
    range: { from: from.toISOString(), to: to.toISOString() },
    sales,
    payments,
    credits,
    aging: myAging ?? {
      customerId: id,
      customerName: customer.name,
      customerNit: customer.nit,
      totalBalance: 0,
      oldestDueDate: null,
      oldestOverdueDays: 0,
      buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
    },
  };

  if (format === 'csv') {
    const lines: string[] = [
      `Estado de Cuenta — ${customer.name} (NIT ${customer.nit ?? 'SIN NIT'})`,
      `Periodo: ${from.toISOString().slice(0, 10)} a ${to.toISOString().slice(0, 10)}`,
      `Saldo actual: Q${Number(customer.balance).toFixed(2)}  |  Límite: Q${Number(customer.creditLimit).toFixed(2)}`,
      ``,
      `Fecha,Tipo,Referencia,Monto,Estado,Vencimiento`,
    ];
    for (const s of sales as any[]) {
      lines.push(
        [
          s.createdAt.toISOString().slice(0, 10),
          'Venta',
          s.invoiceNumber ?? s.id.slice(0, 8),
          Number(s.total).toFixed(2),
          s.status,
          s.dueDate ? s.dueDate.toISOString().slice(0, 10) : '',
        ].join(','),
      );
    }
    for (const p of payments) {
      lines.push(
        [
          p.createdAt.toISOString().slice(0, 10),
          'Pago',
          p.reference ?? p.id.slice(0, 8),
          Number(p.amount).toFixed(2),
          p.status,
          '',
        ].join(','),
      );
    }
    const csv = lines.join('\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="estado-cuenta-${customer.name.replace(/\W+/g, '_')}.csv"`,
      },
    });
  }

  return NextResponse.json(payload);
}
