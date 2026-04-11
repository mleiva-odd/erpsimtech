import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding minimal data...');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  // Try to find if user exists first
  const existingUser = await prisma.user.findUnique({ where: { email: 'admin@simtechgt.com' } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        name: 'Super Admin SIMTECH',
        email: 'admin@simtechgt.com',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
      },
    });
  }

  const company = await prisma.company.create({
    data: {
      name: 'Simtech Store',
      slug: 'simtech-store-' + Date.now(),
      email: 'simtech@simtechgt.com',
    },
  });

  const branch = await prisma.branch.create({
    data: { companyId: company.id, name: 'Tecpán', code: 'SUC-T-' + Date.now(), isMain: true }
  });

  const cat = await prisma.category.create({ data: { companyId: company.id, name: 'Smartphones' } });

  await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: cat.id,
      name: 'iPhone 15 Pro (Restored)',
      sku: 'IP15P-' + Date.now(),
      price: 9500.00,
      cost: 8000.00,
      stocks: {
        create: [
          { branchId: branch.id, quantity: 50, minStock: 5 },
        ]
      }
    }
  });

  console.log('Minimal data added!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
