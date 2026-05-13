import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const UpdateSchema = z.object({
  otherBonuses: z.coerce.number().nonnegative().optional(),
  commissions: z.coerce.number().nonnegative().optional(),
  otherDeductions: z.coerce.number().nonnegative().optional(),
  isr: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * PUT /api/hr/payroll-items/[id]
 *
 * Edita campos editables manualmente de un PayrollItem. RECALCULA
 * `totalGross`, `totalDeductions` y `netSalary` server-side a partir
 * de los campos snapshot (NUNCA confía en el cliente).
 *
 * Sólo permitido cuando la planilla padre está en DRAFT.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const data = UpdateSchema.parse(body);

    const existing = await prisma.payrollItem.findUnique({
      where: { id },
      include: { payroll: { select: { companyId: true, status: true } } },
    });
    if (!existing || (existing as { payroll: { companyId: string } }).payroll.companyId !== tenant.companyId) {
      throw new ApiError(404, 'No encontrado');
    }
    const status = (existing as { payroll: { status: string } }).payroll.status;
    if (status !== 'DRAFT') {
      throw new ApiError(400, `No se pueden editar items en planilla ${status}.`);
    }

    const updatedItem = await prisma.$transaction(async (tx) => {
      type ItemSnapshot = {
        baseSalary: unknown;
        bonusIncentive: unknown;
        overtimeRegularAmount?: unknown;
        overtimeNightAmount?: unknown;
        overtimeHolidayAmount?: unknown;
        seventhDayAmount?: unknown;
        commissions?: unknown;
        otherBonuses?: unknown;
        igssLaboral?: unknown;
        igss?: unknown;
        isr?: unknown;
        loanDeduction?: unknown;
        otherDeductions?: unknown;
      };
      const item = existing as unknown as ItemSnapshot & { id: string; payrollId: string };

      const otherBonuses =
        data.otherBonuses ?? Number(item.otherBonuses ?? 0);
      const commissions = data.commissions ?? Number(item.commissions ?? 0);
      const otherDeductions =
        data.otherDeductions ?? Number(item.otherDeductions ?? 0);
      const isr = data.isr ?? Number(item.isr ?? 0);

      const base = Number(item.baseSalary ?? 0);
      const bonus = Number(item.bonusIncentive ?? 0);
      const otReg = Number(item.overtimeRegularAmount ?? 0);
      const otNgt = Number(item.overtimeNightAmount ?? 0);
      const otHol = Number(item.overtimeHolidayAmount ?? 0);
      const seventh = Number(item.seventhDayAmount ?? 0);
      const igss = Number(item.igssLaboral ?? item.igss ?? 0);
      const loan = Number(item.loanDeduction ?? 0);

      const totalGross = round2(
        base + bonus + otReg + otNgt + otHol + seventh + commissions + otherBonuses,
      );
      const totalDeductions = round2(igss + isr + loan + otherDeductions);
      const netSalary = round2(totalGross - totalDeductions);

      const updated = await tx.payrollItem.update({
        where: { id },
        data: {
          otherBonuses,
          commissions,
          otherDeductions,
          isr,
          notes: data.notes === undefined ? undefined : data.notes,
          totalGross,
          totalDeductions,
          netSalary,
        } as never,
      });

      // Recalcular totales del Payroll padre desde TODOS los items.
      const allItems = (await tx.payrollItem.findMany({
        where: { payrollId: (item as { payrollId: string }).payrollId },
      })) as unknown as Array<{
        totalGross: unknown;
        totalDeductions: unknown;
        netSalary: unknown;
      }>;
      let tg = 0;
      let td = 0;
      let tn = 0;
      for (const it of allItems) {
        tg += Number(it.totalGross) || 0;
        td += Number(it.totalDeductions) || 0;
        tn += Number(it.netSalary) || 0;
      }
      await tx.payroll.update({
        where: { id: (item as { payrollId: string }).payrollId },
        data: {
          totalGross: round2(tg),
          totalDeductions: round2(td),
          totalNet: round2(tn),
        },
      });

      return updated;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PAYROLL_ITEM_UPDATED',
      entity: 'PayrollItem',
      entityId: id,
      details: { fields: Object.keys(data) },
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll-items/[id] PUT');
  }
}
