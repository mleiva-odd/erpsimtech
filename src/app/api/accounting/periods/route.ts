import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

/**
 * GET /api/accounting/periods — lista los períodos contables de la empresa.
 */
export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage', 'reports:view']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const periods = await prisma.accountingPeriod.findMany({
    where: { companyId: tenant.companyId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: {
      id: true,
      year: true,
      month: true,
      status: true,
      closedAt: true,
      closedById: true,
      createdAt: true,
      _count: { select: { entries: true } },
    },
  });

  return NextResponse.json(periods);
}
