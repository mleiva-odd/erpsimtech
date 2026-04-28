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

  const resolvedParams = await params;
  const body = await req.json();

  try {
    const existing = await prisma.branch.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 });
    }

    // If setting as main, unset others first
    if (body.isMain && !existing.isMain) {
      await prisma.branch.updateMany({
        where: { companyId: tenant.companyId, isMain: true },
        data: { isMain: false },
      });
    }

    const updated = await prisma.branch.update({
      where: { id: resolvedParams.id },
      data: {
        name: body.name,
        code: body.code,
        address: body.address || null,
        phone: body.phone || null,
        isMain: body.isMain ?? existing.isMain,
        active: body.active ?? existing.active,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Ya existe una sucursal con ese código' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al actualizar sucursal' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const existing = await prisma.branch.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 });
    }

    if (existing.isMain) {
      return NextResponse.json({ error: 'No puedes eliminar la sucursal principal' }, { status: 400 });
    }

    // Check for active sales/registers
    const activeSales = await prisma.sale.count({ where: { branchId: resolvedParams.id } });
    if (activeSales > 0) {
      // Soft delete - deactivate
      await prisma.branch.update({
        where: { id: resolvedParams.id },
        data: { active: false },
      });
      return NextResponse.json({ message: 'Sucursal desactivada (tiene ventas asociadas)' });
    }

    await prisma.branch.delete({ where: { id: resolvedParams.id } });
    return NextResponse.json({ message: 'Sucursal eliminada' });
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar sucursal' }, { status: 500 });
  }
}
