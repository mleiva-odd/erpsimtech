import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;

  const suppliers = await prisma.supplier.findMany({
    where: { companyId: result.tenant.companyId, active: true },
    orderBy: { name: 'asc' }
  });

  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;

  const body = await req.json();
  const { name, contactName, email, phone, nit, address } = body;

  try {
    const supplier = await prisma.supplier.create({
      data: {
        companyId: result.tenant.companyId,
        name,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        nit: nit || null,
        address: address || null,
      }
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un proveedor con este Nombre o NIT.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 });
  }
}
