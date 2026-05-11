import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: id,
        bankAccount: { companyId: tenant.companyId },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: { select: { name: true } }
      },
      take: limit,
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error interno en el servidor.' }, { status: 500 });
  }
}
