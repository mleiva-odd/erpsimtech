import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { hashPassword, validatePasswordStrength } from '@/lib/hashing';

// Super Admin: Update company
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('admin:all');
  if ('error' in result) return result.error;

  const resolvedParams = await params;
  const body = await req.json();

  // Validar fuerza de contraseña ANTES de entrar a la transacción
  // para no devolver 500 cuando lo correcto es 400.
  if (typeof body?.admin?.password === 'string' && body.admin.password.trim()) {
    const strength = validatePasswordStrength(body.admin.password.trim());
    if (!strength.ok) {
      return NextResponse.json(
        { error: 'Contraseña de admin débil', details: strength.errors },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const primaryAdmin = await tx.user.findFirst({
        where: {
          companyId: resolvedParams.id,
          customRole: { name: 'Administrador' },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      const company = await tx.company.update({
        where: { id: resolvedParams.id },
        data: {
          name: body.name,
          slug: body.slug,
          email: body.email,
          phone: body.phone || null,
          nit: body.nit || null,
          active: body.active,
        },
      });

      if (body.subscription) {
        await tx.subscription.update({
          where: { companyId: resolvedParams.id },
          data: {
            plan: body.subscription.plan,
            status: body.subscription.status,
            maxBranches: Number(body.subscription.maxBranches),
            maxUsersPerBranch: Number(body.subscription.maxUsersPerBranch),
            price: Number(body.subscription.price || 0),
          },
        });
      }

      if (body.admin && primaryAdmin) {
        const adminData: {
          name?: string;
          email?: string;
          password?: string;
        } = {};

        if (typeof body.admin.name === 'string' && body.admin.name.trim()) {
          adminData.name = body.admin.name.trim();
        }

        if (typeof body.admin.email === 'string' && body.admin.email.trim()) {
          adminData.email = body.admin.email.trim().toLowerCase();
        }

        if (typeof body.admin.password === 'string' && body.admin.password.trim()) {
          // La fuerza ya se validó fuera de la transacción.
          adminData.password = await hashPassword(body.admin.password.trim());
        }

        if (Object.keys(adminData).length > 0) {
          await tx.user.update({
            where: { id: primaryAdmin.id },
            data: adminData,
          });
        }
      }

      return tx.company.findUnique({
        where: { id: company.id },
        include: {
          _count: { select: { branches: true, users: true, sales: true } },
          subscription: {
            select: { plan: true, status: true, currentPeriodEnd: true, maxBranches: true, maxUsersPerBranch: true, price: true },
          },
          users: {
            where: { customRole: { name: 'Administrador' } },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, name: true, email: true },
          },
        },
      });
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Slug o correo ya están en uso' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al actualizar empresa' }, { status: 500 });
  }
}

// Super Admin: Update subscription
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('admin:all');
  if ('error' in result) return result.error;

  const resolvedParams = await params;
  const body = await req.json();

  try {
    const subscription = await prisma.subscription.update({
      where: { companyId: resolvedParams.id },
      data: {
        plan: body.plan,
        status: body.status,
        maxBranches: body.maxBranches,
        maxUsersPerBranch: body.maxUsersPerBranch,
        price: body.price,
      },
    });
    return NextResponse.json(subscription);
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar suscripción' }, { status: 500 });
  }
}
