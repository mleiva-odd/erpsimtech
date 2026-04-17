import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';

// Super Admin: Update company
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole('SUPER_ADMIN');
  if ('error' in result) return result.error;

  const resolvedParams = await params;
  const body = await req.json();

  try {
    const updated = await prisma.$transaction(async (tx) => {
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

      return tx.company.findUnique({
        where: { id: company.id },
        include: {
          _count: { select: { branches: true, users: true, sales: true } },
          subscription: {
            select: { plan: true, status: true, currentPeriodEnd: true, maxBranches: true, maxUsersPerBranch: true, price: true },
          },
        },
      });
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Slug o correo ya están en uso por otra empresa' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al actualizar empresa' }, { status: 500 });
  }
}

// Super Admin: Update subscription
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole('SUPER_ADMIN');
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
