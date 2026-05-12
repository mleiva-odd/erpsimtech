import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { hashPassword, validatePasswordStrength } from '@/lib/hashing';
import { PLANS, type PlanId } from '@/lib/plans';
import { seedChartOfAccounts, ensureAccountingPeriod } from '@/lib/accounting';

/**
 * Calcula valores por defecto del Subscription a partir del catálogo
 * canónico en `src/lib/plans.ts`. Usa precio FOUNDER por default
 * (mientras estamos en fase 1 de Tecpán); cuando hagamos billing real
 * se decide founder vs regular según `founderCapacity` restante.
 */
function getPlanDefaults(plan: string) {
  const known: PlanId[] = ['trial', 'negocio', 'comercial', 'enterprise'];
  const planId = (known.includes(plan as PlanId) ? plan : 'trial') as PlanId;
  const def = PLANS[planId];

  // Sucursales: -1 = ilimitado en el catálogo. En Subscription guardamos
  // un número finito grande para compat con UI que asume número.
  const maxBranches = def.quotas.branches === -1 ? 999 : def.quotas.branches;
  // Usuarios totales del plan / sucursales = "usuarios por sucursal" (legacy field).
  const totalUsers = def.quotas.users === -1 ? 999 : def.quotas.users;
  const maxUsersPerBranch = Math.max(1, Math.ceil(totalUsers / Math.max(1, maxBranches)));

  // Precio mensual founder por default. Si el plan no tiene precio
  // (Empresarial = cotización), guardamos 0 y se ajusta al firmar contrato.
  const price = def.pricing ? def.pricing.founderMonthly : 0;

  return {
    status: planId === 'trial' ? ('TRIAL' as const) : ('ACTIVE' as const),
    maxBranches,
    maxUsersPerBranch,
    price,
  };
}

// Super Admin: List all companies
export async function GET(req: NextRequest) {
  const result = await requirePermission('admin:all');
  if ('error' in result) return result.error;

  try {
    const companies = await prisma.company.findMany({
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
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(companies);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

// Super Admin: Create a new company
export async function POST(req: NextRequest) {
  const result = await requirePermission('admin:all');
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

    // Política de contraseña centralizada (12+ chars, complejidad).
    const strength = validatePasswordStrength(adminPassword);
    if (!strength.ok) {
      return NextResponse.json(
        { error: 'Contraseña de admin débil', details: strength.errors },
        { status: 400 },
      );
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // 1. Hash the password (rounds centralizados en lib/hashing).
    const hashedPassword = await hashPassword(adminPassword);

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

      // Create or get the Administrador CustomRole for this company
      const adminRole = await tx.customRole.create({
        data: {
          companyId: newCompany.id,
          name: 'Administrador',
          description: 'Administrador de la empresa con acceso total',
          permissions: [
            'pos:access', 'pos:discount', 'sales:view', 'sales:void',
            'inventory:view', 'inventory:adjust', 'inventory:transfer',
            'purchases:view', 'purchases:create',
            'treasury:view', 'treasury:manage',
            'reports:view', 'reports:export',
            'customers:view', 'customers:manage',
            'suppliers:view', 'suppliers:manage',
            'settings:manage', 'users:manage',
            'hr:manage', 'payroll:manage',
          ],
        },
      });

      await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          password: hashedPassword,
          role: 'USER',
          companyId: newCompany.id,
          branchId: mainBranchId,
          customRoleId: adminRole.id,
        }
      });

      // Plan de cuentas + período contable inicial (Fase 14).
      await seedChartOfAccounts(tx, newCompany.id);
      await ensureAccountingPeriod(tx, newCompany.id, new Date());

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
