import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

/**
 * GET /api/accounting/journal/[id] — detalle de asiento.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage', 'reports:view']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId: tenant.companyId },
    include: {
      lines: { include: { account: { select: { code: true, name: true, type: true } } } },
      user: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      period: { select: { year: true, month: true, status: true } },
      reversedBy: { select: { id: true, date: true, description: true } },
      reversedEntry: { select: { id: true, date: true, description: true } },
    },
  });

  if (!entry) {
    return NextResponse.json({ error: 'Asiento no encontrado' }, { status: 404 });
  }
  return NextResponse.json(entry);
}
