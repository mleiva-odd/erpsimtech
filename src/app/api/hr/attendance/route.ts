import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const date = new Date(dateStr);

  try {
    const attendance = await prisma.attendance.findMany({
      where: {
        date: {
          gte: new Date(date.setHours(0,0,0,0)),
          lte: new Date(date.setHours(23,59,59,999))
        },
        employee: { companyId: tenant.companyId }
      },
      include: { employee: true }
    });
    return NextResponse.json(attendance);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;

  try {
    const { employeeId, date, status, checkIn, checkOut } = await req.json();

    const existing = await prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: new Date(new Date(date).setHours(0,0,0,0)),
          lte: new Date(new Date(date).setHours(23,59,59,999))
        }
      }
    });

    if (existing) {
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: { status, checkIn: checkIn ? new Date(checkIn) : null, checkOut: checkOut ? new Date(checkOut) : null }
      });
      return NextResponse.json(updated);
    }

    const created = await prisma.attendance.create({
      data: {
        employeeId,
        date: new Date(date),
        status,
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al registrar asistencia' }, { status: 500 });
  }
}
