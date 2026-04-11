import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { email: true, role: true } });
  const branches = await prisma.branch.findMany({ select: { name: true, code: true } });
  const companies = await prisma.company.findMany({ select: { name: true, slug: true } });
  const products = await prisma.product.count();

  console.log('USERS IN DB:', users);
  console.log('BRANCHES IN DB:', branches);
  console.log('COMPANIES IN DB:', companies);
  console.log('TOTAL PRODUCTS:', products);
}

main().catch(console.error).finally(() => prisma.$disconnect());
