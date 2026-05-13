import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';

const UpdatePayrollSchema = z.object({
  // status manual sólo permitido para CANCELLED desde DRAFT/APPROVED.
  // Las transiciones APPROVED y PAID tienen endpoints dedicados con efectos.
  status: z.enum(['CANCELLED']).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  periodReference: z.string().trim().max(80).optional().nullable(),
});

export async function GET(
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
      include: {
        items: {
          include: { employee: true },
          orderBy: { employee: { firstName: 'asc' } },
        },
      },
    });
    if (!payroll) throw new ApiError(404, 'Planilla no encontrada');
    return NextResponse.json(payroll);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id] GET');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const data = UpdatePayrollSchema.parse(body);

    const payroll = await prisma.payroll.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!payroll) throw new ApiError(404, 'Planilla no encontrada');

    // State machine: solo DRAFT/APPROVED → CANCELLED.
    if (data.status === 'CANCELLED') {
      if ((payroll as { status: string }).status === 'PAID') {
        throw new ApiError(
          400,
          'Una planilla PAID no puede cancelarse desde aquí (requiere reversa contable).',
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.periodReference !== undefined) {
      updateData.periodReference = data.periodReference || null;
    }

    const updated = await prisma.payroll.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id] PUT');
  }
}
