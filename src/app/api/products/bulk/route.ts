import { NextRequest, NextResponse } from 'next/server';
import { Prisma, UnitOfMeasure } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { logStockMovementInline } from '@/lib/inventory';

interface ImportedProductRow {
  name?: string;
  sku?: string;
  categoryId?: string;
  categoryName?: string;
  unitOfMeasure?: string;
  variantName?: string;
  barcode?: string;
  price?: number | string;
  cost?: number | string;
  stock?: number | string;
  minStock?: number | string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function upsertBaseStock(tx: Prisma.TransactionClient, input: {
  productId: string;
  branchId: string;
  quantity: number;
  minStock: number;
}) {
  const existing = await tx.productStock.findFirst({
    where: {
      productId: input.productId,
      branchId: input.branchId,
      variantId: null,
    },
    select: { id: true },
  });

  if (existing) {
    await tx.productStock.update({
      where: { id: existing.id },
      data: {
        quantity: input.quantity,
        minStock: input.minStock,
      }
    });
    return;
  }

  await tx.productStock.create({
    data: {
      productId: input.productId,
      branchId: input.branchId,
      variantId: null,
      quantity: input.quantity,
      minStock: input.minStock,
    }
  });
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const products = Array.isArray(body.products) ? (body.products as ImportedProductRow[]) : [];

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
      const productMap = new Map<string, ImportedProductRow[]>();
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
        const validUOM: readonly UnitOfMeasure[] = ['UNIT', 'KG', 'LB', 'LITER', 'GALLON', 'BOX'];
        const normalizedUOM = firstRow.unitOfMeasure?.toUpperCase();
        const chosenUOM: UnitOfMeasure = normalizedUOM && validUOM.includes(normalizedUOM as UnitOfMeasure)
          ? (normalizedUOM as UnitOfMeasure)
          : 'UNIT';

        const isMatrix = rows.length > 1 || !!firstRow.variantName;

        if (!isMatrix) {
          // Normal Simple Product Check
          const exists = await tx.product.findFirst({
             where: { companyId: tenant.companyId, sku: String(firstRow.sku).trim() }
          });

          if (exists) {
            // Inteligencia Multi-sucursal: Si existe el producto global, aseguramos el stock para esta sucursal
            const stockBefore = await tx.productStock.findFirst({
              where: { productId: exists.id, branchId, variantId: null },
              select: { quantity: true },
            });
            const oldQty = Number(stockBefore?.quantity ?? 0);
            const newQty = Number(firstRow.stock) || 0;
            await upsertBaseStock(tx, {
              productId: exists.id,
              branchId,
              quantity: newQty,
              minStock: Number(firstRow.minStock) || 5,
            });
            // Si hubo cambio de stock, log como ADJUSTMENT (Fase 15).
            const diff = newQty - oldQty;
            if (diff !== 0) {
              await logStockMovementInline(tx, {
                companyId: tenant.companyId,
                productId: exists.id,
                variantId: null,
                branchId,
                type: diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
                quantity: diff,
                unitCost: Number(firstRow.cost) || Number(exists.cost ?? 0),
                referenceType: 'PRODUCT_BULK_IMPORT',
                referenceId: exists.id,
                userId: tenant.userId,
                notes: 'Importación masiva (existente)',
              });
            }
            count++;
            continue;
          }

          const createdSimple = await tx.product.create({
            data: {
              companyId: tenant.companyId,
              categoryId,
              name: parentName,
              sku: String(firstRow.sku).trim(),
              barcode: firstRow.barcode ? String(firstRow.barcode) : null,
              price: Number(firstRow.price) || 0,
              cost: Number(firstRow.cost) || 0,
              unitOfMeasure: chosenUOM,
              stocks: {
                create: {
                  branchId,
                  quantity: Number(firstRow.stock) || 0,
                  minStock: Number(firstRow.minStock) || 5
                }
              }
            }
          });
          const initialQty = Number(firstRow.stock) || 0;
          if (initialQty > 0) {
            await logStockMovementInline(tx, {
              companyId: tenant.companyId,
              productId: createdSimple.id,
              variantId: null,
              branchId,
              type: 'ADJUSTMENT_IN',
              quantity: initialQty,
              unitCost: Number(firstRow.cost) || 0,
              referenceType: 'PRODUCT_BULK_IMPORT',
              referenceId: createdSimple.id,
              userId: tenant.userId,
              notes: 'Importación masiva (nuevo)',
            });
          }
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
                unitOfMeasure: chosenUOM,
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
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getErrorMessage(error, 'Error destructivo procesando catálogo.') }, { status: 500 });
  }
}
