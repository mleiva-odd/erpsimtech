import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Conectar usando la MISMA URL que usa la app en runtime
const prisma = new PrismaClient();

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
  console.log('DIRECT_URL:', process.env.DIRECT_URL?.replace(/:[^:@]+@/, ':***@'));
  
  // Verificar qué columnas tiene la tabla User
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
    ORDER BY ordinal_position;
  `;

  console.log('\n=== Columnas de la tabla User ===');
  columns.forEach((c) => console.log(`  - ${c.column_name}`));

  const hasCustomRoleId = columns.some((c) => c.column_name === 'customRoleId');
  console.log(`\ncustomRoleId existe: ${hasCustomRoleId ? '✅ SÍ' : '❌ NO'}`);

  // Verificar si la tabla CustomRole existe
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CustomRole';
  `;
  console.log(`Tabla CustomRole existe: ${tables.length > 0 ? '✅ SÍ' : '❌ NO'}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
