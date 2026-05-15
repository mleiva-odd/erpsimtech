import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const CreateInvitationSchema = z
  .object({
    supplierId: z.string().uuid().optional().nullable(),
    externalEmail: z.string().trim().email().optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine((d) => Boolean(d.supplierId) || Boolean(d.externalEmail), {
    message: 'Debe especificar supplierId o externalEmail.',
  });

/**
 * Fase 22c-4 · POST /api/purchases/rfq/[id]/invitations
 *
 * Agrega una invitación a la RFQ. Solo permitido en DRAFT o SENT/OPEN.
 * Si la RFQ ya está SENT/OPEN, marca sentAt = now() inmediatamente.
 */
export async function POST(
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
    const parsed = CreateInvitationSchema.parse(body);

    const rfq = await prisma.rFQRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, status: true },
    });
    if (!rfq) throw new ApiError(404, 'RFQ no encontrada.');

    if (rfq.status !== 'DRAFT' && rfq.status !== 'SENT' && rfq.status !== 'OPEN') {
      throw new ApiError(
        400,
        `No se pueden agregar invitaciones en estado ${rfq.status}.`,
      );
    }

    if (parsed.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: parsed.supplierId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!supplier) throw new ApiError(400, 'Proveedor inválido.');

      // Idempotencia: si ya existe invitación con ese supplier, 409
      const existing = await prisma.rFQInvitation.findFirst({
        where: { rfqRequestId: rfq.id, supplierId: parsed.supplierId },
        select: { id: true },
      });
      if (existing) {
        throw new ApiError(409, 'Ya existe una invitación para ese proveedor.');
      }
    }

    const shouldMarkSent = rfq.status === 'SENT' || rfq.status === 'OPEN';
    const now = new Date();

    const invitation = await prisma.rFQInvitation.create({
      data: {
        rfqRequestId: rfq.id,
        supplierId: parsed.supplierId ?? null,
        externalEmail: parsed.externalEmail ?? null,
        notes: parsed.notes ?? null,
        sentAt: shouldMarkSent ? now : null,
      },
    });

    if (shouldMarkSent) {
      await createAuditLog({
        companyId: tenant.companyId,
        userId: tenant.userId,
        action: 'RFQ_INVITATION_SENT',
        entity: 'RFQInvitation',
        entityId: invitation.id,
        details: { rfqRequestId: rfq.id },
      });
    }

    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/rfq/[id]/invitations POST');
  }
}
