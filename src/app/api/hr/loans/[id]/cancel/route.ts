import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

/**
 * PATCH /api/hr/loans/[id]/cancel
 *
 * Cancela un préstamo ACTIVO. Si tenía balance pendiente, queda registrado
 * en `notes`/`details` que se condonó. NO genera asiento contable de
 * condonación — eso lo hace el contador manualmente si se requiere.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const loan = await prisma.employeeLoan.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!loan) throw new ApiError(404, 'Préstamo no encontrado');

    const status = (loan as { status: string }).status;
    if (status !== 'ACTIVE') {
      throw new ApiError(400, `No se puede cancelar un préstamo en estado ${status}.`);
    }

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: tenant.userId,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'EMP_LOAN_CANCELLED',
      entity: 'EmployeeLoan',
      entityId: id,
      details: { previousBalance: Number((loan as { balance: unknown }).balance) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/loans/[id]/cancel PATCH');
  }
}
