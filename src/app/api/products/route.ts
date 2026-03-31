import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireRole } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const categoryId = searchParams.get('categoryId') ?? '';
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '24');

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

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        stocks: tenant.branchId
          ? { where: { branchId: tenant.branchId } }
          : true,
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
  ]);

  // Map stock data for backward compatibility with frontend
  const productsWithStock = products.map((p) => {
    const branchStock = p.stocks[0]; // first matching stock entry
    return {
      ...p,
      stock: branchStock?.quantity ?? 0,
      minStock: branchStock?.minStock ?? 5,
    };
  });

  return NextResponse.json({ products: productsWithStock, total, page, limit });
}

export async function POST(req: NextRequest) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const { name, sku, barcode, price, wholesalePrice, cost, stock, minStock, categoryId, description, isTaxExempt, unitOfMeasure } = body;

  if (!name || !sku || price === undefined || cost === undefined || !categoryId) {
    return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 });
  }

  try {
    // Create product + initial stock for the user's branch (or main branch)
    const targetBranchId = tenant.branchId;
    let branchId = targetBranchId;

    // If user has no branch assigned, use main branch
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
    }

    const product = await prisma.product.create({
      data: {
        companyId: tenant.companyId,
        name,
        sku,
        barcode: barcode || null,
        description: description || null,
        price,
        wholesalePrice: wholesalePrice || null,
        cost,
        isTaxExempt: isTaxExempt ?? false,
        unitOfMeasure: unitOfMeasure || 'UNIT',
        categoryId,
        ...(branchId && {
          stocks: {
            create: {
              branchId,
              quantity: stock ?? 0,
              minStock: minStock ?? 5,
            },
          },
        }),
      },
      include: { category: true, stocks: true },
    });

    return NextResponse.json(
      { ...product, stock: stock ?? 0, minStock: minStock ?? 5 },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al crear producto';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'El SKU o código de barras ya existe en esta empresa' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
