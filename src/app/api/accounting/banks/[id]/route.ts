import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireOperationalPermission('treasury:manage');
    if ('error' in result) return result.error;
    const { tenant } = result;

    const { id: bankId } = await context.params;
    if (!bankId) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const body = await request.json();
    
    // Solo permitimos actualizar algunos campos. El balance real es calculado o ajustado mediante transacciones.
    const { name, accountNumber, isActive, currency } = body;

    const existing = await prisma.bankAccount.findFirst({
      where: { id: bankId, companyId: tenant.companyId }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
    }

    const updated = await prisma.bankAccount.update({
      where: { id: bankId, companyId: tenant.companyId },
      data: {
        ...(name !== undefined && { name }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(isActive !== undefined && { isActive }),
        ...(currency !== undefined && { currency }),
      }
    });

    return NextResponse.json({ ...updated, balance: Number(updated.balance) });
  } catch (error) {
    console.error(`PATCH /api/accounting/banks/[id] error:`, error);
    return NextResponse.json({ error: 'Error al actualizar la cuenta bancaria' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireOperationalPermission('treasury:manage');
    if ('error' in result) return result.error;
    const { tenant } = result;

    const { id: bankId } = await context.params;

    // Verificar si existe y pertenece a la compañía
    const existing = await prisma.bankAccount.findFirst({
      where: { id: bankId, companyId: tenant.companyId },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
    }

    // Prevención estricta: No podemos borrar un banco que ya tiene historia contable
    if (existing._count.transactions > 0) {
      return NextResponse.json({ 
        error: 'No se puede eliminar la cuenta porque contiene rastro de transacciones. Considere Desactivarla en su lugar.' 
      }, { status: 400 });
    }

    await prisma.bankAccount.delete({
      where: { id: bankId, companyId: tenant.companyId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/accounting/banks/[id] error:`, error);
    return NextResponse.json({ error: 'Error al eliminar la cuenta bancaria' }, { status: 500 });
  }
}
