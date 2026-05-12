import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { requirePermission } from '@/lib/tenant';
import { z } from 'zod';
import { hashPassword, PASSWORD_MIN_LENGTH } from '@/lib/hashing';
import { seedChartOfAccounts, ensureAccountingPeriod } from '@/lib/accounting';

const OnboardingSchema = z.object({
  // Company info
  companyName: z.string().trim().min(2, 'Nombre de empresa requerido'),
  companySlug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  companyEmail: z.string().trim().toLowerCase().email('Email inválido'),
  companyPhone: z.string().optional().or(z.literal('')),
  companyNit: z.string().optional().or(z.literal('')),
  // Fase 16: régimen tributario. Opcional acá — si no se envía, la empresa
  // queda con `taxRegime=null` y el admin debe setearlo en Settings antes
  // de poder facturar (POST /api/sales devuelve 400).
  taxRegime: z.enum(['GENERAL', 'PEQUENO_CONTRIBUYENTE']).optional().nullable(),
  // Admin user
  adminName: z.string().trim().min(2, 'Nombre del administrador requerido'),
  adminEmail: z.string().trim().toLowerCase().email('Email del admin inválido'),
  adminPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
    .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
    .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
    .regex(/[0-9]/, 'Debe incluir al menos un dígito')
    .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un símbolo'),
  // First branch
  branchName: z.string().trim().min(2, 'Nombre de sucursal requerido').default('Sucursal Central'),
  branchCode: z.string().trim().min(2).default('SUC-01'),
  branchAddress: z.string().optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  const result = await requirePermission('admin:all');
  if ('error' in result) return result.error;

  try {
    const body = await req.json();
    const parsed = OnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Datos inválidos',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const data = parsed.data;

    // Check for existing slug
    const existingCompany = await prisma.company.findFirst({
      where: { slug: data.companySlug },
    });
    if (existingCompany) {
      return NextResponse.json({ error: 'Ya existe una empresa con ese identificador (slug)' }, { status: 409 });
    }

    // Check for existing admin email
    const existingUser = await prisma.user.findFirst({
      where: { email: data.adminEmail },
    });
    if (existingUser) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo electrónico' }, { status: 409 });
    }

    // Hash admin password (rounds centralizados en lib/hashing)
    const hashedPassword = await hashPassword(data.adminPassword);

    // Trial period: 30 days
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // Create everything in a transaction
    const company = await prisma.$transaction(async (tx) => {
      // 1. Create company with branch and settings
      // Cast: el cliente Prisma generado en sandbox no tiene `taxRegime`
      // en CompanyCreateInput todavía.
      const newCompany = (await tx.company.create({
        data: ({
          name: data.companyName,
          slug: data.companySlug,
          email: data.companyEmail,
          phone: data.companyPhone || null,
          nit: data.companyNit || null,
          // Fase 16: régimen tributario (opcional al onboarding).
          taxRegime: data.taxRegime ?? null,
          branches: {
            create: {
              name: data.branchName,
              code: data.branchCode,
              address: data.branchAddress || null,
              isMain: true,
            },
          },
          settings: {
            create: {
              storeName: data.companyName,
              nit: data.companyNit || null,
              phone: data.companyPhone || null,
              address: data.branchAddress || null,
              receiptMsg: '¡Gracias por su compra!',
            },
          },
          subscription: {
            create: {
              // Trial inicial — al expirar el cliente debe elegir Negocio o Comercial
              // según su tamaño. Cuotas matchean PLANS.trial en src/lib/plans.ts.
              plan: 'trial',
              status: 'TRIAL',
              maxBranches: 2,
              maxUsersPerBranch: 3,
              price: 0,
              currentPeriodStart: new Date(),
              currentPeriodEnd: trialEnd,
              trialEndsAt: trialEnd,
            },
          },
        } as unknown) as Parameters<typeof tx.company.create>[0]['data'],
        include: { branches: true },
      })) as { id: string; name: string; slug: string; branches: Array<{ id: string }> };

      // 2. Create Administrador CustomRole and admin user
      const mainBranch = newCompany.branches[0];
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
          name: data.adminName,
          email: data.adminEmail,
          password: hashedPassword,
          role: 'USER',
          companyId: newCompany.id,
          branchId: mainBranch.id,
          customRoleId: adminRole.id,
        },
      });

      // Plan de cuentas + período contable inicial (Fase 14).
      // Sin esto, la primera operación contable (venta, compra, etc.) falla
      // porque createJournalEntry no encuentra las cuentas hoja.
      await seedChartOfAccounts(tx, newCompany.id);
      await ensureAccountingPeriod(tx, newCompany.id, new Date());

      // Fase 16: serie FACT default por sucursal recién creada.
      // Prefix 'A' es placeholder — el admin debe registrar la autorización
      // SAT real en Settings cuando la tenga.
      for (const br of newCompany.branches) {
        await tx.taxSeries.upsert({
          where: {
            companyId_branchId_documentType_prefix: {
              companyId: newCompany.id,
              branchId: br.id,
              documentType: 'FACT',
              prefix: 'A',
            },
          },
          create: {
            companyId: newCompany.id,
            branchId: br.id,
            documentType: 'FACT',
            prefix: 'A',
            nextNumber: 1,
            active: true,
          },
          update: {},
        });
      }

      return newCompany;
    });

    // Audit log — esperamos para garantizar persistencia antes de cerrar la lambda.
    await createAuditLog({
      companyId: company.id,
      userId: 'system',
      action: 'COMPANY_CREATED',
      entity: 'Company',
      entityId: company.id,
      details: { name: company.name, slug: company.slug, plan: 'trial' },
    });

    return NextResponse.json({
      message: 'Empresa registrada exitosamente',
      companyId: company.id,
      companyName: company.name,
      trialEndsAt: trialEnd.toISOString(),
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Onboarding error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Datos duplicados. Verifica el slug y email.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al registrar la empresa' }, { status: 500 });
  }
}
