import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  _req: NextRequest,
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
    const pr = await prisma.purchaseRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true },
    });
    if (!pr) throw new ApiError(404, 'PR no encontrada.');
    if (pr.status !== 'PENDING') {
      throw new ApiError(
        400,
        `Solo se aprueban PRs en estado PENDING (actual: ${pr.status}).`,
      );
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id, companyId: tenant.companyId },
      data: {
        status: 'APPROVED',
        approvedById: tenant.userId,
        approvedAt: new Date(),
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_REQUEST_APPROVED',
      entity: 'PurchaseRequest',
      entityId: pr.id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/purchases/requests/[id]/approve');
  }
}
