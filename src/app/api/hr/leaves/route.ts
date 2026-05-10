import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';

const CreateLeaveSchema = z.object({
  employeeId: z.string().uuid('employeeId inválido'),
  type: z.enum(['VACATION', 'SICK_LEAVE', 'PERSONAL_DAYS', 'OTHER']),
  startDate: z.string().datetime('startDate debe ser ISO datetime').or(z.string().date()),
  endDate: z.string().datetime('endDate debe ser ISO datetime').or(z.string().date()),
  reason: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { employee: { companyId: tenant.companyId } },
      include: { employee: true },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(leaves);
  } catch (error) {
    return handleApiError(error, '/api/hr/leaves GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const data = CreateLeaveSchema.parse(body);

    // Verificar que el empleado pertenece al tenant antes de crear el leave.
    // Sin esto, un usuario con permiso hr:manage de empresa A podría crear
    // leaves para empleados de empresa B si conoce los UUIDs.
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, companyId: tenant.companyId },
      select: { id: true },
    });
    if (!employee) {
      throw new ApiError(404, 'Empleado no encontrado');
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiError(400, 'Fechas inválidas');
    }
    if (end < start) {
      throw new ApiError(400, 'endDate debe ser posterior a startDate');
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        type: data.type,
        startDate: start,
        endDate: end,
        reason: data.reason || null,
        status: 'PENDING'
      },
    });
    return NextResponse.json(leave, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/hr/leaves POST');
  }
}
