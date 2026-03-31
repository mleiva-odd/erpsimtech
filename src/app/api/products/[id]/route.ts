import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireTenant } from '@/lib/tenant';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;
  const body = await req.json();

  try {
    // Verify product belongs to this company
    const existing = await prisma.product.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    const updated = await prisma.product.update({
      where: { id: resolvedParams.id },
      data: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode || null,
        description: body.description || null,
        price: body.price !== undefined ? Number(body.price) : undefined,
        cost: body.cost !== undefined ? Number(body.cost) : undefined,
        categoryId: body.categoryId,
        active: body.active !== undefined ? body.active : undefined,
      },
      include: { category: { select: { name: true } } },
    });

    // Update stock if provided (for the user's branch)
    if (body.stock !== undefined || body.minStock !== undefined) {
      let branchId = tenant.branchId;
      if (!branchId) {
        const mainBranch = await prisma.branch.findFirst({
          where: { companyId: tenant.companyId, isMain: true },
        });
        branchId = mainBranch?.id ?? null;
      }

      if (branchId) {
        await prisma.productStock.upsert({
          where: { productId_branchId: { productId: resolvedParams.id, branchId } },
          update: {
            ...(body.stock !== undefined && { quantity: Number(body.stock) }),
            ...(body.minStock !== undefined && { minStock: Number(body.minStock) }),
          },
          create: {
            productId: resolvedParams.id,
            branchId,
            quantity: Number(body.stock ?? 0),
            minStock: Number(body.minStock ?? 5),
          },
        });
      }
    }

    return NextResponse.json({ ...updated, stock: body.stock, minStock: body.minStock });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar producto' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole('ADMIN');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    // Verify product belongs to this company
    const existing = await prisma.product.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    const product = await prisma.product.update({
      where: { id: resolvedParams.id },
      data: { active: false },
    });
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 });
  }
}
