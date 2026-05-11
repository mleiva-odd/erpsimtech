import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

// Guard Fase 13: el seed limpia toda la DB (`deleteMany` por entidad).
// Si se corre por accidente en producción, vuela los datos del cliente.
// Mantenemos dos defensas:
//   1. Bloqueo duro si NODE_ENV=production. Sin excepciones.
//   2. Para no-production destructivo, requerimos ALLOW_SEED_DESTRUCTIVE=true.
//      Esto evita que un dev local corra `pnpm seed` con DATABASE_URL apuntada
//      por accidente a la DB de stage/preview.
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'Seed cannot run in production. NODE_ENV=production detectado. Abortando.',
  );
}

if (process.env.ALLOW_SEED_DESTRUCTIVE !== 'true') {
  throw new Error(
    'Seed bloqueado: este script borra TODA la data antes de re-poblar. ' +
      'Setear ALLOW_SEED_DESTRUCTIVE=true para confirmar que la DB destino ' +
      'es local/CI y no contiene datos reales.',
  );
}

const prisma = new PrismaClient();

// Mantenemos bcrypt rounds alineado a `src/lib/hashing.ts`. No importamos
// directamente desde `@/lib/hashing` porque el seed corre fuera del bundling de Next.
const SEED_BCRYPT_ROUNDS = 12;

const ADMIN_PERMISSIONS = [
  'pos:access', 'pos:discount',
  'sales:view', 'sales:void',
  'inventory:view', 'inventory:adjust', 'inventory:transfer',
  'purchases:view', 'purchases:create',
  'treasury:view', 'treasury:manage',
  'reports:view', 'reports:export',
  'customers:view', 'customers:manage',
  'suppliers:view', 'suppliers:manage',
  'settings:manage', 'users:manage',
  'hr:manage', 'payroll:manage',
] as const;

const MANAGER_PERMISSIONS = [
  'pos:access',
  'sales:view',
  'inventory:view', 'inventory:transfer',
  'purchases:view',
  'reports:view',
  'customers:view',
  'suppliers:view',
] as const;

const CASHIER_PERMISSIONS = [
  'pos:access',
  'customers:view',
] as const;

function getSeedValue(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function getSeedPassword(name: string) {
  const existing = process.env[name]?.trim();
  if (existing) return existing;
  return randomBytes(9).toString('base64url');
}

async function main() {
  console.log('Iniciando Wipe & Re-Seed de la Base de Datos SIMTECH...');

  // 1. WIPE DATA (Respetar orden para evitar llaves foráneas)
  await prisma.saleItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.stockTransferItem.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.productStock.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.userBranchAccess.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.companySettings.deleteMany();
  await prisma.company.deleteMany();

  console.log('-> Base de datos limpia de registros previos.');

  const superAdminEmail = getSeedValue('SEED_SUPERADMIN_EMAIL', 'admin@simtechgt.com');
  const superAdminPassword = getSeedPassword('SEED_SUPERADMIN_PASSWORD');
  const companyAdminEmail = getSeedValue('SEED_COMPANY_ADMIN_EMAIL', 'simtech@simtechgt.com');
  const companyAdminPassword = getSeedPassword('SEED_COMPANY_ADMIN_PASSWORD');
  const managerPassword = getSeedPassword('SEED_MANAGER_PASSWORD');
  const cashierPassword = getSeedPassword('SEED_CASHIER_PASSWORD');

  const hashedSuperAdminPassword = await bcrypt.hash(superAdminPassword, SEED_BCRYPT_ROUNDS);
  const hashedCompanyAdminPassword = await bcrypt.hash(companyAdminPassword, SEED_BCRYPT_ROUNDS);
  const hashedManagerPassword = await bcrypt.hash(managerPassword, SEED_BCRYPT_ROUNDS);
  const hashedCashierPassword = await bcrypt.hash(cashierPassword, SEED_BCRYPT_ROUNDS);

  // 2. Plataforma Super Admin
  await prisma.user.create({
    data: {
      name: 'Super Admin SIMTECH',
      email: superAdminEmail,
      password: hashedSuperAdminPassword,
      role: 'SUPER_ADMIN',
    },
  });

  // 3. Negocio de Pruebas (Tenant)
  const company = await prisma.company.create({
    data: {
      name: 'Simtech Store',
      slug: 'simtech-store',
      email: companyAdminEmail,
      settings: {
        create: {
          storeName: 'Simtech Store',
          currency: 'GTQ',
          currencySymbol: 'Q'
        }
      }
    },
  });

  // 4. Sucursales
  const branchTecpan = await prisma.branch.create({
    data: { companyId: company.id, name: 'Tecpán', code: 'SUC-TECPAN', isMain: true }
  });
  const branchSanta = await prisma.branch.create({
    data: { companyId: company.id, name: 'Santa', code: 'SUC-SANTA', isMain: false }
  });

  const adminRole = await prisma.customRole.create({
    data: {
      companyId: company.id,
      name: 'Administrador',
      description: 'Administrador local con acceso integral al tenant demo',
      permissions: [...ADMIN_PERMISSIONS],
    },
  });

  const managerRole = await prisma.customRole.create({
    data: {
      companyId: company.id,
      name: 'Gerente',
      description: 'Supervisor operativo del tenant demo',
      permissions: [...MANAGER_PERMISSIONS],
    },
  });

  const cashierRole = await prisma.customRole.create({
    data: {
      companyId: company.id,
      name: 'Cajero',
      description: 'Operación básica de caja en tenant demo',
      permissions: [...CASHIER_PERMISSIONS],
    },
  });

  // 5. Personal Administrativo y Gerencial
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'Dueño Simtech',
      email: companyAdminEmail,
      password: hashedCompanyAdminPassword,
      role: 'USER',
      branchId: branchTecpan.id,
      customRoleId: adminRole.id,
    }
  });

  await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'Gerente General',
      email: 'gerentegeneral@simtechgt.com',
      password: hashedManagerPassword,
      role: 'USER',
      customRoleId: managerRole.id,
    }
  });

  // 6. Personal Sucursal Tecpán
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchTecpan.id,
      name: 'Gerente Tecpán',
      email: 'gerentetecpan@simtechgt.com',
      password: hashedManagerPassword,
      role: 'USER',
      customRoleId: managerRole.id,
    }
  });
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchTecpan.id,
      name: 'Cajero Tecpán',
      email: 'cajerotecpan@simtechgt.com',
      password: hashedCashierPassword,
      role: 'USER',
      customRoleId: cashierRole.id,
    }
  });

  // 7. Personal Sucursal Santa
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchSanta.id,
      name: 'Gerente Santa',
      email: 'gerentesanta@simtechgt.com',
      password: hashedManagerPassword,
      role: 'USER',
      customRoleId: managerRole.id,
    }
  });
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchSanta.id,
      name: 'Cajero Santa',
      email: 'cajerosanta@simtechgt.com',
      password: hashedCashierPassword,
      role: 'USER',
      customRoleId: cashierRole.id,
    }
  });

  // 8. Categorías
  const catPhones = await prisma.category.create({ data: { companyId: company.id, name: 'Smartphones' } });
  const catAcc = await prisma.category.create({ data: { companyId: company.id, name: 'Accesorios' } });

  // 9. Productos Tecnológicos con y sin variantes
  
  // Producto base (Sin variantes)
  await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: catAcc.id,
      name: 'AirPods Pro 2',
      sku: 'APP200',
      price: 1999.00,
      wholesalePrice: 1800.00,
      cost: 1500.00,
      stocks: {
        create: [
          { branchId: branchTecpan.id, quantity: 20, minStock: 5 },
          { branchId: branchSanta.id, quantity: 10, minStock: 5 }
        ]
      }
    }
  });

  // Producto base 2 (Sin variantes)
  await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: catPhones.id, // Reusando cat
      name: 'Macbook Pro M3',
      sku: 'MBP-M3',
      price: 16000.00,
      cost: 12000.00,
      stocks: {
        create: [
          { branchId: branchTecpan.id, quantity: 5, minStock: 2 },
        ]
      }
    }
  });

  // Producto con Múltiples Variantes (iPhone)
  const pIphone = await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: catPhones.id,
      name: 'iPhone 15 Pro',
      sku: 'IP15P-BASE',
      price: 0, cost: 0, // Se ignora por la variante
      hasVariants: true
    }
  });

  // Variante 1: Titanio 128GB
  await prisma.productVariant.create({
    data: {
      productId: pIphone.id,
      name: 'Titanio 128GB',
      sku: 'IP15P-TIT-128',
      price: 9500.00,
      cost: 8000.00,
      stocks: {
        create: [
          { productId: pIphone.id, branchId: branchTecpan.id, quantity: 5, minStock: 2 },
          { productId: pIphone.id, branchId: branchSanta.id, quantity: 2, minStock: 2 }
        ]
      }
    }
  });

  // Variante 2: Titanio 256GB
  await prisma.productVariant.create({
    data: {
      productId: pIphone.id,
      name: 'Titanio 256GB',
      sku: 'IP15P-TIT-256',
      price: 10500.00,
      cost: 8800.00,
      stocks: {
        create: [
          { productId: pIphone.id, branchId: branchTecpan.id, quantity: 3, minStock: 2 },
          { productId: pIphone.id, branchId: branchSanta.id, quantity: 1, minStock: 2 }
        ]
      }
    }
  });

  console.log('-> Inventario de Prueba Tecnológico distribuido en ambas sucursales.');
  console.log('\nCredenciales generadas para desarrollo local:');
  console.table([
    { account: 'Super Admin', email: superAdminEmail, password: superAdminPassword },
    { account: 'Admin Empresa', email: companyAdminEmail, password: companyAdminPassword },
    { account: 'Gerentes Demo', email: 'gerentegeneral@simtechgt.com / gerentetecpan@simtechgt.com / gerentesanta@simtechgt.com', password: managerPassword },
    { account: 'Cajeros Demo', email: 'cajerotecpan@simtechgt.com / cajerosanta@simtechgt.com', password: cashierPassword },
  ]);
  console.log('Puedes fijar credenciales estables exportando SEED_* antes de correr el seed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\n✅ Base de datos reconstruida de 0 a 100 con perfiles para todo el personal.');
  });
