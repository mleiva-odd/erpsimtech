
const { prisma } = require('./src/lib/prisma');
async function test() {
  try {
    const branches = await prisma.branch.findMany({ take: 1 });
    console.log('SUCCESS: Connection working through lib/prisma');
    console.log('Branch found:', branches[0]?.name);
    process.exit(0);
  } catch (e) {
    console.error('FAILED through lib/prisma:', e.message);
    process.exit(1);
  }
}
test();
