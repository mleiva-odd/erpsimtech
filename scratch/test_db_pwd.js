
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:admin123@127.0.0.1:65432/simtechdb'
    }
  }
});

async function test() {
  try {
    const users = await prisma.user.findMany({ take: 1 });
    console.log('SUCCESS with admin123');
    process.exit(0);
  } catch (e) {
    console.log('FAILED with admin123:', e.message);
    process.exit(1);
  }
}
test();
