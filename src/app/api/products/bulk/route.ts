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

      // Group rows by Parent Name
      const productMap = new Map<string, any[]>();
      for (const p of products) {
        if (!p.name || !p.sku) continue; // Skip broken rows
        const key = String(p.name).trim();
        if (!productMap.has(key)) productMap.set(key, []);
        productMap.get(key)!.push(p);
      }

      for (const [parentName, rows] of productMap.entries()) {
        const firstRow = rows[0];

        // Dynamic Category Mapping
        let categoryId = firstRow.categoryId;
        if (!categoryId && firstRow.categoryName) {
           let cat = await tx.category.findFirst({
             where: { companyId: tenant.companyId, name: { equals: String(firstRow.categoryName).trim(), mode: 'insensitive' } }
           });
           if (!cat) { // Auto-create requested missing category
              cat = await tx.category.create({
                data: { companyId: tenant.companyId, name: String(firstRow.categoryName).trim(), description: 'Generada por Smart Import' }
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

        // Map and Format UOM safely
        const validUOM = ['UNIT', 'KG', 'LB', 'LITER', 'GALLON', 'BOX'];
        const chosenUOM = validUOM.includes(firstRow.unitOfMeasure?.toUpperCase()) ? firstRow.unitOfMeasure?.toUpperCase() : 'UNIT';

        const isMatrix = rows.length > 1 || !!firstRow.variantName;

        if (!isMatrix) {
          // Normal Simple Product Check
          const exists = await tx.product.findFirst({
             where: { companyId: tenant.companyId, sku: String(firstRow.sku).trim() }
          });

          if (exists) {
            // Inteligencia Multi-sucursal: Si existe el producto global, aseguramos el stock para esta sucursal
            await tx.productStock.upsert({
              where: { 
                productId_branchId_variantId: { 
                  productId: exists.id, 
                  branchId, 
                  variantId: (null as any) 
                } 
              },
              update: { 
                quantity: Number(firstRow.stock) || 0,
                minStock: Number(firstRow.minStock) || 5
              },
              create: { 
                productId: exists.id, 
                branchId, 
                variantId: (null as any),
                quantity: Number(firstRow.stock) || 0,
                minStock: Number(firstRow.minStock) || 5
              }
            });
            count++;
            continue;
          }

          await tx.product.create({
            data: {
              companyId: tenant.companyId,
              categoryId,
              name: parentName,
              sku: String(firstRow.sku).trim(),
              barcode: firstRow.barcode ? String(firstRow.barcode) : null,
              price: Number(firstRow.price) || 0,
              cost: Number(firstRow.cost) || 0,
              stocks: {
                create: {
                  branchId,
                  quantity: Number(firstRow.stock) || 0,
                  minStock: Number(firstRow.minStock) || 5
                }
              }
            }
          });
          count++;
        } else {
          // Matrix Multi-Variant Product grouping
          const exists = await tx.product.findFirst({ 
            where: { companyId: tenant.companyId, name: parentName },
            include: { variants: true }
          });
          
          let p;
          if (exists) {
            p = exists;
          } else {
            const parentSku = `MAT-${String(firstRow.sku).trim().substring(0,6)}-${Date.now().toString().slice(-4)}`;
            p = await tx.product.create({
              data: {
                companyId: tenant.companyId,
                categoryId,
                name: parentName,
                sku: parentSku,
                price: 0,
                cost: 0,
                hasVariants: true
              }
            });
          }

          for (const r of rows) {
             // Upsert Variant
             const v = await tx.productVariant.upsert({
                where: { productId_sku: { productId: p.id, sku: String(r.sku).trim() } },
                update: { name: String(r.variantName || r.sku).trim() },
                create: {
                  productId: p.id,
                  name: String(r.variantName || r.sku).trim(),
                  sku: String(r.sku).trim(),
                  barcode: r.barcode ? String(r.barcode) : null,
                  price: Number(r.price) || Number(firstRow.price) || 0,
                }
             });

             // Upsert Stock for current Branch
             await tx.productStock.upsert({
               where: { 
                 productId_branchId_variantId: { 
                   productId: p.id, 
                   branchId, 
                   variantId: v.id 
                 } 
               },
               update: { 
                 quantity: Number(r.stock) || 0,
                 minStock: Number(r.minStock) || 5
               },
               create: {
                 productId: p.id,
                 branchId,
                 variantId: v.id,
                 quantity: Number(r.stock) || 0,
                 minStock: Number(r.minStock) || 5
               }
             });
          }
          count++;
        }
      }
      return count;
    }, { timeout: 30000 }); // Allowed 30 seconds for giant datasets

    return NextResponse.json({ message: 'Procesamiento Masivo Finalizado Exitosamente', inserted: createdCount }, { status: 201 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || 'Error destructivo procesando catálogo.' }, { status: 500 });
  }
}
