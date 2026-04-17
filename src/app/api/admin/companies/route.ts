import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

function getPlanDefaults(plan: string) {
  switch (plan) {
    case 'basic':
      return { status: 'ACTIVE' as const, maxBranches: 1, maxUsersPerBranch: 3, price: 0 };
    case 'professional':
      return { status: 'ACTIVE' as const, maxBranches: 3, maxUsersPerBranch: 5, price: 0 };
    case 'enterprise':
      return { status: 'ACTIVE' as const, maxBranches: 10, maxUsersPerBranch: 15, price: 0 };
    case 'trial':
    default:
      return { status: 'TRIAL' as const, maxBranches: 2, maxUsersPerBranch: 3, price: 0 };
  }
}

// Super Admin: List all companies
export async function GET(req: NextRequest) {
  const result = await requireRole('SUPER_ADMIN');
  if ('error' in result) return result.error;

  try {
    const companies = await prisma.company.findMany({
      include: {
        _count: { select: { branches: true, users: true, sales: true } },
        subscription: {
          select: { plan: true, status: true, currentPeriodEnd: true, maxBranches: true, maxUsersPerBranch: true, price: true },
        },
        users: {
          where: { role: 'ADMIN' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, name: true, email: true },
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
    const { name, slug, email, phone, nit, plan, adminName, adminEmail, adminPassword } = body;
    const selectedPlan = plan || 'trial';
    const planDefaults = getPlanDefaults(selectedPlan);

    // Validación estricta de campos obligatorios
    if (!name || !slug || !email || !adminName || !adminEmail || !adminPassword) {
      return NextResponse.json({ 
        error: 'Los datos de la empresa y del administrador son obligatorios' 
      }, { status: 400 });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // 1. Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 2. Create company ecosystem (Transaction)
    const company = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name,
          slug,
          email, // Correo de contacto de la empresa
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
              plan: selectedPlan,
              status: planDefaults.status,
              maxBranches: planDefaults.maxBranches,
              maxUsersPerBranch: planDefaults.maxUsersPerBranch,
              price: planDefaults.price,
              currentPeriodStart: new Date(),
              currentPeriodEnd: trialEnd,
              trialEndsAt: selectedPlan === 'trial' ? trialEnd : null,
            },
          },
        },
        include: {
          branches: true,
        }
      });

      // 3. Create the Administrator User with their own access email
      const mainBranchId = newCompany.branches[0].id;

      await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail, // Correo de ACCESO del administrador
          password: hashedPassword,
          role: 'ADMIN',
          companyId: newCompany.id,
          branchId: mainBranchId,
        }
      });

      return newCompany;
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    console.error('Error creating company/admin:', error);
    if (message.includes('Unique constraint')) {
      if (message.includes('email')) {
        return NextResponse.json({ error: 'El correo de acceso del administrador ya está en uso' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Ya existe una empresa con ese slug (URL)' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al procesar el registro' }, { status: 500 });
  }
}
