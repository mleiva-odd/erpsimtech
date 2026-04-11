import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'simtech@simtechgt.com';
  const pass = 'admin123';
  
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log('User not found:', email);
    return;
  }
  
  const match = await bcrypt.compare(pass, user.password);
  console.log('Password match for', email, ':', match);
}

main().catch(console.error).finally(() => prisma.$disconnect());
