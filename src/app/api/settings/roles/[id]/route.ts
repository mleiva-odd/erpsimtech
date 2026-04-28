import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const { name, description, permissions } = await req.json();

    const existing = await prisma.customRole.findFirst({
      where: { id, companyId: tenant.companyId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
    }

    const updated = await prisma.customRole.update({
      where: { id },
      data: { name, description, permissions },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar el rol' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const existing = await prisma.customRole.findFirst({
      where: { id, companyId: tenant.companyId },
      include: { _count: { select: { users: true } } }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
    }

    if (existing._count.users > 0) {
      return NextResponse.json({ 
        error: 'No se puede eliminar un rol que tiene usuarios asignados. Reasigna a los usuarios primero.' 
      }, { status: 400 });
    }

    await prisma.customRole.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar el rol' }, { status: 500 });
  }
}
