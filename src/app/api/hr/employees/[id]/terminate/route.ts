import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { calculateIndemnizacion } from '@/lib/payroll/indemnizacion';

const TerminateSchema = z.object({
  terminationDate: z.string().min(1),
  /** Si se quiere persistir como Payroll INDEMNIZACION (asiento contable). */
  createPayroll: z.boolean().default(true),
  /** Salario promedio últimos 6 meses (si no se pasa, usar baseSalary actual). */
  averageSalary: z.coerce.number().nonnegative().optional(),
  /** Días de vacaciones ya tomados. Si no se pasa, intentar leer EmployeeBalance. */
  vacationDaysTaken: z.coerce.number().nonnegative().optional(),
  reason: z.string().trim().max(500).optional().nullable(),
});

/**
 * POST /api/hr/employees/[id]/terminate
 *
 * Marca al empleado como terminado (active=false, terminationDate=…),
 * calcula la liquidación legal completa (indemnización + Bono14 prop. +
 * Aguinaldo prop. + vacaciones no gozadas) y opcionalmente persiste un
 * Payroll en estado DRAFT con un único PayrollItem.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const data = TerminateSchema.parse(body);

    const terminationDate = new Date(data.terminationDate);
    if (Number.isNaN(terminationDate.getTime())) {
      throw new ApiError(400, 'terminationDate inválido');
    }

    const employee = (await prisma.employee.findFirst({
      where: { id, companyId: tenant.companyId },
    })) as {
      id: string;
      baseSalary: unknown;
      bonusIncentive?: unknown;
      hireDate: Date;
      terminationDate?: Date | null;
      active?: boolean;
      firstName: string;
      lastName: string;
    } | null;
    if (!employee) throw new ApiError(404, 'Empleado no encontrado');

    if (terminationDate.getTime() <= employee.hireDate.getTime()) {
      throw new ApiError(400, 'terminationDate debe ser posterior a hireDate');
    }

    let vacationDaysTaken = data.vacationDaysTaken;
    if (vacationDaysTaken == null) {
      const bal = (await prisma.employeeBalance.findUnique({
        where: { employeeId: id },
      })) as { vacationDaysTaken: unknown } | null;
      vacationDaysTaken = Number(bal?.vacationDaysTaken ?? 0);
    }

    const baseSalary = Number(employee.baseSalary) || 0;
    const averageSalary = data.averageSalary ?? baseSalary;

    const liq = calculateIndemnizacion({
      averageSalary,
      baseSalary,
      bonusIncentive: Number(employee.bonusIncentive ?? 0),
      hireDate: employee.hireDate,
      terminationDate,
      vacationDaysTaken,
    });

    const outcome = await prisma.$transaction(async (tx) => {
      // 1. Marcar empleado como terminado.
      await tx.employee.update({
        where: { id },
        data: { active: false, terminationDate },
      });

      let payrollId: string | null = null;
      if (data.createPayroll) {
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const totalGross = round2(liq.total);

        const payroll = (await tx.payroll.create({
          data: {
            companyId: tenant.companyId,
            name: `Liquidación · ${employee.firstName} ${employee.lastName}`,
            startDate: employee.hireDate,
            endDate: terminationDate,
            status: 'DRAFT',
            payrollType: 'INDEMNIZACION',
            periodReference: `EMP-${id.slice(0, 8)}-${terminationDate.toISOString().slice(0, 7)}`,
            totalGross,
            totalDeductions: 0,
            totalNet: totalGross,
          } as never,
        })) as { id: string };
        payrollId = payroll.id;

        await tx.payrollItem.create({
          data: {
            payrollId: payroll.id,
            employeeId: id,
            baseSalary: baseSalary,
            bonusIncentive: 0,
            daysWorked: 30,
            totalGross,
            igssLaboral: 0,
            igss: 0,
            isr: 0,
            loanDeduction: 0,
            otherDeductions: 0,
            totalDeductions: 0,
            netSalary: totalGross,
            notes:
              `Indemnización Q${liq.indemnizacion.toFixed(2)} + ` +
              `Bono14 prop Q${liq.bono14Proporcional.toFixed(2)} + ` +
              `Aguinaldo prop Q${liq.aguinaldoProporcional.toFixed(2)} + ` +
              `Vacaciones no gozadas Q${liq.vacacionesNoGozadas.toFixed(2)}`,
          } as never,
        });
      }

      return { payrollId };
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'EMPLOYEE_TERMINATED',
      entity: 'Employee',
      entityId: id,
      details: {
        terminationDate: data.terminationDate,
        liquidacion: {
          indemnizacion: liq.indemnizacion,
          bono14Proporcional: liq.bono14Proporcional,
          aguinaldoProporcional: liq.aguinaldoProporcional,
          vacacionesNoGozadas: liq.vacacionesNoGozadas,
          total: liq.total,
          yearsOfService: liq.yearsOfService,
        },
        payrollId: outcome.payrollId,
        reason: data.reason || null,
      },
    });

    return NextResponse.json({ employeeId: id, liquidacion: liq, ...outcome });
  } catch (error) {
    return handleApiError(error, '/api/hr/employees/[id]/terminate POST');
  }
}
