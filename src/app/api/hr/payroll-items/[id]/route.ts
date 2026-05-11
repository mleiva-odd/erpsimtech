import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;

  const { id } = await params;
  try {
    const data = await req.json();

    // 1. Update the item
    const updatedItem = await prisma.payrollItem.update({
      where: { id },
      data: {
        otherBonuses: data.otherBonuses,
        otherDeductions: data.otherDeductions,
        isr: data.isr,
        netSalary: data.netSalary,
      },
      include: { payroll: true }
    });

    // 2. Recalculate Payroll Totals
    const allItems = await prisma.payrollItem.findMany({
      where: { payrollId: updatedItem.payrollId }
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const item of allItems) {
      const base = Number(item.baseSalary);
      const bonus = Number(item.bonusIncentive) + Number(item.otherBonuses);
      const ded = Number(item.igss) + Number(item.isr) + Number(item.otherDeductions);
      
      totalGross += (base + bonus);
      totalDeductions += ded;
      totalNet += (base + bonus - ded);
    }

    await prisma.payroll.update({
      where: { id: updatedItem.payrollId },
      data: { totalGross, totalDeductions, totalNet }
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar item' }, { status: 500 });
  }
}
