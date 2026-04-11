import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

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
    const { name, slug, email, phone, nit, plan, adminName, adminPassword } = body;

    if (!name || !slug || !email || !adminName || !adminPassword) {
      return NextResponse.json({ 
        error: 'Nombre de empresa, slug, email, nombre del dueño y contraseña son requeridos' 
      }, { status: 400 });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // 1. Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 2. Create company with nested branch, settings, subscription, AND the first Admin user
    const company = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
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
        }
      });

      // 3. Create the Admin User linked correctly
      const mainBranchId = newCompany.branches[0].id;

      await tx.user.create({
        data: {
          name: adminName,
          email: email, // Usamos el email de la empresa para el admin por defecto
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
    console.error('Error creating company:', error);
    if (message.includes('Unique constraint')) {
      if (message.includes('email')) {
        return NextResponse.json({ error: 'El email ya está registrado para otro usuario o empresa' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Ya existe una empresa con ese slug' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al crear empresa y administrador' }, { status: 500 });
  }
}
