import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireTenant } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const roles = await prisma.customRole.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(roles);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { name, description, permissions } = await req.json();

    if (!name || !Array.isArray(permissions)) {
      return NextResponse.json({ error: 'Datos insuficientes' }, { status: 400 });
    }

    const role = await prisma.customRole.create({
      data: {
        companyId: tenant.companyId,
        name,
        description,
        permissions,
      },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    console.error('Error creating role:', error);
    return NextResponse.json({ error: 'Error al crear el rol' }, { status: 500 });
  }
}

