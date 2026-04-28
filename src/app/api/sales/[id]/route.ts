import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requireTenant } from '@/lib/tenant';
import { createAccountingEntry } from '@/lib/accounting';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const [sale, settings] = await Promise.all([
      prisma.sale.findFirst({
        where: { id: resolvedParams.id, companyId: tenant.companyId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
          payments: true,
          returns: {
            include: {
              items: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          user: { select: { name: true } },
          customer: { select: { name: true, nit: true, address: true } },
          branch: { select: { name: true } },
        },
      }),
      prisma.companySettings.findUnique({ where: { companyId: tenant.companyId } }),
    ]);

    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

    const branchResult = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchResult) return branchResult.error;

    return NextResponse.json({ sale, settings });
  } catch (error) {
    console.error('Error fetching sale by ID:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
      select: { id: true, status: true, branchId: true },
    });

    if (!sale) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    const branchResult = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchResult) return branchResult.error;
    if (sale.status !== 'QUOTE') return NextResponse.json({ error: 'Solo puedes eliminar Cotizaciones.' }, { status: 400 });

    await prisma.sale.delete({ where: { id: sale.id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;
  const body = await req.json();
  const { action } = body;

  if (action !== 'CANCEL') {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  }

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

    const branchResult = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchResult) return branchResult.error;

    if (sale.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Esta venta ya está anulada.' }, { status: 400 });
    }

    if (sale.status === 'QUOTE') {
      return NextResponse.json({ error: 'Las cotizaciones se descartan, no se anulan.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Reincorporar stock
      for (const item of sale.items) {
        await tx.productStock.updateMany({
          where: {
            productId: item.productId,
            branchId: sale.branchId,
            variantId: item.variantId || null,
          },
          data: { quantity: { increment: item.quantity } },
        });
      }

      // 2. Reverso de Tesorería según el método de pago
      for (const payment of sale.payments) {
        if (payment.method === 'CREDIT' && sale.customerId) {
          // A. Restar la deuda del balance del cliente
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { balance: { decrement: Number(payment.amount) } },
          });
        } 
        else if (payment.method === 'CASH' && sale.cashRegisterId) {
          // B. Extraer el efectivo de la Caja Registradora
          await tx.cashRegisterTransaction.create({
            data: {
              cashRegisterId: sale.cashRegisterId,
              userId: tenant.userId,
              type: 'EXPENSE',
              amount: payment.amount,
              description: `Anulación de Venta #${sale.id.split('-')[0].toUpperCase()}`,
              reference: sale.id,
            }
          });
        }
        else if (['CARD', 'TRANSFER'].includes(payment.method) && payment.bankAccountId) {
          // C. Extraer el dinero del Banco
          await tx.bankTransaction.create({
            data: {
              bankAccountId: payment.bankAccountId,
              userId: tenant.userId,
              type: 'EXPENSE',
              amount: payment.amount,
              reference: `Anulación Venta #${sale.id.split('-')[0].toUpperCase()}`,
              description: `Reverso por anulación de Venta POS`,
            }
          });
          
          await tx.bankAccount.update({
            where: { id: payment.bankAccountId },
            data: { balance: { decrement: payment.amount } }
          });
        }
      }

      // 3. Marcar como anulada
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'CANCELLED' },
      });

      // 4. Registrar movimiento contable (Reversión)
      const categoryName = sale.channel === 'REMOTE' ? 'Devoluciones Remotas' : 'Devoluciones POS';
      await createAccountingEntry(tx, {
        companyId: tenant.companyId,
        branchId: sale.branchId,
        type: 'EXPENSE',
        categoryName,
        description: `Anulación de Venta #${sale.id.split('-')[0].toUpperCase()}`,
        amount: Number(sale.total),
        referenceType: 'SALE_CANCEL',
        referenceId: sale.id,
        userId: tenant.userId,
      });
    });

    return NextResponse.json({ success: true, message: 'Venta anulada correctamente.' });
  } catch (error) {
    console.error('Error anulando venta:', error);
    return NextResponse.json({ error: 'Error al anular la venta' }, { status: 500 });
  }
}
