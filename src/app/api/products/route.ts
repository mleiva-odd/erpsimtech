import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireRole } from '@/lib/tenant';
import { z } from 'zod';

const VariantSchema = z.object({
  name: z.string(),
  sku: z.string(),
  barcode: z.string().optional().nullable(),
  price: z.preprocess((val) => Number(val), z.number().min(0)),
  cost: z.preprocess((val) => Number(val), z.number().min(0)),
  stock: z.preprocess((val) => Number(val), z.number().min(0)),
});

export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const categoryId = searchParams.get('categoryId') ?? '';
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '24');
  const requestedBranchId = searchParams.get('branchId');
  const lowStockOnly = searchParams.get('lowStock') === 'true';

  const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';

  let targetBranchId = tenant.branchId;
  if (isAdmin && requestedBranchId && requestedBranchId !== 'null') {
    // Seguridad: Validar que la sucursal solicitada pertenezca a la empresa del usuario
    const branch = await prisma.branch.findFirst({
      where: { id: requestedBranchId, companyId: tenant.companyId },
      select: { id: true }
    });
    if (!branch) {
      return NextResponse.json({ error: 'Acceso denegado a la sucursal solicitada' }, { status: 403 });
    }
    targetBranchId = branch.id;
  }

  const where = {
    companyId: tenant.companyId,
    active: true,
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { sku: { contains: q, mode: 'insensitive' as const } },
        { barcode: { contains: q, mode: 'insensitive' as const } },
      ],
    }),
    ...(categoryId && { categoryId }),
  };

  let lowStockProductIds: string[] | null = null;
  if (lowStockOnly) {
    const lowStockRows = await prisma.$queryRaw<Array<{ productId: string }>>`
      SELECT DISTINCT ps."productId"
      FROM "ProductStock" ps
      JOIN "Product" p ON p.id = ps."productId"
      WHERE p."companyId" = ${tenant.companyId}
        AND p.active = true
        AND ps.quantity <= ps."minStock"
        ${targetBranchId ? Prisma.sql`AND ps."branchId" = ${targetBranchId}` : Prisma.empty}
    `;

    lowStockProductIds = lowStockRows.map((row) => row.productId);
    if (lowStockProductIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, page, limit });
    }
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: {
        ...where,
        ...(lowStockProductIds ? { id: { in: lowStockProductIds } } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        stocks: targetBranchId
          ? { where: { branchId: targetBranchId, variantId: null } }
          : { where: { variantId: null } },
        variants: {
          include: {
            stocks: targetBranchId
              ? { where: { branchId: targetBranchId } }
              : true,
          }
        }
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({
      where: {
        ...where,
        ...(lowStockProductIds ? { id: { in: lowStockProductIds } } : {}),
      },
    }),
  ]);

  // Map stock data for backward compatibility with frontend, inject matrix computations
  const productsWithStock = products.map((p) => {
    let computedStock = 0;
    
    if (p.hasVariants && p.variants.length > 0) {
       // Sum physical stock across all variants
       if (targetBranchId) {
         p.variants.forEach(v => { computedStock += (v.stocks[0]?.quantity || 0); });
       } else {
         p.variants.forEach(v => {
           v.stocks.forEach(s => { computedStock += s.quantity; });
         });
       }
    } else {
       // Classic direct stock
       if (targetBranchId) {
         computedStock = p.stocks[0]?.quantity ?? 0;
       } else {
         computedStock = p.stocks.reduce((acc, s) => acc + s.quantity, 0);
       }
    }

    return {
      ...p,
      stock: computedStock,
      minStock: p.stocks[0]?.minStock ?? 5,
    };
  });

  return NextResponse.json({ products: productsWithStock, total, page, limit });
}

const ProductSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  sku: z.string().min(1, 'El SKU es requerido'),
  barcode: z.string().optional().nullable(),
  price: z.preprocess((val) => Number(val), z.number().min(0)),
  wholesalePrice: z.preprocess((val) => val === '' || val == null ? null : Number(val), z.number().min(0).nullable().optional()),
  cost: z.preprocess((val) => Number(val), z.number().min(0)),
  stock: z.preprocess((val) => Number(val), z.number().min(0)),
  minStock: z.preprocess((val) => Number(val), z.number().min(0)),
  categoryId: z.string().uuid('Categoría inválida'),
  description: z.string().optional().nullable(),
  isTaxExempt: z.boolean().optional().default(false),
  unitOfMeasure: z.enum(['UNIT', 'KG', 'LB', 'LITER', 'GALLON', 'BOX']).optional().default('UNIT'),
  hasVariants: z.boolean().optional().default(false),
  variants: z.array(VariantSchema).optional(),
  imageUrl: z.string().optional().nullable(),
  isBundle: z.boolean().optional().default(false),
  bundleItems: z.array(z.object({
    componentId: z.string(),
    quantity: z.number().min(1)
  })).optional(),
});

export async function POST(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = ProductSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, sku, barcode, price, wholesalePrice, cost, stock, minStock, categoryId, description, isTaxExempt, unitOfMeasure, hasVariants, variants, imageUrl, isBundle, bundleItems } = parsed.data;
  let finalBarcode = barcode && barcode.trim() !== '' ? barcode : null;
  if (!finalBarcode) {
    const randomNum = Math.floor(1000000 + Math.random() * 9000000); // 7 random digits
    finalBarcode = `SIM-${randomNum}`;
  }

  try {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId: tenant.companyId },
      select: { id: true },
    });

    if (!category) {
      return NextResponse.json({ error: 'La categoría no pertenece a esta empresa' }, { status: 400 });
    }

    if (isBundle && bundleItems?.length) {
      const componentIds = [...new Set(bundleItems.map((item) => item.componentId))];
      const components = await prisma.product.count({
        where: {
          id: { in: componentIds },
          companyId: tenant.companyId,
        },
      });

      if (components !== componentIds.length) {
        return NextResponse.json({ error: 'El combo incluye productos fuera de tu empresa' }, { status: 400 });
      }
    }

    const targetBranchId = tenant.branchId;
    let branchId = targetBranchId;

    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
    }

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          companyId: tenant.companyId,
          name,
          sku,
          barcode: finalBarcode,
          description: description || null,
          price: hasVariants ? 0 : price,
          wholesalePrice: wholesalePrice ? Number(wholesalePrice) : null,
          cost: hasVariants ? 0 : cost,
          isTaxExempt: isTaxExempt ?? false,
          unitOfMeasure: unitOfMeasure || 'UNIT',
          categoryId,
          hasVariants: hasVariants ?? false,
          imageUrl: imageUrl || null,
          isBundle: isBundle ?? false,

          // Stock clásico (Básico)
          ...((branchId && !hasVariants && !isBundle) && {
            stocks: {
              create: {
                branchId,
                quantity: Number(stock) || 0,
                minStock: Number(minStock) || 5,
              },
            },
          }),

          ...(isBundle && bundleItems && bundleItems.length > 0 && {
            bundleItems: {
               create: bundleItems.map((b) => ({
                 componentId: b.componentId,
                 quantity: b.quantity
               }))
            }
          })
        }
      });

      // Anidación Multi-Dimensión secuencial para heredar la jerarquía correcta
      if (hasVariants && variants && variants.length > 0 && branchId) {
        for (const v of variants) {
           await tx.productVariant.create({
             data: {
               productId: p.id,
               name: String(v.name).trim(),
               sku: String(v.sku).trim(),
               barcode: v.barcode ? String(v.barcode) : null,
               price: Number(v.price) || 0,
               cost: Number(v.cost) || 0,
               stocks: {
                 create: {
                   productId: p.id, // VITAL: Enlace que pedía la BBDD
                   branchId: branchId,
                   quantity: Number(v.stock) || 0,
                   minStock: Number(minStock) || 5
                 }
               }
             }
           });
        }
      }

      return tx.product.findUnique({
         where: { id: p.id },
         include: { category: true, stocks: true, variants: { include: { stocks: true } } }
      });
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al crear producto';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'El SKU o código de barras ya existe en esta empresa' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
