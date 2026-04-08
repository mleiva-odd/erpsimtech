import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireTenant } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;

  const resolvedParams = await params;
  try {
    const product = await prisma.product.findFirst({
      where: { id: resolvedParams.id, companyId: result.tenant.companyId },
      include: {
        category: true,
        variants: true,
        stocks: true,
        bundleItems: {
          include: {
            component: true,
            variant: true
          }
        }
      }
    });

    if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    return NextResponse.json(product);
  } catch (e) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

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

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id: resolvedParams.id },
        data: {
          name: body.name,
          sku: body.sku,
          barcode: body.barcode || null,
          description: body.description || null,
          price: body.hasVariants ? 0 : (body.price !== undefined ? Number(body.price) : undefined),
          wholesalePrice: body.wholesalePrice ? Number(body.wholesalePrice) : null,
          cost: body.hasVariants ? 0 : (body.cost !== undefined ? Number(body.cost) : undefined),
          isTaxExempt: body.isTaxExempt !== undefined ? body.isTaxExempt : undefined,
          unitOfMeasure: body.unitOfMeasure,
          active: body.active !== undefined ? body.active : undefined,
          hasVariants: body.hasVariants !== undefined ? body.hasVariants : undefined,
          isBundle: body.isBundle !== undefined ? body.isBundle : undefined,
        },
      });

      // Set Branch Id context for modifications
      let branchId = tenant.branchId;
      if (!branchId) {
        const mainBranch = await tx.branch.findFirst({
          where: { companyId: tenant.companyId, isMain: true },
        });
        branchId = mainBranch?.id ?? null;
      }

      if (body.isBundle) {
          await tx.productBundleItem.deleteMany({ where: { bundleProductId: resolvedParams.id } });
          if (body.bundleItems && body.bundleItems.length > 0) {
             for (const b of body.bundleItems) {
                await tx.productBundleItem.create({
                   data: {
                      bundleProductId: resolvedParams.id,
                      componentId: b.componentId,
                      variantId: b.variantId || null,
                      quantity: b.quantity
                   }
                });
             }
          }
      }

      if (branchId) {
         if (body.hasVariants) {
            // Drop current variants completely and re-insert matrix to avoid un-mapped zombies
            await tx.productVariant.deleteMany({ where: { productId: resolvedParams.id } });
            await tx.productStock.deleteMany({ where: { productId: resolvedParams.id } });

            if (body.variants && body.variants.length > 0) {
              for (const v of body.variants) {
                 await tx.productVariant.create({
                   data: {
                     productId: resolvedParams.id,
                     name: String(v.name).trim(),
                     sku: String(v.sku).trim(),
                     barcode: v.barcode ? String(v.barcode) : null,
                     price: Number(v.price) || 0,
                     cost: Number(v.cost) || 0,
                     stocks: {
                       create: {
                         productId: resolvedParams.id,
                         branchId: branchId,
                         quantity: Number(v.stock) || 0,
                         minStock: Number(body.minStock) || 5
                       }
                     }
                   }
                 });
              }
            }
         } else {
            // Revert back to Standard Base Catalog item
            await tx.productVariant.deleteMany({ where: { productId: resolvedParams.id } });
            await tx.productStock.deleteMany({ where: { productId: resolvedParams.id } });

            await tx.productStock.create({
               data: {
                 productId: resolvedParams.id,
                 branchId,
                 quantity: Number(body.stock ?? 0),
                 minStock: Number(body.minStock ?? 5),
               }
            });
         }
      }

      return tx.product.findUnique({
        where: { id: resolvedParams.id },
        include: { category: { select: { name: true } } }
      });
    });

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
