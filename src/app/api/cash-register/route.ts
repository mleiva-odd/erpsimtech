import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const OpenRegisterSchema = z.object({
  openingBalance: z.number().min(0, 'El monto de apertura no puede ser negativo'),
});

const CloseRegisterSchema = z.object({
  closingBalance: z.number().min(0, 'El monto de cierre no puede ser negativo'),
});

// Get active cash register for current user
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    // Determine the branch
    let branchId = tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      branchId = mainBranch?.id ?? null;
    }

    const activeRegister = await prisma.cashRegister.findFirst({
      where: { userId: tenant.userId, branchId: branchId ?? undefined, status: 'OPEN' },
      include: {
        branch: { select: { name: true } },
        sales: {
          select: { total: true, payments: { select: { method: true, amount: true } } },
        },
        customerPayments: {
          select: { amount: true, method: true }
        }
      },
    });

    return NextResponse.json(activeRegister || { status: 'CLOSED' });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

// Open cash register
export async function POST(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    // Determine the branch
    let branchId = tenant.branchId;
    if (!branchId) {
      const mainBranch = await prisma.branch.findFirst({
        where: { companyId: tenant.companyId, isMain: true },
      });
      if (!mainBranch) {
        return NextResponse.json({ error: 'No hay sucursal asignada' }, { status: 400 });
      }
      branchId = mainBranch.id;
    }

    const activeRegister = await prisma.cashRegister.findFirst({
      where: { userId: tenant.userId, status: 'OPEN' },
    });

    if (activeRegister) {
      return NextResponse.json({ error: 'Ya tienes un turno abierto' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = OpenRegisterSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    const newRegister = await prisma.cashRegister.create({
      data: {
        branchId,
        userId: tenant.userId,
        openingBalance: parsed.data.openingBalance,
        status: 'OPEN',
      },
    });

    createAuditLog({
      companyId: tenant.companyId, userId: tenant.userId,
      action: 'CASH_REGISTER_OPENED', entity: 'CashRegister', entityId: newRegister.id,
      details: { openingBalance: parsed.data.openingBalance, branchId },
    });

    return NextResponse.json(newRegister, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al abrir caja' }, { status: 500 });
  }
}

// Close cash register
export async function PUT(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { userId: tenant.userId, status: 'OPEN' },
      include: {
        sales: {
          include: { payments: true }
        },
        transactions: true,
        customerPayments: true
      }
    });

    if (!activeRegister) {
      return NextResponse.json({ error: 'No hay turno abierto para cerrar' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = CloseRegisterSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    const cashPayments = activeRegister.sales
      .flatMap(s => s.payments)
      .filter(p => p.method === 'CASH')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const cashAbonos = activeRegister.customerPayments
      .filter(p => p.method === 'CASH')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalExpenses = activeRegister.transactions.reduce((sum, t) => sum + Number(t.amount), 0);

    const expectedCash = Number(activeRegister.openingBalance) + cashPayments + cashAbonos - totalExpenses;
    const declaredCash = parsed.data.closingBalance;
    const difference = declaredCash - expectedCash;

    // Validación Estricta: Faltante o Sobrante (Tolerancia de 0.05 centavos para JS floats)
    if (Math.abs(difference) > 0.05) {
      return NextResponse.json({ 
        error: `Descuadre de Caja: Declaraste Q${declaredCash.toFixed(2)}, pero el sistema calcula Q${expectedCash.toFixed(2)} (Fondo + Ventas + Abonos - Egresos). ${difference < 0 ? `Faltan Q${Math.abs(difference).toFixed(2)}` : `Sobran Q${difference.toFixed(2)}`}.` 
      }, { status: 400 });
    }

    const closedRegister = await prisma.cashRegister.update({
      where: { id: activeRegister.id },
      data: {
        closingBalance: parsed.data.closingBalance,
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    createAuditLog({
      companyId: tenant.companyId, userId: tenant.userId,
      action: 'CASH_REGISTER_CLOSED', entity: 'CashRegister', entityId: closedRegister.id,
      details: { closingBalance: parsed.data.closingBalance, openingBalance: Number(activeRegister.openingBalance) },
    });

    return NextResponse.json(closedRegister);
  } catch (error) {
    return NextResponse.json({ error: 'Error al cerrar caja' }, { status: 500 });
  }
}
