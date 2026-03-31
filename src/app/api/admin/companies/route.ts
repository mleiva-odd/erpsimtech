import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';

// Super Admin: List all companies
export async function GET(req: NextRequest) {
  const result = await requireRole('SUPER_ADMIN');
  if ('error' in result) return result.error;

  try {
    const companies = await prisma.company.findMany({
      include: {
        _count: { select: { branches: true, users: true, sales: true } },
        subscription: {
          select: { plan: true, status: true, currentPeriodEnd: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(companies);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

// Super Admin: Create a new company
export async function POST(req: NextRequest) {
  const result = await requireRole('SUPER_ADMIN');
  if ('error' in result) return result.error;

  try {
    const body = await req.json();
    const { name, slug, email, phone, nit, plan } = body;

    if (!name || !slug || !email) {
      return NextResponse.json({ error: 'Nombre, slug y email son requeridos' }, { status: 400 });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        email,
        phone: phone || null,
        nit: nit || null,
        branches: {
          create: {
            name: 'Sucursal Central',
            code: 'SUC-01',
            isMain: true,
          },
        },
        settings: {
          create: {
            storeName: name,
            nit: nit || null,
            phone: phone || null,
          },
        },
        subscription: {
          create: {
            plan: plan || 'trial',
            status: 'TRIAL',
            maxBranches: 3,
            maxUsersPerBranch: 5,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEnd,
            trialEndsAt: trialEnd,
          },
        },
      },
      include: {
        branches: true,
        subscription: true,
      },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Ya existe una empresa con ese slug' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al crear empresa' }, { status: 500 });
  }
}
