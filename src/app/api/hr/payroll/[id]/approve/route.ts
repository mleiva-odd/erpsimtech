import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

/**
 * POST /api/hr/payroll/[id]/approve
 *
 * Transición: DRAFT → APPROVED. Sólo permitido si existen items y los
 * totales cuadran (defensa contra UI corrupta). No genera asiento contable
 * aún — eso ocurre en `/pay`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const payroll = await prisma.payroll.findFirst({
      where: { id, companyId: tenant.companyId },
      include: { items: true },
    });
    if (!payroll) throw new ApiError(404, 'Planilla no encontrada');

    const status = (payroll as { status: string }).status;
    if (status === 'APPROVED' || status === 'PAID') {
      return NextResponse.json(payroll);
    }
    if (status !== 'DRAFT') {
      throw new ApiError(
        400,
        `No se puede aprobar una planilla en estado ${status}.`,
      );
    }
    if (!(payroll as { items: unknown[] }).items.length) {
      throw new ApiError(400, 'Planilla sin items — no se puede aprobar.');
    }

    const updated = await prisma.payroll.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: tenant.userId,
      } as never,
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PAYROLL_APPROVED',
      entity: 'Payroll',
      entityId: id,
      details: { previousStatus: status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id]/approve POST');
  }
}
