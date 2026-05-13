import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { calculatePayrollItem } from '@/lib/payroll/calculate';
import type {
  PayrollType,
  PayrollFrequency,
  Shift,
} from '@/lib/payroll/types';

const CreatePayrollSchema = z.object({
  name: z.string().trim().min(1).max(200),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  payrollType: z
    .enum(['REGULAR', 'BONO14', 'AGUINALDO', 'INDEMNIZACION', 'EXTRAORDINARIA'])
    .default('REGULAR'),
  periodReference: z.string().trim().max(80).optional().nullable(),
});

export async function GET(req: NextRequest) {
  void req;
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const payrolls = await prisma.payroll.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    return NextResponse.json(payrolls);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const data = CreatePayrollSchema.parse(body);

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ApiError(400, 'Fechas inválidas');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new ApiError(400, 'endDate debe ser posterior a startDate');
    }

    const employees = await prisma.employee.findMany({
      where: { companyId: tenant.companyId, active: true },
    });
    if (employees.length === 0) {
      throw new ApiError(400, 'No hay empleados activos para procesar');
    }

    // Préstamos ACTIVOS por empleado.
    const loans = await prisma.employeeLoan.findMany({
      where: { companyId: tenant.companyId, status: 'ACTIVE' },
    });
    const loanByEmp = new Map<string, number>();
    for (const l of loans as Array<{ employeeId: string; monthlyDeduction: unknown; balance: unknown }>) {
      const installment = Math.min(
        Number(l.monthlyDeduction) || 0,
        Number(l.balance) || 0,
      );
      loanByEmp.set(
        l.employeeId,
        (loanByEmp.get(l.employeeId) ?? 0) + installment,
      );
    }

    const payroll = await prisma.$transaction(async (tx) => {
      const newPayroll = await tx.payroll.create({
        data: {
          companyId: tenant.companyId,
          name: data.name,
          startDate,
          endDate,
          status: 'DRAFT',
          payrollType: data.payrollType as PayrollType,
          periodReference: data.periodReference || null,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
        } as never,
      });

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      for (const emp of employees as Array<{
        id: string;
        baseSalary: unknown;
        bonusIncentive?: unknown;
        payrollFrequency?: PayrollFrequency;
        shift?: Shift;
        igssAffiliated?: boolean;
        hireDate: Date;
      }>) {
        const calc = calculatePayrollItem({
          baseSalary: Number(emp.baseSalary),
          bonusIncentive: Number(emp.bonusIncentive ?? 250),
          payrollFrequency: (emp.payrollFrequency ?? 'MONTHLY') as PayrollFrequency,
          shift: (emp.shift ?? 'DIURNA') as Shift,
          igssAffiliated: emp.igssAffiliated ?? true,
          hireDate: emp.hireDate,
          payrollType: data.payrollType as PayrollType,
          daysWorked: 30,
          loanInstallment: loanByEmp.get(emp.id) ?? 0,
        });

        await tx.payrollItem.create({
          data: {
            payrollId: (newPayroll as { id: string }).id,
            employeeId: emp.id,
            baseSalary: calc.baseSalary,
            bonusIncentive: calc.bonusIncentive,
            daysWorked: calc.daysWorked,
            overtimeRegularHours: calc.overtimeRegularHours,
            overtimeRegularAmount: calc.overtimeRegularAmount,
            overtimeNightHours: calc.overtimeNightHours,
            overtimeNightAmount: calc.overtimeNightAmount,
            overtimeHolidayHours: calc.overtimeHolidayHours,
            overtimeHolidayAmount: calc.overtimeHolidayAmount,
            seventhDayAmount: calc.seventhDayAmount,
            commissions: calc.commissions,
            otherBonuses: calc.otherBonuses,
            totalGross: calc.totalGross,
            igssLaboral: calc.igssLaboral,
            // Mantener `igss` legacy sincronizado con igssLaboral para UI vieja.
            igss: calc.igssLaboral,
            isr: calc.isr,
            loanDeduction: calc.loanDeduction,
            otherDeductions: calc.otherDeductions,
            totalDeductions: calc.totalDeductions,
            netSalary: calc.netSalary,
            bono14Provision: calc.bono14Provision,
            aguinaldoProvision: calc.aguinaldoProvision,
            indemnizacionProvision: calc.indemnizacionProvision,
            vacacionesProvision: calc.vacacionesProvision,
            igssPatronal: calc.igssPatronal,
            irtra: calc.irtra,
            intecap: calc.intecap,
            totalCostoPatronal: calc.totalCostoPatronal,
          } as never,
        });

        totalGross += calc.totalGross;
        totalDeductions += calc.totalDeductions;
        totalNet += calc.netSalary;
      }

      return tx.payroll.update({
        where: { id: (newPayroll as { id: string }).id },
        data: {
          totalGross: Math.round(totalGross * 100) / 100,
          totalDeductions: Math.round(totalDeductions * 100) / 100,
          totalNet: Math.round(totalNet * 100) / 100,
        },
      });
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PAYROLL_CREATED',
      entity: 'Payroll',
      entityId: (payroll as { id: string }).id,
      details: {
        payrollType: data.payrollType,
        startDate: data.startDate,
        endDate: data.endDate,
        employees: employees.length,
      },
    });

    return NextResponse.json(payroll, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll POST');
  }
}
