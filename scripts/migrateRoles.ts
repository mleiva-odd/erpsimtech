import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ROLES = {
  ADMIN: {
    name: 'Administrador',
    description: 'Acceso total al sistema',
    permissions: [
      'pos:access', 'sales:view', 'sales:void', 'sales:discount',
      'inventory:view', 'inventory:adjust', 'inventory:transfer',
      'purchases:view', 'purchases:create',
      'treasury:view', 'treasury:manage',
      'reports:view', 'reports:export',
      'customers:view', 'customers:manage',
      'suppliers:view', 'suppliers:manage',
      'settings:manage', 'users:manage'
    ]
  },
  SUPERVISOR: {
    name: 'Supervisor',
    description: 'Acceso operativo y reportes',
    permissions: [
      'pos:access', 'sales:view',
      'inventory:view', 'inventory:adjust', 'inventory:transfer',
      'purchases:view', 'purchases:create',
      'reports:view',
      'customers:view', 'customers:manage',
      'suppliers:view'
    ]
  },
  CASHIER: {
    name: 'Cajero',
    description: 'Acceso a caja y ventas',
    permissions: [
      'pos:access', 'sales:view',
      'customers:view', 'customers:manage'
    ]
  }
};

async function main() {
  console.log('Iniciando migración de Roles a RBAC...');

  // 1. Obtener todas las empresas
  const companies = await prisma.company.findMany();
  console.log(`Encontradas ${companies.length} empresas.`);

  for (const company of companies) {
    console.log(`\nProcesando empresa: ${company.name} (${company.id})`);

    // 2. Crear los CustomRoles base para la empresa
    const roleMap: Record<string, string> = {}; // { 'ADMIN': 'custom-role-id' }

    for (const [key, template] of Object.entries(DEFAULT_ROLES)) {
      // Upsert para no duplicar si se corre el script varias veces
      const customRole = await prisma.customRole.upsert({
        where: {
          companyId_name: {
            companyId: company.id,
            name: template.name,
          }
        },
        update: {
          permissions: template.permissions,
        },
        create: {
          companyId: company.id,
          name: template.name,
          description: template.description,
          permissions: template.permissions,
        }
      });
      roleMap[key] = customRole.id;
      console.log(`- Rol '${template.name}' asegurado.`);
    }

    // 3. Migrar los usuarios de esta empresa
    const users = await prisma.user.findMany({
      where: { companyId: company.id }
    });
    console.log(`  Encontrados ${users.length} usuarios.`);

    let updatedCount = 0;
    for (const user of users) {
      if (user.role === 'SUPER_ADMIN') continue; // SUPER_ADMIN es global, no toca CustomRole

      const customRoleId = roleMap[user.role];
      if (customRoleId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            customRoleId: customRoleId,
            role: 'USER' // Transición hacia el enum limpio
          }
        });
        updatedCount++;
      }
    }
    console.log(`  Se actualizaron ${updatedCount} usuarios.`);
  }

  console.log('\n✅ Migración RBAC completada.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
