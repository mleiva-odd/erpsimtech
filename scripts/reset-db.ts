import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

function getEnvValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function getPassword(name: string) {
  const existing = process.env[name]?.trim();
  if (existing) return existing;
  return randomBytes(9).toString('base64url');
}

async function main() {
  console.log('🗑️  Limpiando toda la base de datos...\n');

  // Borrar en orden para respetar foreign keys
  await prisma.accountPayment.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.supplierPayment.deleteMany();
  await prisma.supplierPayable.deleteMany();
  await prisma.accountingEntry.deleteMany();
  await prisma.accountingCategory.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.cashRegisterTransaction.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.productStock.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.userBranchAccess.deleteMany();
  await prisma.user.deleteMany();
  await prisma.customRole.deleteMany();
  await prisma.companySettings.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.company.deleteMany();

  console.log('✅ Base de datos limpia.\n');

  // Crear Super Admin
  const superAdminEmail = getEnvValue('RESET_DB_SUPERADMIN_EMAIL', 'admin@simtechgt.com');
  const superAdminPassword = getPassword('RESET_DB_SUPERADMIN_PASSWORD');
  const hashedPassword = await bcrypt.hash(superAdminPassword, 12);

  const superAdmin = await prisma.user.create({
    data: {
      name: 'Super Admin SIMTECH',
      email: superAdminEmail,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      active: true,
    },
  });

  console.log('🔑 Super Admin creado:');
  console.log(`   Email:    ${superAdminEmail}`);
  console.log(`   Password: ${superAdminPassword}`);
  console.log(`   Rol:      SUPER_ADMIN`);
  console.log(`   ID:       ${superAdmin.id}`);
  console.log('\nNota: puedes fijar estas credenciales con RESET_DB_SUPERADMIN_EMAIL y RESET_DB_SUPERADMIN_PASSWORD.');
  console.log('🚀 Base de datos lista para uso local.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
