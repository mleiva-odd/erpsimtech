import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['inventory:transfer', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const transfers = await prisma.stockTransfer.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200, // Reasonable fetch limit
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } }
          }
        }
      }
    });

    return NextResponse.json(transfers);
  } catch (error) {
    console.error('History fetch error:', error);
    return NextResponse.json({ error: 'Error al obtener bitácora' }, { status: 500 });
  }
}
