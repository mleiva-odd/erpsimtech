import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;

  const { id } = await params;
  
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: id,
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
