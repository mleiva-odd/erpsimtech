const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando base de datos...');
  
  // En Prisma, eliminar una Compañía elimina todo lo relacionado por "onDelete: Cascade"
  await prisma.company.deleteMany({});
  await prisma.user.deleteMany({}); // Eliminar usuarios huérfanos (Super Admins)
  
  console.log('✅ Base de datos limpia.');

  // ========================================
  // CREAR ÚNICO SUPER ADMIN
  // ========================================
  console.log('👤 Creando Super Admin maestro...');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.create({
    data: {
      name: 'Super Admin SIMTECH',
      email: 'admin@simtechgt.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      companyId: null, // Los Super Admins globales no pertenecen a una empresa específica
    },
  });

  console.log('✅ Super Admin creado con éxito.');
  console.log('\n----------------------------------------');
  console.log('🚀 LISTO PARA EMPEZAR DE CERO');
  console.log('Usuario: admin@simtechgt.com');
  console.log('Password: admin123');
  console.log('----------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el reinicio:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
