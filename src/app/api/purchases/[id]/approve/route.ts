import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { canTransition } from '@/lib/purchases';

/**
 * Aprueba una PO. Transición: DRAFT|PENDING_APPROVAL → APPROVED.
 * Requiere permiso `purchases:approve`.
 */
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
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true },
    });
    if (!po) throw new ApiError(404, 'PO no encontrada.');
    if (!canTransition(po.status, 'APPROVED')) {
      throw new ApiError(
        400,
        `No se puede aprobar una PO en estado ${po.status}.`,
      );
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id, companyId: tenant.companyId },
      data: {
        status: 'APPROVED',
        approvedById: tenant.userId,
        approvedAt: new Date(),
      } as never,
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_APPROVED',
      entity: 'PurchaseOrder',
      entityId: po.id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/purchases/[id]/approve');
  }
}
