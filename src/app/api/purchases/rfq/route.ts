import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma, RFQStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

/**
 * Fase 22c-4 · Endpoint principal de RFQ Request.
 *
 * GET  → lista paginada con filtros (status[], createdById, buyerId, fechas).
 * POST → alta de RFQ en DRAFT (debe pasar por /send para emitir).
 */

const RFQItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  specifications: z.string().trim().max(500).optional().nullable(),
  unit: z.string().trim().max(40).optional().nullable(),
  observations: z.string().trim().max(500).optional().nullable(),
});

const CreateRFQSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(1).max(500),
  items: z.array(RFQItemSchema).min(1),
  deliveryPlace: z.string().trim().max(500).optional().nullable(),
  responseDeadline: z.coerce.date().optional().nullable(),
  quoteValidityDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  buyerId: z.string().uuid().optional().nullable(),
});

const VALID_STATUS_SET = new Set<RFQStatus>([
  'DRAFT',
  'OPEN',
  'SENT',
  'AWARDED',
  'CANCELLED',
  'CLOSED',
] as RFQStatus[]);

function parseStatusFilter(raw: string | null): RFQStatus[] | null {
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const valid: RFQStatus[] = [];
  for (const p of parts) {
    if (VALID_STATUS_SET.has(p as RFQStatus)) valid.push(p as RFQStatus);
  }
  return valid.length > 0 ? valid : null;
}

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const sp = req.nextUrl.searchParams;
    const statusList = parseStatusFilter(sp.get('status'));
    const createdById = sp.get('createdById');
    const buyerId = sp.get('buyerId');
    const dateFromRaw = sp.get('dateFrom');
    const dateToRaw = sp.get('dateTo');

    const pageRaw = Number(sp.get('page') || '1');
    const pageSizeRaw = Number(sp.get('pageSize') || '20');
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 && pageSizeRaw <= 100
        ? Math.floor(pageSizeRaw)
        : 20;

    const where: Prisma.RFQRequestWhereInput = {
      companyId: tenant.companyId,
    };
    if (statusList) where.status = { in: statusList };
    if (createdById) where.createdById = createdById;
    if (buyerId) where.buyerId = buyerId;
    if (dateFromRaw || dateToRaw) {
      where.createdAt = {};
      if (dateFromRaw) {
        const d = new Date(dateFromRaw);
        if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (dateToRaw) {
        const d = new Date(dateToRaw);
        if (!Number.isNaN(d.getTime())) where.createdAt.lte = d;
      }
    }

    const [total, data] = await Promise.all([
      prisma.rFQRequest.count({ where }),
      prisma.rFQRequest.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          buyer: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { items: true, invitations: true, quotes: true } },
          awardedQuote: {
            select: {
              id: true,
              totalAmount: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);

    return NextResponse.json({ data, total, page, pageSize });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq GET');
  }
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

    // Verificar branch pertenece a la empresa
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, companyId: tenant.companyId },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new ApiError(400, 'Sucursal inválida.');
    }

    // Verificar productos pertenecen a la empresa
    const productIds = [...new Set(parsed.items.map((it) => it.productId))];
    const ok = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: tenant.companyId },
      select: { id: true },
    });
    if (ok.length !== productIds.length) {
      throw new ApiError(400, 'Algún producto no pertenece a esta empresa.');
    }

    // Buyer (opcional): validar
    if (parsed.buyerId) {
      const buyer = await prisma.user.findFirst({
        where: { id: parsed.buyerId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!buyer) {
        throw new ApiError(400, 'Comprador inválido.');
      }
    }

    // Snapshot quoteValidityDays desde Company si no viene
    let quoteValidityDays = parsed.quoteValidityDays ?? null;
    if (quoteValidityDays == null) {
      const company = await prisma.company.findUnique({
        where: { id: tenant.companyId },
        select: { quoteValidDays: true },
      });
      quoteValidityDays = company?.quoteValidDays ?? 30;
    }

    const rfq = await prisma.rFQRequest.create({
      data: {
        companyId: tenant.companyId,
        branchId,
        reason: parsed.reason,
        createdById: tenant.userId,
        status: 'DRAFT',
        deliveryPlace: parsed.deliveryPlace ?? branch.name,
        responseDeadline: parsed.responseDeadline ?? null,
        quoteValidityDays,
        buyerId: parsed.buyerId ?? tenant.userId,
        items: {
          create: parsed.items.map((it, idx) => ({
            productId: it.productId,
            variantId: it.variantId ?? null,
            quantity: new Prisma.Decimal(it.quantity),
            specifications: it.specifications ?? null,
            unit: it.unit ?? null,
            observations: it.observations ?? null,
            // Fase 22d-5
            sortOrder: idx,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
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
