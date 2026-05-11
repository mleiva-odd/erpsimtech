import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function main() {
  console.log('=== USUARIOS EN LA BASE DE DATOS ===\n');

  const users = await prisma.user.findMany({
    include: {
      company: { select: { name: true } },
      branch: { select: { name: true } },
      customRole: { select: { name: true, permissions: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('❌ No hay usuarios en la base de datos.');
    console.log('\nPuedes crear uno con el script: npx tsx scripts/seed-users.ts');
    return;
  }

  for (const u of users) {
    console.log(`📧 ${u.email}`);
    console.log(`   Nombre:    ${u.name}`);
    console.log(`   Rol:       ${u.role}`);
    console.log(`   Activo:    ${u.active}`);
    console.log(`   Empresa:   ${u.company?.name || '(sin empresa)'}`);
    console.log(`   Sucursal:  ${u.branch?.name || '(sin sucursal)'}`);
    console.log(`   CustomRole: ${u.customRole?.name || '(ninguno)'}`);
    console.log(`   Permisos:  ${u.customRole?.permissions?.join(', ') || '(ninguno)'}`);
    console.log('');
  }

  console.log(`Total: ${users.length} usuarios`);

  // Check CustomRoles
  const roles = await prisma.customRole.findMany({
    include: { company: { select: { name: true } } },
  });
  
  if (roles.length > 0) {
    console.log('\n=== ROLES PERSONALIZADOS ===\n');
    for (const r of roles) {
      console.log(`🔑 ${r.name} (${r.company.name})`);
      console.log(`   Permisos: ${r.permissions.join(', ')}`);
      console.log('');
    }
  } else {
    console.log('\n⚠️  No hay roles personalizados (CustomRole) creados.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
