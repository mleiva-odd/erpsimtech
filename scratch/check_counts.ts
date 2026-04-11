import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pCount = await prisma.product.count();
  const sCount = await prisma.productStock.count();
  const totalStock = await prisma.productStock.aggregate({
    _sum: { quantity: true }
  });
  console.log(`Products: ${pCount}, Stocks: ${sCount}, Total Quantity: ${totalStock._sum.quantity || 0}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
