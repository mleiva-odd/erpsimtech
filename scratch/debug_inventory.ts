import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stocks = await prisma.productStock.findMany({
    include: {
      product: { select: { name: true } },
      branch: { select: { name: true } }
    }
  });
  console.log('STOCKS IN DB:', JSON.stringify(stocks, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
