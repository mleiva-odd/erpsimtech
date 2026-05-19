import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { requirePermission } from '@/lib/tenant';
import { z } from 'zod';
import { hashPassword, PASSWORD_MIN_LENGTH } from '@/lib/hashing';
import {
  seedChartOfAccounts,
  ensureAccountingPeriod,
  seedTemplateAccounts,
  type BusinessType,
} from '@/lib/accounting';

// ───────────────────────────────────────────────────────────────────────────
// Fase 27 · Onboarding wizard production-ready.
//
// El endpoint mantiene backward-compat con el flujo 3-steps original
// (company / admin / branch). Todos los campos nuevos son opcionales:
//   - businessType: selecciona plantilla contable extra. Default 'COMMERCE'.
//   - felConfig: setea CompanySettings.felProvider y credenciales si viene.
//   - logoUrl: URL del logo (ya subido vía /api/upload).
//   - extraBranches: hasta totalizar maxBranches del trial (2).
//   - extraUsers: vendedores/cajeros/contadores/gerentes adicionales,
//     respetando el límite maxUsersPerBranch del trial (3).
//
// Toda la creación va en UNA transacción para mantener atomicidad. Si algo
// falla a mitad (e.g. email duplicado en extraUsers), nada se persiste.
// ───────────────────────────────────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un dígito')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un símbolo');

const branchSchema = z.object({
  name: z.string().trim().min(2, 'Nombre de sucursal requerido'),
  code: z.string().trim().min(2, 'Código de sucursal requerido'),
  address: z.string().optional().or(z.literal('')),
});

const extraUserRoleSchema = z.enum(['Vendedor', 'Cajero', 'Contador', 'Gerente']);
type ExtraUserRole = z.infer<typeof extraUserRoleSchema>;

const extraUserSchema = z.object({
  name: z.string().trim().min(2, 'Nombre requerido'),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: passwordSchema,
  // Branch code (no UUID, porque las branches recién creadas aún no tienen
  // ID estable a nivel UI). Si no se pasa, se asigna a la principal.
  branchCode: z.string().trim().optional(),
  role: extraUserRoleSchema,
});

const felConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['MOCK', 'INFILE', 'DIGIFACT']).optional(),
  apiUser: z.string().optional(),
  apiKey: z.string().optional(),
  certificateUrl: z.string().url('URL de certificado inválida').optional(),
});

const OnboardingSchema = z.object({
  // ── Company ──
  companyName: z.string().trim().min(2, 'Nombre de empresa requerido'),
  companySlug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  companyEmail: z.string().trim().toLowerCase().email('Email inválido'),
  companyPhone: z.string().optional().or(z.literal('')),
  companyNit: z.string().optional().or(z.literal('')),
  taxRegime: z.enum(['GENERAL', 'PEQUENO_CONTRIBUYENTE']).optional().nullable(),

  // ── Fase 27: tipo de negocio para plantilla contable ──
  businessType: z
    .enum(['COMMERCE', 'SERVICES', 'RESTAURANT', 'INDUSTRY'])
    .optional()
    .default('COMMERCE'),

  // ── Admin user ──
  adminName: z.string().trim().min(2, 'Nombre del administrador requerido'),
  adminEmail: z.string().trim().toLowerCase().email('Email del admin inválido'),
  adminPassword: passwordSchema,

  // ── First branch ──
  branchName: z.string().trim().min(2, 'Nombre de sucursal requerido').default('Sucursal Central'),
  branchCode: z.string().trim().min(2).default('SUC-01'),
  branchAddress: z.string().optional().or(z.literal('')),

  // ── Fase 27: FEL config opcional ──
  felConfig: felConfigSchema.optional(),

  // ── Fase 27: logo ya subido a Storage ──
  logoUrl: z.string().url('URL de logo inválida').optional(),

  // ── Fase 27: sucursales adicionales ──
  extraBranches: z.array(branchSchema).optional().default([]),

  // ── Fase 27: usuarios adicionales ──
  extraUsers: z.array(extraUserSchema).optional().default([]),
});

// Permisos preasignados por rol nominal. Cualquier cambio debe estar en
// `permission-catalog` (VALID_PERMISSIONS).
const ROLE_PERMISSIONS: Record<ExtraUserRole, string[]> = {
  Vendedor: ['pos:access', 'sales:view', 'customers:view', 'customers:manage'],
  Cajero: ['pos:access', 'sales:view', 'customers:view'],
  Contador: [
    'sales:view',
    'purchases:view',
    'treasury:view',
    'reports:view',
    'reports:export',
    'customers:view',
    'suppliers:view',
  ],
  Gerente: [
    'pos:access',
    'pos:discount',
    'sales:view',
    'sales:void',
    'inventory:view',
    'inventory:adjust',
    'inventory:transfer',
    'purchases:view',
    'purchases:create',
    'treasury:view',
    'treasury:manage',
    'reports:view',
    'reports:export',
    'customers:view',
    'customers:manage',
    'suppliers:view',
    'suppliers:manage',
  ],
};

// Límites del plan trial (alineados con Subscription.maxBranches /
// maxUsersPerBranch en lib/plans.ts).
const TRIAL_MAX_BRANCHES = 2;
const TRIAL_MAX_USERS_PER_BRANCH = 3;

export async function POST(req: NextRequest) {
  const result = await requirePermission('admin:all');
  if ('error' in result) return result.error;

  try {
    const body = await req.json();
    const parsed = OnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // ── Validaciones cross-field previas a la transacción ──

    // 1. Slug único
    const existingCompany = await prisma.company.findFirst({
      where: { slug: data.companySlug },
    });
    if (existingCompany) {
      return NextResponse.json(
        { error: 'Ya existe una empresa con ese identificador (slug)' },
        { status: 409 },
      );
    }

    // 2. Emails únicos (admin + extras). Chequeamos en bulk para evitar
    //    N round-trips.
    const allEmails = [data.adminEmail, ...data.extraUsers.map((u) => u.email)];
    const uniqueEmailSet = new Set(allEmails);
    if (uniqueEmailSet.size !== allEmails.length) {
      return NextResponse.json(
        { error: 'Hay correos repetidos entre el administrador y los usuarios adicionales' },
        { status: 400 },
      );
    }
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: allEmails } },
      select: { email: true },
    });
    if (existingUsers.length > 0) {
      const taken = existingUsers.map((u) => u.email).join(', ');
      return NextResponse.json(
        { error: `Ya existen usuarios con estos correos: ${taken}` },
        { status: 409 },
      );
    }

    // 3. Branch codes únicos entre principal y extras.
    const allBranchCodes = [data.branchCode, ...data.extraBranches.map((b) => b.code)];
    const uniqueBranchSet = new Set(allBranchCodes.map((c) => c.toLowerCase()));
    if (uniqueBranchSet.size !== allBranchCodes.length) {
      return NextResponse.json(
        { error: 'Hay códigos de sucursal duplicados' },
        { status: 400 },
      );
    }

    // 4. Límite plan trial: sucursales totales ≤ TRIAL_MAX_BRANCHES.
    const totalBranches = 1 + data.extraBranches.length;
    if (totalBranches > TRIAL_MAX_BRANCHES) {
      return NextResponse.json(
        {
          error: `El plan trial permite hasta ${TRIAL_MAX_BRANCHES} sucursales. Recibí ${totalBranches}.`,
        },
        { status: 400 },
      );
    }

    // 5. Límite usuarios por sucursal. Contamos admin como 1 en la principal.
    const usersPerBranch = new Map<string, number>();
    usersPerBranch.set(data.branchCode, 1); // admin
    for (const u of data.extraUsers) {
      const target = u.branchCode && u.branchCode.trim() ? u.branchCode : data.branchCode;
      usersPerBranch.set(target, (usersPerBranch.get(target) ?? 0) + 1);
    }
    for (const [code, count] of usersPerBranch.entries()) {
      if (count > TRIAL_MAX_USERS_PER_BRANCH) {
        return NextResponse.json(
          {
            error: `El plan trial permite hasta ${TRIAL_MAX_USERS_PER_BRANCH} usuarios por sucursal. La sucursal "${code}" recibió ${count}.`,
          },
          { status: 400 },
        );
      }
    }

    // 6. Validar branchCode de cada extraUser apunta a una sucursal real
    //    (principal o extra). Empty string → default a principal en runtime.
    const validBranchCodes = new Set(allBranchCodes);
    for (const u of data.extraUsers) {
      if (u.branchCode && u.branchCode.trim() && !validBranchCodes.has(u.branchCode)) {
        return NextResponse.json(
          {
            error: `El usuario "${u.email}" referencia una sucursal inexistente: "${u.branchCode}".`,
          },
          { status: 400 },
        );
      }
    }

    // 7. Si felConfig.enabled=true, deben venir credenciales mínimas (no MOCK).
    //    MOCK puede ir sin credenciales (sandbox/demo).
    if (data.felConfig?.enabled) {
      const provider = data.felConfig.provider ?? 'MOCK';
      if (provider !== 'MOCK') {
        if (!data.felConfig.apiUser?.trim() || !data.felConfig.apiKey?.trim()) {
          return NextResponse.json(
            { error: 'FEL habilitado requiere apiUser y apiKey para INFILE/DIGIFACT' },
            { status: 400 },
          );
        }
      }
    }

    // ── Hashear passwords ──
    const adminHashed = await hashPassword(data.adminPassword);
    const extraUsersHashed = await Promise.all(
      data.extraUsers.map(async (u) => ({
        ...u,
        passwordHash: await hashPassword(u.password),
      })),
    );

    // ── Trial: 30 días ──
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // ── Construir lista de sucursales a crear (principal primero) ──
    const branchInputs: Array<{
      name: string;
      code: string;
      address: string | null;
      isMain: boolean;
    }> = [
      {
        name: data.branchName,
        code: data.branchCode,
        address: data.branchAddress || null,
        isMain: true,
      },
      ...data.extraBranches.map((b) => ({
        name: b.name,
        code: b.code,
        address: b.address || null,
        isMain: false,
      })),
    ];

    // ── Transacción atómica ──
    const txResult = await prisma.$transaction(async (tx) => {
      // 1. Crear Company + Branches + Settings + Subscription en un solo
      //    create anidado. felProvider/felEnabled se aplican acá si el
      //    cliente los pasó al onboarding.
      // Tasa default según régimen tributario:
      // - GENERAL: 12% IVA
      // - PEQUENO_CONTRIBUYENTE: 5% sobre ventas (no es IVA propiamente
      //   dicho — es ISR simplificado — pero usamos el mismo campo).
      // Si no hay régimen, dejamos el default del schema (0.12).
      const taxRateDefault =
        data.taxRegime === 'PEQUENO_CONTRIBUYENTE' ? 0.05 : undefined;

      const settingsBase: {
        storeName: string;
        nit: string | null;
        phone: string | null;
        address: string | null;
        receiptMsg: string;
        taxRate?: number;
        felEnabled?: boolean;
        felProvider?: 'NONE' | 'MOCK' | 'INFILE' | 'DIGIFACT';
        felNitEmisor?: string | null;
        felApiUser?: string | null;
        felApiKey?: string | null;
        felCertificateUrl?: string | null;
      } = {
        storeName: data.companyName,
        nit: data.companyNit || null,
        phone: data.companyPhone || null,
        address: data.branchAddress || null,
        receiptMsg: '¡Gracias por su compra!',
      };
      if (taxRateDefault !== undefined) {
        settingsBase.taxRate = taxRateDefault;
      }

      if (data.felConfig?.enabled) {
        const provider = data.felConfig.provider ?? 'MOCK';
        settingsBase.felEnabled = true;
        settingsBase.felProvider = provider;
        settingsBase.felNitEmisor = data.companyNit || null;
        settingsBase.felApiUser = data.felConfig.apiUser?.trim() || null;
        settingsBase.felApiKey = data.felConfig.apiKey?.trim() || null;
        settingsBase.felCertificateUrl = data.felConfig.certificateUrl ?? null;
      }

      // Cast: el cliente Prisma generado en sandbox no tiene `taxRegime`
      // en CompanyCreateInput todavía.
      const newCompany = (await tx.company.create({
        data: ({
          name: data.companyName,
          slug: data.companySlug,
          email: data.companyEmail,
          phone: data.companyPhone || null,
          nit: data.companyNit || null,
          logoUrl: data.logoUrl ?? null,
          taxRegime: data.taxRegime ?? null,
          branches: {
            create: branchInputs,
          },
          settings: {
            create: settingsBase,
          },
          subscription: {
            create: {
              plan: 'trial',
              status: 'TRIAL',
              maxBranches: TRIAL_MAX_BRANCHES,
              maxUsersPerBranch: TRIAL_MAX_USERS_PER_BRANCH,
              price: 0,
              currentPeriodStart: new Date(),
              currentPeriodEnd: trialEnd,
              trialEndsAt: trialEnd,
            },
          },
        } as unknown) as Parameters<typeof tx.company.create>[0]['data'],
        include: { branches: true },
      })) as { id: string; name: string; slug: string; branches: Array<{ id: string; code: string; isMain: boolean }> };

      // 2. Plan de cuentas estándar + plantilla extra por tipo de negocio.
      //    `data.businessType` viene del enum zod con literales que
      //    coinciden 1:1 con BusinessType, así que el cast es de
      //    estructura idéntica (no `unknown`).
      await seedChartOfAccounts(tx, newCompany.id);
      await seedTemplateAccounts(tx, newCompany.id, data.businessType as BusinessType);

      // 3. Período contable inicial.
      await ensureAccountingPeriod(tx, newCompany.id, new Date());

      // 4. CustomRole Administrador con todos los permisos.
      const mainBranch = newCompany.branches.find((b) => b.isMain) ?? newCompany.branches[0];
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

      // 5. Crear usuario admin.
      await tx.user.create({
        data: {
          name: data.adminName,
          email: data.adminEmail,
          password: adminHashed,
          role: 'USER',
          companyId: newCompany.id,
          branchId: mainBranch.id,
          customRoleId: adminRole.id,
        },
      });

      // 6. Crear CustomRoles para los presets que se usan en extraUsers
      //    (solo los que efectivamente aparecen — evitar roles huérfanos).
      const rolesNeeded = new Set<ExtraUserRole>(
        data.extraUsers.map((u) => u.role),
      );
      const roleIdByName = new Map<ExtraUserRole, string>();
      for (const roleName of rolesNeeded) {
        const created = await tx.customRole.create({
          data: {
            companyId: newCompany.id,
            name: roleName,
            description: `Rol predefinido: ${roleName}`,
            permissions: ROLE_PERMISSIONS[roleName],
          },
        });
        roleIdByName.set(roleName, created.id);
      }

      // 7. Crear usuarios adicionales.
      const branchIdByCode = new Map<string, string>(
        newCompany.branches.map((b) => [b.code, b.id]),
      );
      for (const u of extraUsersHashed) {
        const branchId =
          u.branchCode && u.branchCode.trim()
            ? branchIdByCode.get(u.branchCode) ?? mainBranch.id
            : mainBranch.id;
        const roleId = roleIdByName.get(u.role);
        if (!roleId) {
          // No debería pasar — ya creamos roles para los que aparecen.
          throw new Error(`Rol no preparado: ${u.role}`);
        }
        await tx.user.create({
          data: {
            name: u.name,
            email: u.email,
            password: u.passwordHash,
            role: 'USER',
            companyId: newCompany.id,
            branchId,
            customRoleId: roleId,
          },
        });
      }

      // 8. Serie FACT default por cada sucursal. Prefix 'A' placeholder
      //    — el admin debe registrar la autorización SAT real en Settings.
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

      return {
        company: newCompany,
        extraBranchesCount: data.extraBranches.length,
        extraUsersCount: data.extraUsers.length,
      };
    });

    const { company } = txResult;

    // ── Audit log (fuera de la transacción para que esté commited primero) ──
    await createAuditLog({
      companyId: company.id,
      userId: 'system',
      action: 'COMPANY_CREATED',
      entity: 'Company',
      entityId: company.id,
      details: {
        name: company.name,
        slug: company.slug,
        plan: 'trial',
        businessType: data.businessType,
        branches: company.branches.length,
        extraUsers: txResult.extraUsersCount,
        felConfigured: Boolean(data.felConfig?.enabled),
        logoUploaded: Boolean(data.logoUrl),
      },
    });

    return NextResponse.json(
      {
        message: 'Empresa registrada exitosamente',
        companyId: company.id,
        companyName: company.name,
        trialEndsAt: trialEnd.toISOString(),
        branches: company.branches.length,
        extraUsers: txResult.extraUsersCount,
        felConfigured: Boolean(data.felConfig?.enabled),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error('Onboarding error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Datos duplicados. Verificá slug, email y códigos de sucursal.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Error al registrar la empresa' }, { status: 500 });
  }
}
