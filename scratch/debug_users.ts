import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ 
    select: { 
      email: true, 
      role: true, 
      companyId: true, 
      branchId: true,
      active: true,
      company: { select: { active: true } }
    } 
  });
  console.log('DETAILED USERS:', JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
