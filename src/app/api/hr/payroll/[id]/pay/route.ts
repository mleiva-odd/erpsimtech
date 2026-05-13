import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { generatePayrollJournalEntry } from '@/lib/payroll/accounting';

/**
 * POST /api/hr/payroll/[id]/pay
 *
 * Transición: APPROVED → PAID + genera JournalEntry idempotente.
 *
 * Idempotencia:
 *   - Si `Payroll.journalEntryId` ya está seteado, retorna 200 con la
 *     planilla sin crear otro asiento. Esto cubre dobles clicks o
 *     reintentos.
 *   - Si el status ya es PAID pero NO hay journalEntryId (estado raro,
 *     legacy), retorna 200 sin generar — el dueño puede regenerar a
 *     mano vía un endpoint admin si es necesario.
 *
 * Efectos colaterales:
 *   - Decrementa `EmployeeLoan.balance` por el `loanDeduction` aplicado
 *     a cada item; marca status=PAID si balance llega a 0.
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

    type P = {
      id: string;
      status: string;
      payrollType: string;
      journalEntryId: string | null;
      endDate: Date;
      companyId: string;
      items: Array<{
        id: string;
        employeeId: string;
        loanDeduction: unknown;
        baseSalary: unknown;
        bonusIncentive: unknown;
        totalGross: unknown;
        igssLaboral: unknown;
        isr: unknown;
        otherDeductions: unknown;
        totalDeductions: unknown;
        netSalary: unknown;
        bono14Provision: unknown;
        aguinaldoProvision: unknown;
        indemnizacionProvision: unknown;
        vacacionesProvision: unknown;
        igssPatronal: unknown;
        irtra: unknown;
        intecap: unknown;
        totalCostoPatronal: unknown;
      }>;
    };
    const p = payroll as unknown as P;

    if (p.journalEntryId) {
      // Ya pagada con asiento, idempotente.
      return NextResponse.json(payroll);
    }
    if (p.status === 'PAID') {
      // Legacy: marcada como PAID pero sin asiento. Devolver sin tocar.
      return NextResponse.json(payroll);
    }
    if (p.status !== 'APPROVED') {
      throw new ApiError(
        400,
        `Sólo planillas APPROVED pueden pagarse (estado actual: ${p.status}).`,
      );
    }
    if (!p.items.length) {
      throw new ApiError(400, 'Planilla sin items — no se puede pagar.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Asiento contable.
      const entry = await generatePayrollJournalEntry(
        tx,
        {
          id: p.id,
          companyId: p.companyId,
          payrollType: p.payrollType,
          endDate: p.endDate,
          items: p.items,
        },
        tenant.userId,
      );

      // 2. Descontar préstamos activos por las cuotas aplicadas.
      // Agrupamos las loanDeductions por empleado.
      const deductionByEmp = new Map<string, number>();
      for (const it of p.items) {
        const v = Number(it.loanDeduction) || 0;
        if (v > 0) {
          deductionByEmp.set(it.employeeId, (deductionByEmp.get(it.employeeId) ?? 0) + v);
        }
      }
      if (deductionByEmp.size > 0) {
        const empIds = Array.from(deductionByEmp.keys());
        const loans = (await tx.employeeLoan.findMany({
          where: {
            companyId: tenant.companyId,
            employeeId: { in: empIds },
            status: 'ACTIVE',
          },
          orderBy: { approvedAt: 'asc' },
        })) as Array<{
          id: string;
          employeeId: string;
          balance: unknown;
        }>;

        // FIFO por empleado: el préstamo más antiguo consume primero.
        for (const loan of loans) {
          const remaining = deductionByEmp.get(loan.employeeId) ?? 0;
          if (remaining <= 0) continue;
          const bal = Number(loan.balance) || 0;
          const consume = Math.min(remaining, bal);
          const newBal = Math.round((bal - consume) * 100) / 100;
          await tx.employeeLoan.update({
            where: { id: loan.id },
            data: {
              balance: newBal,
              status: newBal <= 0 ? 'PAID' : 'ACTIVE',
            },
          });
          deductionByEmp.set(loan.employeeId, remaining - consume);
        }
      }

      // 3. Actualizar Payroll.
      return tx.payroll.update({
        where: { id: p.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidById: tenant.userId,
          journalEntryId: entry.id,
        } as never,
      });
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PAYROLL_PAID',
      entity: 'Payroll',
      entityId: id,
      details: { previousStatus: 'APPROVED' },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/payroll/[id]/pay POST');
  }
}
