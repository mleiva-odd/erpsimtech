import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando Seeding de la Base de Datos SIMTECH...');
  
  const hashedPassword = await bcrypt.hash('admin123', 10);

  // 1. Super Admin de la Plataforma Master
  const sa = await prisma.user.upsert({
    where: { email: 'admin@simtechpos.com' },
    update: { password: hashedPassword, role: 'SUPER_ADMIN' },
    create: {
      email: 'admin@simtechpos.com',
      name: 'Super Administrador',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });
  console.log('-> Super Admin verificado: admin@simtechpos.com');

  // 2. Creación del Negocio Empresa (Tenant)
  const company = await prisma.company.upsert({
    where: { slug: 'simtech' },
    update: {},
    create: {
      name: 'Negocio SIMTECH',
      slug: 'simtech',
      email: 'simtech@simtech.com',
    },
  });
  console.log(`-> Empresa verificada: ${company.name}`);

  // 3. Crear Sucursal y Caja por defecto
  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'SUC-01' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Sucursal Central',
      code: 'SUC-01',
      isMain: true,
    }
  });

  // 4. Admin del Negocio
  const adminNegocio = await prisma.user.upsert({
    where: { email: 'simtech@simtech.com' },
    update: { password: hashedPassword, role: 'ADMIN', companyId: company.id },
    create: {
      email: 'simtech@simtech.com',
      name: 'Admin de Negocio',
      password: hashedPassword,
      role: 'ADMIN',
      companyId: company.id,
    },
  });
  
  // Accesos del Admin Negocio
  await prisma.userBranchAccess.upsert({
    where: { userId_branchId: { userId: adminNegocio.id, branchId: branch.id } },
    update: {},
    create: { userId: adminNegocio.id, branchId: branch.id }
  });
  console.log('-> Admin de Negocio verificado: simtech@simtech.com');

  // 5. Productos de Prueba (Inventario Base)
  const category = await prisma.category.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Tecnología' } },
    update: {},
    create: { companyId: company.id, name: 'Tecnología', description: 'Gadgets' }
  });

  const productsData = [
    { sku: 'PRO-1', name: 'MacBook Pro M3', price: 15000, cost: 12000, barcode: '881122' },
    { sku: 'PRO-2', name: 'Logitech MX Master 3S', price: 900, cost: 650, barcode: '881133' },
    { sku: 'PRO-3', name: 'Monitor Dell 27"', price: 3500, cost: 2800, barcode: '881144' },
  ];

  for (const p of productsData) {
    const prod = await prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      update: {},
      create: {
        companyId: company.id,
        categoryId: category.id,
        sku: p.sku,
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        cost: p.cost,
      }
    });

    // Añadir stock 10 unidades a Sucursal
    await prisma.productStock.upsert({
      where: { productId_branchId: { productId: prod.id, branchId: branch.id } },
      update: {},
      create: { productId: prod.id, branchId: branch.id, quantity: 15 }
    });
  }
  console.log('-> Inventario Base (3 Productos) inyectado en Sucursal Central.');

  console.log('\\n✅ ¡BASE DE DATOS Y USUARIOS SEMBRADOS CON ÉXITO!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
