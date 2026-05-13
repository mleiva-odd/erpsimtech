import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const RejectSchema = z.object({
  rejectionReason: z.string().trim().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:approve',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { rejectionReason } = RejectSchema.parse(body);

    const pr = await prisma.purchaseRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true },
    });
    if (!pr) throw new ApiError(404, 'PR no encontrada.');
    if (pr.status !== 'PENDING') {
      throw new ApiError(
        400,
        `Solo se rechazan PRs en estado PENDING (actual: ${pr.status}).`,
      );
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id, companyId: tenant.companyId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason,
        approvedById: tenant.userId, // quien rechazó
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_REQUEST_REJECTED',
      entity: 'PurchaseRequest',
      entityId: pr.id,
      details: { rejectionReason },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/purchases/requests/[id]/reject');
  }
}
