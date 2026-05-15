import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const CancelSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

/**
 * Fase 22c-4 · POST /api/purchases/rfq/[id]/cancel
 *
 * Cancela una RFQ que no esté en estado terminal (AWARDED, CLOSED, CANCELLED).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:approve',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CancelSchema.parse(body);

    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');

    if (
      rfq.status === 'AWARDED' ||
      rfq.status === 'CLOSED' ||
      rfq.status === 'CANCELLED'
    ) {
      throw new ApiError(
        400,
        `No se puede cancelar una RFQ en estado ${rfq.status}.`,
      );
    }

    const updated = await prisma.rFQRequest.update({
      where: { id: rfq.id },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_CANCELLED',
      entity: 'RFQRequest',
      entityId: rfq.id,
      details: { reason: parsed.reason ?? null, previousStatus: rfq.status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/cancel');
  }
}
