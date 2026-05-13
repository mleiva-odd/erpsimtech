import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';

/**
 * GET /api/hr/payroll/[id]/report/igss
 *
 * Genera el reporte CSV para el IGSS — formulario IGSS-FORMUL-1117.
 * Columnas (ajustar con contador antes de uso real):
 *   - Número de afiliación IGSS
 *   - NIT
 *   - DPI
 *   - Apellidos
 *   - Nombres
 *   - Días trabajados
 *   - Salario afecto
 *   - Cuota laboral (4.83%)
 *   - Cuota patronal (10.67%)
 *   - IRTRA (1%)
 *   - INTECAP (1%)
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
      name: string;
      items: Array<{
        daysWorked?: unknown;
        baseSalary: unknown;
        overtimeRegularAmount?: unknown;
        overtimeNightAmount?: unknown;
        overtimeHolidayAmount?: unknown;
        seventhDayAmount?: unknown;
        commissions?: unknown;
        igssLaboral?: unknown;
        igss?: unknown;
        igssPatronal?: unknown;
        irtra?: unknown;
        intecap?: unknown;
        employee: {
          firstName: string;
          lastName: string;
          documentId?: string | null;
          nit?: string | null;
          igssNumber?: string | null;
        };
      }>;
    } | null;

    if (!payroll) throw new ApiError(404, 'Planilla no encontrada');

    const n = (v: unknown) => Number(v ?? 0) || 0;
    const fmt = (v: number) => v.toFixed(2);

    const header = [
      'NoAfiliacionIGSS',
      'NIT',
      'DPI',
      'Apellidos',
      'Nombres',
      'DiasTrabajados',
      'SalarioAfecto',
      'CuotaLaboral',
      'CuotaPatronal',
      'IRTRA',
      'INTECAP',
    ].join(',');

    const rows = payroll.items.map((it) => {
      const salarioAfecto =
        n(it.baseSalary) +
        n(it.overtimeRegularAmount) +
        n(it.overtimeNightAmount) +
        n(it.overtimeHolidayAmount) +
        n(it.seventhDayAmount) +
        n(it.commissions);
      return [
        csvEscape(it.employee.igssNumber),
        csvEscape(it.employee.nit),
        csvEscape(it.employee.documentId),
        csvEscape(it.employee.lastName),
        csvEscape(it.employee.firstName),
        csvEscape(n(it.daysWorked)),
        csvEscape(fmt(salarioAfecto)),
        csvEscape(fmt(n(it.igssLaboral ?? it.igss))),
        csvEscape(fmt(n(it.igssPatronal))),
        csvEscape(fmt(n(it.irtra))),
        csvEscape(fmt(n(it.intecap))),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="igss-${id.slice(0, 8)}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id]/report/igss GET');
  }
}
