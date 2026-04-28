import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const payrolls = await prisma.payroll.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } }
    });
    return NextResponse.json(payrolls);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { name, startDate, endDate } = await req.json();

    // 1. Get all active employees
    const employees = await prisma.employee.findMany({
      where: { companyId: tenant.companyId, active: true },
    });

    if (employees.length === 0) {
      return NextResponse.json({ error: 'No hay empleados activos para procesar' }, { status: 400 });
    }

    // 2. Create Payroll and Items in a transaction
    const payroll = await prisma.$transaction(async (tx) => {
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      const newPayroll = await tx.payroll.create({
        data: {
          companyId: tenant.companyId,
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'DRAFT',
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
        },
      });

      for (const emp of employees) {
        const base = Number(emp.baseSalary);
        const bonusIncentive = 250; // Standard for GT
        const igss = base * 0.0483; // Standard for GT
        const net = base + bonusIncentive - igss;

        totalGross += (base + bonusIncentive);
        totalDeductions += igss;
        totalNet += net;

        await tx.payrollItem.create({
          data: {
            payrollId: newPayroll.id,
            employeeId: emp.id,
            baseSalary: base,
            bonusIncentive,
            igss,
            netSalary: net,
          }
        });
      }

      return await tx.payroll.update({
        where: { id: newPayroll.id },
        data: {
          totalGross,
          totalDeductions,
          totalNet,
        }
      });
    });

    return NextResponse.json(payroll, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al generar planilla' }, { status: 500 });
  }
}
