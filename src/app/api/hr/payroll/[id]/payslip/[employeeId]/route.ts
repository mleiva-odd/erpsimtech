import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { generatePayslipPdf } from '@/lib/payroll/payslip';

/**
 * GET /api/hr/payroll/[id]/payslip/[employeeId]
 *
 * Devuelve la boleta de pago PDF del empleado en la planilla indicada.
 * Content-Type: application/pdf.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; employeeId: string }> },
) {
  void req;
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id, employeeId } = await params;
  try {
    const payroll = (await prisma.payroll.findFirst({
      where: { id, companyId: tenant.companyId },
      include: { items: { where: { employeeId }, include: { employee: true } } },
    })) as {
      id: string;
      name: string;
      startDate: Date;
      endDate: Date;
      payrollType: string;
      items: Array<{
        baseSalary: unknown;
        bonusIncentive: unknown;
        overtimeRegularAmount?: unknown;
        overtimeNightAmount?: unknown;
        overtimeHolidayAmount?: unknown;
        seventhDayAmount?: unknown;
        commissions?: unknown;
        otherBonuses?: unknown;
        totalGross: unknown;
        igssLaboral?: unknown;
        igss?: unknown;
        isr: unknown;
        loanDeduction?: unknown;
        otherDeductions: unknown;
        totalDeductions?: unknown;
        netSalary: unknown;
        employee: {
          firstName: string;
          lastName: string;
          documentId?: string | null;
          nit?: string | null;
          position?: string | null;
          hireDate: Date;
        };
      }>;
    } | null;

    if (!payroll) throw new ApiError(404, 'Planilla no encontrada');
    const item = payroll.items[0];
    if (!item) throw new ApiError(404, 'Empleado no figura en esta planilla');

    const company = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: { name: true, nit: true },
    })) as { name: string; nit: string | null } | null;
    if (!company) throw new ApiError(500, 'Empresa no encontrada');

    const n = (v: unknown) => Number(v ?? 0) || 0;

    const pdf = generatePayslipPdf({
      company: { name: company.name, nit: company.nit },
      payroll: {
        name: payroll.name,
        startDate: payroll.startDate,
        endDate: payroll.endDate,
        payrollType: payroll.payrollType,
      },
      employee: {
        firstName: item.employee.firstName,
        lastName: item.employee.lastName,
        documentId: item.employee.documentId ?? null,
        nit: item.employee.nit ?? null,
        position: item.employee.position ?? null,
        hireDate: item.employee.hireDate,
      },
      item: {
        baseSalary: n(item.baseSalary),
        bonusIncentive: n(item.bonusIncentive),
        overtimeRegularAmount: n(item.overtimeRegularAmount),
        overtimeNightAmount: n(item.overtimeNightAmount),
        overtimeHolidayAmount: n(item.overtimeHolidayAmount),
        seventhDayAmount: n(item.seventhDayAmount),
        commissions: n(item.commissions),
        otherBonuses: n(item.otherBonuses),
        totalGross: n(item.totalGross),
        igssLaboral: n(item.igssLaboral ?? item.igss),
        isr: n(item.isr),
        loanDeduction: n(item.loanDeduction),
        otherDeductions: n(item.otherDeductions),
        totalDeductions: n(item.totalDeductions),
        netSalary: n(item.netSalary),
      },
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="boleta-${item.employee.firstName}-${item.employee.lastName}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id]/payslip/[employeeId] GET');
  }
}
