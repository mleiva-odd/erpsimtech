import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { vacationDaysAccrued } from '@/lib/payroll/vacaciones';

/**
 * GET /api/hr/employees/[id]/balance
 *
 * Devuelve el saldo de vacaciones del empleado: días devengados al día
 * de hoy, días tomados acumulados, días disponibles. Si no existe la
 * fila `EmployeeBalance`, la crea con saldos en 0 (lazy init).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!employee) throw new ApiError(404, 'Empleado no encontrado');

    let balance = (await prisma.employeeBalance.findUnique({
      where: { employeeId: id },
    })) as { vacationDaysAccrued?: unknown; vacationDaysTaken?: unknown } | null;

    if (!balance) {
      balance = (await prisma.employeeBalance.create({
        data: { employeeId: id },
      })) as { vacationDaysAccrued: unknown; vacationDaysTaken: unknown };
    }

    const computedAccrued = vacationDaysAccrued(
      (employee as { hireDate: Date }).hireDate,
      new Date(),
    );

    return NextResponse.json({
      employeeId: id,
      hireDate: (employee as { hireDate: Date }).hireDate,
      vacationDaysAccrued: Number(balance.vacationDaysAccrued) || 0,
      vacationDaysTaken: Number(balance.vacationDaysTaken) || 0,
      vacationDaysAccruedComputed: computedAccrued,
      vacationDaysAvailable: Math.max(
        0,
        computedAccrued - (Number(balance.vacationDaysTaken) || 0),
      ),
    });
  } catch (error) {
    return handleApiError(error, '/api/hr/employees/[id]/balance GET');
  }
}
