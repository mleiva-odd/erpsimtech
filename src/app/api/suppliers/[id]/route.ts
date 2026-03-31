import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  
  const resolvedParams = await params;
  const body = await req.json();

  try {
    const defaultSupplier = await prisma.supplier.findFirst({
      where: { id: resolvedParams.id, companyId: result.tenant.companyId }
    });
    if (!defaultSupplier) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    const supplier = await prisma.supplier.update({
      where: { id: resolvedParams.id },
      data: {
        name: body.name,
        contactName: body.contactName,
        email: body.email,
        phone: body.phone,
        nit: body.nit,
        address: body.address,
      }
    });
    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const resolvedParams = await params;

  try {
    // Soft delete to preserve purchase records
    const supplier = await prisma.supplier.update({
      where: { id: resolvedParams.id },
      data: { active: false }
    });
    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
