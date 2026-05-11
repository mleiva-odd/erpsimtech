import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const BranchSchema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  code: z.string().min(2, 'Código requerido'),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  isMain: z.boolean().optional().default(false),
});

// List branches for current company
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const branches = await prisma.branch.findMany({
      where: { companyId: tenant.companyId },
      include: {
        _count: {
          select: { users: true, sales: true, productStocks: true },
        },
      },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    });
    return NextResponse.json(branches);
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener sucursales' }, { status: 500 });
  }
}

// Create a new branch
export async function POST(req: NextRequest) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    // Check subscription limits
    const subscription = await prisma.subscription.findUnique({
      where: { companyId: tenant.companyId },
    });
    const currentBranches = await prisma.branch.count({
      where: { companyId: tenant.companyId },
    });

    if (subscription && currentBranches >= subscription.maxBranches) {
      return NextResponse.json(
        { error: `Tu plan permite máximo ${subscription.maxBranches} sucursales. Actualiza tu plan para agregar más.` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = BranchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    // If this is set as main, unset any existing main branch
    if (parsed.data.isMain) {
      await prisma.branch.updateMany({
        where: { companyId: tenant.companyId, isMain: true },
        data: { isMain: false },
      });
    }

    const branch = await prisma.branch.create({
      data: {
        companyId: tenant.companyId,
        name: parsed.data.name,
        code: parsed.data.code,
        address: parsed.data.address || null,
        phone: parsed.data.phone || null,
        isMain: parsed.data.isMain,
      },
    });

    // Create stock entries for all existing products in this new branch
    const products = await prisma.product.findMany({
      where: { companyId: tenant.companyId, active: true },
      select: { id: true },
    });

    if (products.length > 0) {
      await prisma.productStock.createMany({
        data: products.map((p) => ({
          productId: p.id,
          branchId: branch.id,
          quantity: 0,
          minStock: 5,
        })),
      });
    }

    return NextResponse.json(branch, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Ya existe una sucursal con ese código' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al crear sucursal' }, { status: 500 });
  }
}
