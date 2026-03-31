import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/tenant';

export async function POST(req: NextRequest) {
  const result = await requireRole('ADMIN');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { products } = await req.json();

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'El archivo Excel/CSV está vacío o tiene formato inválido.' }, { status: 400 });
    }

    // Verify target Branch for Stock mapping
    let branchId = tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
      if (!branchId) return NextResponse.json({ error: 'No hay sucursal activa asignada a este comercio.' }, { status: 400 });
    }

    // Bulletproof Transaction mapping thousands of rows concurrently safely
    const createdCount = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const p of products) {
        if (!p.sku || !p.name) continue; // Skip totally broken rows

        // Dynamic Category Mapping
        let categoryId = p.categoryId;
        if (!categoryId && p.categoryName) {
           let cat = await tx.category.findFirst({
             where: { companyId: tenant.companyId, name: { equals: p.categoryName, mode: 'insensitive' } }
           });
           if (!cat) { // Auto-create requested missing category
              cat = await tx.category.create({
                data: { companyId: tenant.companyId, name: p.categoryName, description: 'Generada por Smart Import' }
              });
           }
           categoryId = cat.id;
        }

        // Safeties on extreme cases without any categorized text
        if (!categoryId) {
           const fallback = await tx.category.findFirst({ where: { companyId: tenant.companyId } });
           if (!fallback) throw new Error("Debes crear al menos una categoría general antes de importar.");
           categoryId = fallback.id;
        }

        // Anti-Fraud Duplication Check via SKU
        const exists = await tx.product.findFirst({
           where: { companyId: tenant.companyId, sku: String(p.sku) }
        });

        if (exists) continue; // Silent Skip (Do not break batch processing)

        // Map and Format UOM safely
        const validUOM = ['UNIT', 'KG', 'LB', 'LITER', 'GALLON', 'BOX'];
        const chosenUOM = validUOM.includes(p.unitOfMeasure?.toUpperCase()) ? p.unitOfMeasure?.toUpperCase() : 'UNIT';

        await tx.product.create({
          data: {
            companyId: tenant.companyId,
            categoryId,
            name: String(p.name).trim(),
            sku: String(p.sku).trim(),
            barcode: p.barcode ? String(p.barcode) : null,
            price: Number(p.price) || 0,
            wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
            cost: Number(p.cost) || 0,
            unitOfMeasure: chosenUOM as any,
            isTaxExempt: p.isTaxExempt === 'SI' || p.isTaxExempt === true || p.isTaxExempt === 'true',
            stocks: {
              create: {
                branchId,
                quantity: Number(p.stock) || 0,
                minStock: Number(p.minStock) || 5
              }
            }
          }
        });
        count++;
      }
      return count;
    }, { timeout: 30000 }); // Allowed 30 seconds for giant datasets

    return NextResponse.json({ message: 'Procesamiento Masivo Finalizado Exitosamente', inserted: createdCount }, { status: 201 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || 'Error destructivo procesando catálogo.' }, { status: 500 });
  }
}
