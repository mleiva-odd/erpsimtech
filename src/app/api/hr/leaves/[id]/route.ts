import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { ApiError, handleApiError } from '@/lib/api-error';

const PatchSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(500).optional().nullable(),
});

/**
 * GET — detalle de una solicitud de licencia/permiso.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const leave = await prisma.leaveRequest.findFirst({
      where: { id, employee: { companyId: tenant.companyId } },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, position: true },
        },
      },
    });
    if (!leave) throw new ApiError(404, 'Solicitud no encontrada');
    return NextResponse.json(leave);
  } catch (error) {
    return handleApiError(error, '/api/hr/leaves/[id] GET');
  }
}

/**
 * PATCH — aprobar o rechazar una solicitud.
 * Acciones:
 * - APPROVE → status PENDING → APPROVED, registra approvedById = userId
 * - REJECT  → status PENDING → REJECTED
 *
 * Reglas:
 * - Solo se puede transicionar desde PENDING. Una solicitud ya
 *   aprobada/rechazada no se vuelve a tocar; si se necesita revertir
 *   se crea otra.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, reason } = PatchSchema.parse(body);

    const leave = await prisma.leaveRequest.findFirst({
      where: { id, employee: { companyId: tenant.companyId } },
    });
    if (!leave) throw new ApiError(404, 'Solicitud no encontrada');
    if (leave.status !== 'PENDING') {
      throw new ApiError(
        400,
        `La solicitud ya está ${leave.status === 'APPROVED' ? 'aprobada' : 'rechazada'} y no puede modificarse.`,
      );
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: newStatus,
        approvedById: tenant.userId,
        // Si rechazamos y nos pasaron motivo, lo guardamos sobrescribiendo
        // el reason original (es la justificación del rechazo). Si aprobamos
        // y nos pasaron reason, lo respetamos como nota del aprobador.
        reason: reason ?? leave.reason,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: action === 'APPROVE' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      entity: 'LeaveRequest',
      entityId: leave.id,
      details: {
        previousStatus: leave.status,
        newStatus,
        reason: reason || null,
        employeeId: leave.employeeId,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/leaves/[id] PATCH');
  }
}

/**
 * DELETE — solo permitido si la solicitud está PENDING (cancelación
 * por parte del solicitante o admin antes de procesarla).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const leave = await prisma.leaveRequest.findFirst({
      where: { id, employee: { companyId: tenant.companyId } },
      select: { id: true, status: true },
    });
    if (!leave) throw new ApiError(404, 'Solicitud no encontrada');
    if (leave.status !== 'PENDING') {
      throw new ApiError(
        400,
        'Solo se pueden eliminar solicitudes pendientes. Las aprobadas/rechazadas quedan como histórico.',
      );
    }

    await prisma.leaveRequest.delete({ where: { id: leave.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '/api/hr/leaves/[id] DELETE');
  }
}
