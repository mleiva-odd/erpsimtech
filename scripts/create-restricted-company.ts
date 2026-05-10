import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function getValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function getPassword(name: string) {
  const existing = process.env[name]?.trim();
  if (existing) return existing;
  return randomBytes(9).toString('base64url');
}

async function main() {
  const adminEmail = getValue('RESTRICTED_COMPANY_ADMIN_EMAIL', 'testadmin@restricted.com');
  const adminPassword = getPassword('RESTRICTED_COMPANY_ADMIN_PASSWORD');
  // bcrypt rounds alineados a `src/lib/hashing.ts`.
  const password = await bcrypt.hash(adminPassword, 12);

  // Clean up existing test data
  await prisma.user.deleteMany({ where: { email: adminEmail } });
  
  const company = await prisma.company.upsert({
    where: { slug: 'restricted-test' },
    update: { active: true },
    create: {
      name: 'Restricted Company Test',
      nit: '9999999-9',
      phone: '12345678',
      email: 'test@restricted.com',
      slug: 'restricted-test',
      active: true,
      branches: {
        create: {
          name: 'Sucursal Restringida',
          code: 'STR001',
          isMain: true,
          address: 'Test Address',
          phone: '12345678',
        },
      },
      subscription: {
        create: {
          plan: 'TRIAL',
          status: 'ACTIVE',
          maxBranches: 1,
          maxUsersPerBranch: 2,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        },
      },
    },
    include: { branches: true },
  });

  const branchId = company.branches[0].id;

  // Create the restricted role
  const restrictedRole = await prisma.customRole.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: 'Administrador Restringido',
      },
    },
    update: {
      description: 'Solo POS y Clientes',
      permissions: ['pos:access', 'customers:view', 'customers:manage'],
    },
    create: {
      companyId: company.id,
      name: 'Administrador Restringido',
      description: 'Solo POS y Clientes',
      permissions: ['pos:access', 'customers:view', 'customers:manage'],
    },
  });

  // Create the user. No usamos el resultado, pero la creación tiene
  // efecto en la DB; el _ prefix indica al linter que es intencional.
  const _user = await prisma.user.create({
    data: {
      name: 'Admin Restringido',
      email: adminEmail,
      password: password,
      role: 'USER',
      companyId: company.id,
      branchId: branchId,
      customRoleId: restrictedRole.id,
    },
  });
  void _user;

  console.log('✅ Empresa y Usuario Restringido creados');
  console.log('📧 Email:', adminEmail);
  console.log('🔑 Password:', adminPassword);
  console.log('🎭 Rol:', restrictedRole.name);
  console.log('🛡️ Permisos:', restrictedRole.permissions);
  console.log('ℹ️ Usa RESTRICTED_COMPANY_ADMIN_EMAIL y RESTRICTED_COMPANY_ADMIN_PASSWORD para fijar credenciales.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
