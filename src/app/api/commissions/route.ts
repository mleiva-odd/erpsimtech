import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

/**
 * GET /api/commissions?employeeId=&from=&to=&status=
 *
 * Lista de comisiones generadas. Filtros opcionales.
 */
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get('employeeId');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const where: Record<string, unknown> = { companyId: tenant.companyId };
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;
  if (from || to) {
    const range: Record<string, unknown> = {};
    if (from) range.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.createdAt = range;
  }

  const data = await (prisma as unknown as {
    commission: { findMany: (a: unknown) => Promise<unknown[]> };
  }).commission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      sale: { select: { id: true, total: true, invoiceNumber: true, createdAt: true } },
      rule: { select: { id: true, name: true, basis: true, rate: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ data });
}
