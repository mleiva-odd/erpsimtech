const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding multi-tenant database...\n');

  // ========================================
  // 1. SUPER ADMIN (Platform owner - SIMTECH)
  // ========================================
  const superAdminPassword = await bcrypt.hash('superadmin123', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@simtechpos.com' },
    update: { password: superAdminPassword, role: 'SUPER_ADMIN' },
    create: {
      name: 'SIMTECH Admin',
      email: 'admin@simtechpos.com',
      password: superAdminPassword,
      role: 'SUPER_ADMIN',
      // No companyId - platform level user
    },
  });
  console.log('✅ Super Admin: admin@simtechpos.com / superadmin123');

  // ========================================
  // 2. DEMO COMPANY
  // ========================================
  const company = await prisma.company.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      name: 'Tienda Demo S.A.',
      slug: 'demo-store',
      nit: '12345678-9',
      email: 'info@tiendademo.com',
      phone: '5555-1234',
    },
  });
  console.log('✅ Company: Tienda Demo S.A.');

  // ========================================
  // 3. BRANCHES (Sucursales)
  // ========================================
  const mainBranch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'SUC-CENTRAL' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Sucursal Central',
      code: 'SUC-CENTRAL',
      address: 'Zona 1, Ciudad de Guatemala',
      phone: '5555-1234',
      isMain: true,
    },
  });

  const secondBranch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'SUC-Z10' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Sucursal Zona 10',
      code: 'SUC-Z10',
      address: 'Zona 10, Ciudad de Guatemala',
      phone: '5555-5678',
      isMain: false,
    },
  });
  console.log('✅ Branches: Central + Zona 10');

  // ========================================
  // 4. COMPANY SETTINGS
  // ========================================
  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      storeName: 'Tienda Demo S.A.',
      address: 'Zona 1, Ciudad de Guatemala',
      phone: '5555-1234',
      nit: '12345678-9',
      receiptMsg: '¡Gracias por su compra!',
      felEnabled: false,
      felProvider: 'NONE',
      taxRate: 0.12,
      taxIncluded: true,
      currency: 'GTQ',
      currencySymbol: 'Q',
    },
  });
  console.log('✅ Company settings configured');

  // ========================================
  // 5. SUBSCRIPTION (Trial)
  // ========================================
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30); // 30 day trial

  await prisma.subscription.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      plan: 'trial',
      status: 'TRIAL',
      price: 0,
      maxBranches: 3,
      maxUsersPerBranch: 5,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEnd,
      trialEndsAt: trialEnd,
    },
  });
  console.log('✅ Subscription: Trial (30 days)');

  // ========================================
  // 6. USERS (Company-level)
  // ========================================
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@tiendademo.com' },
    update: { password: adminPassword },
    create: {
      name: 'Admin Demo',
      email: 'admin@tiendademo.com',
      password: adminPassword,
      role: 'ADMIN',
      companyId: company.id,
      // No branchId = access to all branches
    },
  });

  const cashierPassword = await bcrypt.hash('cajero123', 10);
  const cashier = await prisma.user.upsert({
    where: { email: 'cajero@tiendademo.com' },
    update: { password: cashierPassword },
    create: {
      name: 'Carlos Cajero',
      email: 'cajero@tiendademo.com',
      password: cashierPassword,
      role: 'CASHIER',
      companyId: company.id,
      branchId: mainBranch.id,
    },
  });
  console.log('✅ Users: admin@tiendademo.com / admin123');
  console.log('✅ Users: cajero@tiendademo.com / cajero123');

  // ========================================
  // 7. CATEGORIES
  // ========================================
  let electronics = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'Electrónica' },
  });
  if (!electronics) {
    electronics = await prisma.category.create({
      data: {
        companyId: company.id,
        name: 'Electrónica',
        description: 'Gadgets y tecnología',
      },
    });
  }

  let appliances = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'Electrodomésticos' },
  });
  if (!appliances) {
    appliances = await prisma.category.create({
      data: {
        companyId: company.id,
        name: 'Electrodomésticos',
        description: 'Para el hogar',
      },
    });
  }
  console.log('✅ Categories: Electrónica + Electrodomésticos');

  // ========================================
  // 8. PRODUCTS + STOCK PER BRANCH
  // ========================================
  const productsData = [
    {
      sku: 'IPHONE15-BLK',
      name: 'iPhone 15 128GB Black',
      price: 8500.0,
      cost: 6200.0,
      categoryId: electronics.id,
      stocks: { central: 10, zona10: 5 },
    },
    {
      sku: 'TEC-MEC-RGB',
      name: 'Teclado Mecánico RGB K68',
      price: 450.0,
      cost: 210.0,
      categoryId: electronics.id,
      stocks: { central: 20, zona10: 3 },
    },
    {
      sku: 'LIC-NINJA-01',
      name: 'Licuadora Ninja Professional',
      price: 1250.0,
      cost: 850.0,
      categoryId: appliances.id,
      stocks: { central: 15, zona10: 10 },
    },
  ];

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      update: { price: p.price, cost: p.cost },
      create: {
        companyId: company.id,
        categoryId: p.categoryId,
        sku: p.sku,
        name: p.name,
        price: p.price,
        cost: p.cost,
      },
    });

    // Stock for central branch
    await prisma.productStock.upsert({
      where: { productId_branchId: { productId: product.id, branchId: mainBranch.id } },
      update: { quantity: p.stocks.central },
      create: {
        productId: product.id,
        branchId: mainBranch.id,
        quantity: p.stocks.central,
        minStock: 5,
      },
    });

    // Stock for Zona 10 branch
    await prisma.productStock.upsert({
      where: { productId_branchId: { productId: product.id, branchId: secondBranch.id } },
      update: { quantity: p.stocks.zona10 },
      create: {
        productId: product.id,
        branchId: secondBranch.id,
        quantity: p.stocks.zona10,
        minStock: 3,
      },
    });
  }
  console.log('✅ Products with stock per branch');

  // ========================================
  // 9. DEMO CUSTOMER
  // ========================================
  await prisma.customer.upsert({
    where: { id: 'demo-customer-1' },
    update: {},
    create: {
      id: 'demo-customer-1',
      companyId: company.id,
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '5555-9999',
      nit: 'CF',
      creditLimit: 5000,
      balance: 0,
    },
  });
  console.log('✅ Demo customer: Juan Pérez');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login credentials:');
  console.log('   Platform Admin: admin@simtechpos.com / superadmin123');
  console.log('   Company Admin:  admin@tiendademo.com / admin123');
  console.log('   Cashier:        cajero@tiendademo.com / cajero123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
