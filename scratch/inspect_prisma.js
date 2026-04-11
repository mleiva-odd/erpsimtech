
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log('Available Prisma models:');
console.log(Object.keys(prisma).filter(k => typeof prisma[k] === 'object' && prisma[k] !== null && !k.startsWith('_') && !k.startsWith('$')));

prisma.$disconnect();
