import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

/**
 * Fase 22c-4 · Detalle y edición de RFQ.
 *
 * GET → vista completa con items, invitaciones, cotizaciones y POs generadas.
 * PUT → editar campos editables. Solo permitido en DRAFT.
 */

const RFQItemPutSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  specifications: z.string().trim().max(500).optional().nullable(),
  unit: z.string().trim().max(40).optional().nullable(),
  observations: z.string().trim().max(500).optional().nullable(),
});

const UpdateRFQSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  branchId: z.string().uuid().optional().nullable(),
  deliveryPlace: z.string().trim().max(500).optional().nullable(),
  responseDeadline: z.coerce.date().optional().nullable(),
  quoteValidityDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  buyerId: z.string().uuid().optional().nullable(),
  items: z.array(RFQItemPutSchema).min(1).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:create',
    'purchases:approve',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        buyer: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              select: { id: true, name: true, sku: true, unitOfMeasure: true },
            },
            variant: { select: { id: true, name: true, sku: true } },
            awardedSupplier: { select: { id: true, name: true } },
            awardedQuoteItem: {
              select: {
                id: true,
                unitPrice: true,
                deliveryDays: true,
                quantity: true,
                rfqQuoteId: true,
              },
            },
          },
        },
        invitations: {
          include: {
            supplier: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        quotes: {
          include: {
            supplier: { select: { id: true, name: true, email: true } },
            quotedBy: { select: { id: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
                variant: { select: { id: true, name: true, sku: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        awardedQuote: {
          select: {
            id: true,
            totalAmount: true,
            supplier: { select: { id: true, name: true } },
          },
        },
        generatedPurchaseOrders: {
          select: {
            id: true,
            reference: true,
            total: true,
            status: true,
            createdAt: true,
            supplier: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');

    return NextResponse.json(rfq);
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id] GET');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateRFQSchema.parse(body);

    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true, branchId: true },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');
    if (rfq.status !== 'DRAFT') {
      throw new ApiError(400, 'No se puede editar después de enviar.');
    }

    // Validar branchId si viene
    let nextBranchId = rfq.branchId;
    if (parsed.branchId && parsed.branchId !== rfq.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: parsed.branchId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!branch) throw new ApiError(400, 'Sucursal inválida.');
      nextBranchId = parsed.branchId;
    }

    // Validar buyerId si viene
    if (parsed.buyerId) {
      const buyer = await prisma.user.findFirst({
        where: { id: parsed.buyerId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!buyer) throw new ApiError(400, 'Comprador inválido.');
    }

    // Validar productos si viene items
    if (parsed.items) {
      const productIds = [...new Set(parsed.items.map((it) => it.productId))];
      const ok = await prisma.product.findMany({
        where: { id: { in: productIds }, companyId: tenant.companyId },
        select: { id: true },
      });
      if (ok.length !== productIds.length) {
        throw new ApiError(400, 'Algún producto no pertenece a esta empresa.');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Replace items completo si vienen
      if (parsed.items) {
        await tx.rFQRequestItem.deleteMany({ where: { rfqRequestId: id } });
      }

      const updateData: Prisma.RFQRequestUpdateInput = {
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        ...(parsed.branchId
          ? { branch: { connect: { id: nextBranchId } } }
          : {}),
        ...(parsed.deliveryPlace !== undefined
          ? { deliveryPlace: parsed.deliveryPlace }
          : {}),
        ...(parsed.responseDeadline !== undefined
          ? { responseDeadline: parsed.responseDeadline }
          : {}),
        ...(parsed.quoteValidityDays !== undefined
          ? { quoteValidityDays: parsed.quoteValidityDays }
          : {}),
        ...(parsed.buyerId !== undefined
          ? parsed.buyerId
            ? { buyer: { connect: { id: parsed.buyerId } } }
            : { buyer: { disconnect: true } }
          : {}),
        ...(parsed.items
          ? {
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
            }
          : {}),
      };

      return tx.rFQRequest.update({
        where: { id },
        data: updateData,
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id] PUT');
  }
}
