import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const RFQItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  specifications: z.string().trim().max(500).optional().nullable(),
});

const CreateRFQSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(1).max(500),
  items: z.array(RFQItemSchema).min(1),
});

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const statusParam = req.nextUrl.searchParams.get('status');

  const rfqs = await prisma.rFQRequest.findMany({
    where: {
      companyId: tenant.companyId,
      ...(statusParam ? { status: statusParam as never } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
      quotes: {
        include: {
          supplier: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ rfqs });
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission([
    'purchases:create',
    'purchases:request',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateRFQSchema.parse(body);

    let branchId = parsed.branchId ?? tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
      if (!branchId) {
        throw new ApiError(400, 'No hay sucursal disponible para la RFQ.');
      }
    }

    const productIds = [...new Set(parsed.items.map((it) => it.productId))];
    const ok = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: tenant.companyId },
      select: { id: true },
    });
    if (ok.length !== productIds.length) {
      throw new ApiError(400, 'Algún producto no pertenece a esta empresa.');
    }

    const rfq = await prisma.rFQRequest.create({
      data: {
        companyId: tenant.companyId,
        branchId,
        reason: parsed.reason,
        createdById: tenant.userId,
        status: 'OPEN',
        items: {
          create: parsed.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId ?? null,
            quantity: new PrismaNS.Decimal(it.quantity),
            specifications: it.specifications ?? null,
          })),
        },
      },
      include: { items: true },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_CREATED',
      entity: 'RFQRequest',
      entityId: rfq.id,
      details: { itemCount: rfq.items.length },
    });

    return NextResponse.json(rfq, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq POST');
  }
}
