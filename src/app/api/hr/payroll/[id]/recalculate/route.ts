import { NextRequest, NextResponse } from 'next/server';
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

/**
 * POST /api/hr/payroll/[id]/recalculate
 *
 * Re-genera los PayrollItems aplicando los helpers de cálculo otra vez.
 * Sólo permitido en estado DRAFT — una vez aprobada/pagada no se toca.
 *
 * Útil cuando se actualizaron datos del empleado (sueldo base, jornada,
 * etc.) después de generar la planilla y antes de aprobarla.
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
    if (status !== 'DRAFT') {
      throw new ApiError(
        400,
        `Sólo planillas en DRAFT pueden recalcularse (estado actual: ${status}).`,
      );
    }

    const payrollType = (payroll as { payrollType?: string }).payrollType ?? 'REGULAR';

    const employees = await prisma.employee.findMany({
      where: { companyId: tenant.companyId, active: true },
    });

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

    const updated = await prisma.$transaction(async (tx) => {
      // Borrar items existentes y crear de nuevo (más simple que update
      // diff). El payrollId tiene onDelete: Cascade, no necesitamos limpiar
      // hijos.
      await tx.payrollItem.deleteMany({ where: { payrollId: id } });

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
          payrollType: payrollType as PayrollType,
          daysWorked: 30,
          loanInstallment: loanByEmp.get(emp.id) ?? 0,
        });

        await tx.payrollItem.create({
          data: {
            payrollId: id,
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
        where: { id },
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
      action: 'PAYROLL_RECALCULATED',
      entity: 'Payroll',
      entityId: id,
      details: { employees: employees.length },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id]/recalculate POST');
  }
}
