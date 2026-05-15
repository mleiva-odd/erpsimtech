import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

/**
 * Fase 22c-4 · POST /api/purchases/rfq/[id]/send
 *
 * Transición DRAFT → SENT. Genera referencia "RFQ-YYYY-NNN" correlativa
 * por año, marca sentAt y dispara sentAt en invitaciones pendientes.
 *
 * Idempotente: si la RFQ ya está en SENT/OPEN, devuelve 200 con el RFQ
 * actual sin reenviar (las invitaciones ya tienen sentAt).
 */
export async function POST(
  _req: NextRequest,
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
    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        items: { select: { id: true } },
        invitations: { select: { id: true, sentAt: true } },
      },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');

    // Idempotencia: ya enviada
    if (rfq.status === 'SENT' || rfq.status === 'OPEN') {
      return NextResponse.json(rfq);
    }
    if (rfq.status !== 'DRAFT') {
      throw new ApiError(400, `No se puede enviar una RFQ en estado ${rfq.status}.`);
    }
    if (rfq.items.length === 0) {
      throw new ApiError(400, 'La RFQ no tiene ítems.');
    }
    if (rfq.invitations.length === 0) {
      throw new ApiError(400, 'La RFQ no tiene invitaciones a proveedores.');
    }

    // Generar reference correlativa "RFQ-YYYY-NNN"
    const year = new Date().getFullYear();
    const prefix = `RFQ-${year}-`;
    const latest = await prisma.rFQRequest.findFirst({
      where: {
        companyId: tenant.companyId,
        reference: { startsWith: prefix },
      },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let nextSeq = 1;
    if (latest?.reference) {
      const suffix = latest.reference.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (Number.isFinite(n) && n > 0) nextSeq = n + 1;
    }
    const reference = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    const now = new Date();
    const pendingInvitationIds = rfq.invitations
      .filter((inv) => inv.sentAt === null)
      .map((inv) => inv.id);

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.rFQRequest.update({
        where: { id: rfq.id },
        data: {
          status: 'SENT',
          reference,
          sentAt: now,
        },
        include: {
          invitations: { select: { id: true, sentAt: true } },
        },
      });

      if (pendingInvitationIds.length > 0) {
        await tx.rFQInvitation.updateMany({
          where: { id: { in: pendingInvitationIds } },
          data: { sentAt: now },
        });
      }

      return next;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'RFQ_SENT',
      entity: 'RFQRequest',
      entityId: rfq.id,
      details: {
        reference,
        invitations: rfq.invitations.length,
        newlySentInvitations: pendingInvitationIds.length,
      },
    });

    // Audit por invitación recién enviada
    for (const invitationId of pendingInvitationIds) {
      await createAuditLog({
        companyId: tenant.companyId,
        userId: tenant.userId,
        action: 'RFQ_INVITATION_SENT',
        entity: 'RFQInvitation',
        entityId: invitationId,
        details: { rfqRequestId: rfq.id },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/send');
  }
}
