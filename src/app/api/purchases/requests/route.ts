import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

/**
 * Fase 19 · Endpoint de PurchaseRequest (solicitud de compra interna).
 *
 * GET  → lista de PRs de la empresa (filtros por status opcional).
 * POST → alta de PR (un empleado solicita comprar algo).
 */

const PRItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  estimatedUnitCost: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const CreatePRSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(1).max(500),
  items: z.array(PRItemSchema).min(1),
});

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:request',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const statusParam = req.nextUrl.searchParams.get('status');

  const prs = await prisma.purchaseRequest.findMany({
    where: {
      companyId: tenant.companyId,
      ...(statusParam ? { status: statusParam as never } : {}),
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ purchaseRequests: prs });
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission([
    'purchases:request',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreatePRSchema.parse(body);

    let branchId = parsed.branchId ?? tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
      if (!branchId) {
        throw new ApiError(400, 'No hay sucursal disponible para la PR.');
      }
    }

    if (parsed.supplierId) {
      const s = await prisma.supplier.findFirst({
        where: { id: parsed.supplierId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!s) throw new ApiError(400, 'Proveedor inválido.');
    }

    // Validar productos pertenecen a la empresa.
    const productIds = [...new Set(parsed.items.map((it) => it.productId))];
    const ok = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: tenant.companyId },
      select: { id: true },
    });
    if (ok.length !== productIds.length) {
      throw new ApiError(400, 'Algún producto no pertenece a esta empresa.');
    }

    const pr = await prisma.purchaseRequest.create({
      data: {
        companyId: tenant.companyId,
        branchId,
        supplierId: parsed.supplierId ?? null,
        requestedById: tenant.userId,
        reason: parsed.reason,
        status: 'PENDING',
        items: {
          create: parsed.items.map((it, idx) => ({
            productId: it.productId,
            variantId: it.variantId ?? null,
            quantity: new PrismaNS.Decimal(it.quantity),
            estimatedUnitCost:
              it.estimatedUnitCost != null
                ? new PrismaNS.Decimal(it.estimatedUnitCost)
                : null,
            notes: it.notes ?? null,
            // Fase 22d-5
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_REQUEST_CREATED',
      entity: 'PurchaseRequest',
      entityId: pr.id,
      details: { itemCount: pr.items.length },
    });

    return NextResponse.json(pr, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/requests POST');
  }
}
