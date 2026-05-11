import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

const AttendanceSchema = z.object({
  employeeId: z.string().uuid('employeeId inválido'),
  date: z.string().min(1, 'date requerido'),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HOLIDAY']),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const baseDate = new Date(dateStr);
  if (Number.isNaN(baseDate.getTime())) {
    return NextResponse.json({ error: 'date inválido' }, { status: 400 });
  }

  try {
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(23, 59, 59, 999);

    const attendance = await prisma.attendance.findMany({
      where: {
        date: { gte: start, lte: end },
        employee: { companyId: tenant.companyId },
      },
      include: { employee: true },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(attendance);
  } catch (error) {
    return handleApiError(error, '/api/hr/attendance GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const data = AttendanceSchema.parse(body);

    // Defense in depth — empleado debe pertenecer al tenant.
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, companyId: tenant.companyId },
      select: { id: true },
    });
    if (!employee) throw new ApiError(404, 'Empleado no encontrado');

    const date = new Date(data.date);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, 'date inválido');

    const checkIn = data.checkIn ? new Date(data.checkIn) : null;
    const checkOut = data.checkOut ? new Date(data.checkOut) : null;
    if (checkIn && Number.isNaN(checkIn.getTime())) throw new ApiError(400, 'checkIn inválido');
    if (checkOut && Number.isNaN(checkOut.getTime())) throw new ApiError(400, 'checkOut inválido');
    if (checkIn && checkOut && checkOut < checkIn) {
      throw new ApiError(400, 'checkOut debe ser posterior a checkIn');
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await prisma.attendance.findFirst({
      where: {
        employeeId: data.employeeId,
        date: { gte: dayStart, lte: dayEnd },
      },
    });

    if (existing) {
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          checkIn,
          checkOut,
          notes: data.notes ?? existing.notes,
        },
      });
      return NextResponse.json(updated);
    }

    const created = await prisma.attendance.create({
      data: {
        employeeId: data.employeeId,
        date,
        status: data.status,
        checkIn,
        checkOut,
        notes: data.notes || null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/hr/attendance POST');
  }
}
