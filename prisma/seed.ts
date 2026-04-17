import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  const hashedPassword = await bcrypt.hash('admin123', 10);
  const gerentePassword = await bcrypt.hash('gerente123', 10);
  const cajeroPassword = await bcrypt.hash('cajero123', 10);

  // 2. Plataforma Super Admin
  await prisma.user.create({
    data: {
      name: 'Super Admin SIMTECH',
      email: 'admin@simtechgt.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });

  // 3. Negocio de Pruebas (Tenant)
  const company = await prisma.company.create({
    data: {
      name: 'Simtech Store',
      slug: 'simtech-store',
      email: 'simtech@simtechgt.com',
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

  // 5. Personal Administrativo y Gerencial
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'Dueño Simtech',
      email: 'simtech@simtechgt.com',
      password: hashedPassword,
      role: 'ADMIN',
    }
  });

  await prisma.user.create({
    data: {
      companyId: company.id,
      name: 'Gerente General',
      email: 'gerentegeneral@simtechgt.com',
      password: gerentePassword,
      role: 'ADMIN', // Rol ADMIN para que pueda ver ambas sucursales con el selector
    }
  });

  // 6. Personal Sucursal Tecpán
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchTecpan.id,
      name: 'Gerente Tecpán',
      email: 'gerentetecpan@simtechgt.com',
      password: gerentePassword,
      role: 'SUPERVISOR',
    }
  });
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchTecpan.id,
      name: 'Cajero Tecpán',
      email: 'cajerotecpan@simtechgt.com',
      password: cajeroPassword,
      role: 'CASHIER',
    }
  });

  // 7. Personal Sucursal Santa
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchSanta.id,
      name: 'Gerente Santa',
      email: 'gerentesanta@simtechgt.com',
      password: gerentePassword,
      role: 'SUPERVISOR',
    }
  });
  await prisma.user.create({
    data: {
      companyId: company.id,
      branchId: branchSanta.id,
      name: 'Cajero Santa',
      email: 'cajerosanta@simtechgt.com',
      password: cajeroPassword,
      role: 'CASHIER',
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
