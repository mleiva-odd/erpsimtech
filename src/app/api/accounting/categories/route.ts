import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireTenant();
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
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  if (!tenant.permissions?.includes('treasury:manage') && tenant.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

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
