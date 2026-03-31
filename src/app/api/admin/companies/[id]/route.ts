import { NextRequest, NextResponse } from 'next/server';
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
    const updated = await prisma.company.update({
      where: { id: resolvedParams.id },
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        nit: body.nit,
        active: body.active,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
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
