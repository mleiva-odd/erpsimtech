import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    // Tenant guard: validar que el PayrollItem pertenezca a esta empresa
    // vía su Payroll parent. Sin esto, cualquier usuario con
    // `payroll:manage` puede editar PayrollItem de OTRA empresa si conoce
    // el UUID. (Bug detectado en audit Fase 18.)
    const existing = await prisma.payrollItem.findUnique({
      where: { id },
      include: { payroll: { select: { companyId: true } } },
    });
    if (!existing || existing.payroll.companyId !== tenant.companyId) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    const data = await req.json();

    // Todo lo demás dentro de una transacción atómica: si falla el
    // recálculo de Payroll totales, no queremos que el item quede
    // actualizado a medias.
    const updatedItem = await prisma.$transaction(async (tx) => {
      const item = await tx.payrollItem.update({
        where: { id },
        data: {
          otherBonuses: data.otherBonuses,
          otherDeductions: data.otherDeductions,
          isr: data.isr,
          netSalary: data.netSalary,
        },
        include: { payroll: true },
      });

      // Recalculate Payroll Totals (defensa: no confiamos en netSalary
      // del cliente — recalculamos de cero).
      const allItems = await tx.payrollItem.findMany({
        where: { payrollId: item.payrollId },
      });

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      for (const it of allItems) {
        const base = Number(it.baseSalary);
        const bonus = Number(it.bonusIncentive) + Number(it.otherBonuses);
        const ded = Number(it.igss) + Number(it.isr) + Number(it.otherDeductions);

        totalGross += (base + bonus);
        totalDeductions += ded;
        totalNet += (base + bonus - ded);
      }

      await tx.payroll.update({
        where: { id: item.payrollId },
        data: { totalGross, totalDeductions, totalNet },
      });

      return item;
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar item' }, { status: 500 });
  }
}
