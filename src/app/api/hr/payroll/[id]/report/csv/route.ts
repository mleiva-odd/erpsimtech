import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';

/**
 * GET /api/hr/payroll/[id]/report/csv
 *
 * Exporta la planilla completa como CSV (un row por PayrollItem).
 * Incluye TODAS las columnas para auditoría/análisis externo (Excel).
 */
function csvEscape(s: string | number | null | undefined): string {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
    const payroll = (await prisma.payroll.findFirst({
      where: { id, companyId: tenant.companyId },
      include: { items: { include: { employee: true } } },
    })) as {
      id: string;
      items: Array<Record<string, unknown> & {
        employee: { firstName: string; lastName: string; documentId?: string | null; nit?: string | null };
      }>;
    } | null;

    if (!payroll) throw new ApiError(404, 'Planilla no encontrada');

    const n = (v: unknown) => Number(v ?? 0) || 0;
    const fmt = (v: number) => v.toFixed(2);

    const cols = [
      'Apellidos',
      'Nombres',
      'DPI',
      'NIT',
      'DiasTrabajados',
      'SueldoBase',
      'BonificacionIncentivo',
      'OvertimeRegular',
      'OvertimeNocturnas',
      'OvertimeFeriado',
      'SeptimoDia',
      'Comisiones',
      'OtrosBonos',
      'TotalBruto',
      'IGSSLaboral',
      'ISR',
      'Prestamo',
      'OtrasDeducciones',
      'TotalDeducciones',
      'Neto',
      'ProvBono14',
      'ProvAguinaldo',
      'ProvIndemnizacion',
      'ProvVacaciones',
      'IGSSPatronal',
      'IRTRA',
      'INTECAP',
      'TotalCostoPatronal',
    ];

    const header = cols.join(',');
    const rows = payroll.items.map((it) => {
      return [
        csvEscape(it.employee.lastName),
        csvEscape(it.employee.firstName),
        csvEscape(it.employee.documentId),
        csvEscape(it.employee.nit),
        csvEscape(n(it.daysWorked)),
        csvEscape(fmt(n(it.baseSalary))),
        csvEscape(fmt(n(it.bonusIncentive))),
        csvEscape(fmt(n(it.overtimeRegularAmount))),
        csvEscape(fmt(n(it.overtimeNightAmount))),
        csvEscape(fmt(n(it.overtimeHolidayAmount))),
        csvEscape(fmt(n(it.seventhDayAmount))),
        csvEscape(fmt(n(it.commissions))),
        csvEscape(fmt(n(it.otherBonuses))),
        csvEscape(fmt(n(it.totalGross))),
        csvEscape(fmt(n(it.igssLaboral ?? it.igss))),
        csvEscape(fmt(n(it.isr))),
        csvEscape(fmt(n(it.loanDeduction))),
        csvEscape(fmt(n(it.otherDeductions))),
        csvEscape(fmt(n(it.totalDeductions))),
        csvEscape(fmt(n(it.netSalary))),
        csvEscape(fmt(n(it.bono14Provision))),
        csvEscape(fmt(n(it.aguinaldoProvision))),
        csvEscape(fmt(n(it.indemnizacionProvision))),
        csvEscape(fmt(n(it.vacacionesProvision))),
        csvEscape(fmt(n(it.igssPatronal))),
        csvEscape(fmt(n(it.irtra))),
        csvEscape(fmt(n(it.intecap))),
        csvEscape(fmt(n(it.totalCostoPatronal))),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="planilla-${id.slice(0, 8)}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id]/report/csv GET');
  }
}
