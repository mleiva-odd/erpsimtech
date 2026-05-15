import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

/**
 * Fase 22c-4 · DELETE /api/purchases/rfq/[id]/invitations/[invitationId]
 *
 * En DRAFT: hard-delete de la invitación.
 * En SENT/OPEN/AWARDED: marca declinedAt (soft cancel, ya se notificó al proveedor).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id, invitationId } = await params;

  try {
    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');

    const invitation = await prisma.rFQInvitation.findFirst({
      where: { id: invitationId, rfqRequestId: rfq.id },
      select: { id: true, declinedAt: true },
    });
    if (!invitation) throw new ApiError(404, 'Invitación no encontrada.');

    if (rfq.status === 'DRAFT') {
      await prisma.rFQInvitation.delete({ where: { id: invitation.id } });
      return NextResponse.json({ success: true, deleted: true });
    }

    // En estados no-DRAFT: soft cancel
    if (invitation.declinedAt) {
      return NextResponse.json({ success: true, deleted: false, alreadyDeclined: true });
    }

    const updated = await prisma.rFQInvitation.update({
      where: { id: invitation.id },
      data: { declinedAt: new Date() },
    });

    return NextResponse.json({ success: true, deleted: false, invitation: updated });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/invitations/[invitationId] DELETE');
  }
}
