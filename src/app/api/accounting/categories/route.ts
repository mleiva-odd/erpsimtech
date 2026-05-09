import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const categories = await prisma.accountingCategory.findMany({
      where: { companyId: tenant.companyId },
      orderBy: [{ type: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { entries: true } } },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { name, type } = await req.json();
  if (!name || !type || !['INCOME', 'EXPENSE'].includes(type)) {
    return NextResponse.json({ error: 'Nombre y tipo son obligatorios' }, { status: 400 });
  }

  try {
    const cat = await prisma.accountingCategory.create({
      data: { companyId: tenant.companyId, name, type },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
