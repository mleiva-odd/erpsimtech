import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole('ADMIN');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;
  const body = await req.json();

  try {
    // Verify user belongs to this company
    const existing = await prisma.user.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Validate branch if provided
    if (body.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: body.branchId, companyId: tenant.companyId },
      });
      if (!branch) {
        return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 400 });
      }
    }

    if (body.branchAccess !== undefined && Array.isArray(body.branchAccess) && body.branchAccess.length > 0) {
      const validBranches = await prisma.branch.count({
        where: {
          id: { in: body.branchAccess },
          companyId: tenant.companyId,
        },
      });

      if (validBranches !== body.branchAccess.length) {
        return NextResponse.json({ error: 'Hay sucursales fuera de tu empresa en el acceso asignado' }, { status: 400 });
      }
    }

    let dataToUpdate: any = {
      name: body.name,
      email: body.email,
      role: body.role,
      active: body.active,
      branchId: body.branchId || null,
    };

    if (body.branchAccess !== undefined && Array.isArray(body.branchAccess)) {
      dataToUpdate.branchAccess = {
        deleteMany: {}, // Clear previous linkages via CASCADE simulation over the join table relative to this user
        create: body.branchAccess.map((id: string) => ({ branchId: id }))
      };
    }

    if (body.password) {
      dataToUpdate.password = await bcrypt.hash(body.password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: resolvedParams.id },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        branch: { select: { id: true, name: true } },
        branchAccess: { select: { branch: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole('ADMIN');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  if (tenant.userId === resolvedParams.id) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });
  }

  try {
    // Verify user belongs to this company
    const existing = await prisma.user.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id: resolvedParams.id },
      data: { active: false },
    });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: 'Error al desactivar usuario' }, { status: 500 });
  }
}
