
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function fix() {
  try {
    console.log('--- FORCING DB FIX ---');
    
    // Clear everything in correct order
    await prisma.productBundleItem.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.productStock.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.cashRegister.deleteMany();
    await prisma.user.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.company.deleteMany();

    const hash = await bcrypt.hash('admin123', 10);
    const cajeroHash = await bcrypt.hash('cajero123', 10);

    const company = await prisma.company.create({
      data: {
        name: 'Simtech Test',
        slug: 'simtech-test',
        email: 'test@simtech.com',
        active: true
      }
    });

    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Sucursal Tecpán',
        code: 'TECPAN',
        isMain: true,
        active: true
      }
    });

    await prisma.user.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        name: 'Cajero Tecpán',
        email: 'cajerotecpan@simtechgt.com',
        password: cajeroHash,
        role: 'CASHIER',
        active: true
      }
    });

    const cat = await prisma.category.create({
      data: { companyId: company.id, name: 'General' }
    });

    const prod = await prisma.product.create({
      data: {
        companyId: company.id,
        categoryId: cat.id,
        name: 'Producto de Prueba',
        sku: 'TEST-001',
        price: 100,
        cost: 50,
        active: true
      }
    });

    await prisma.productStock.create({
      data: {
        productId: prod.id,
        branchId: branch.id,
        quantity: 100,
        minStock: 5
      }
    });

    console.log('--- DB FIX COMPLETED ---');
    process.exit(0);
  } catch (e) {
    console.error('FAILED TO FIX DB:', e.message);
    process.exit(1);
  }
}

fix();
