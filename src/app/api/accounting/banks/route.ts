import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  try {
    const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
    if ('error' in result) return result.error;
    const { tenant } = result;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active');

    const banks = await prisma.bankAccount.findMany({
      where: { 
        companyId: tenant.companyId,
        ...(active !== null ? { isActive: active === 'true' } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });

    // To serialize Decimal
    const safeBanks = banks.map(b => ({
      ...b,
      balance: Number(b.balance)
    }));

    return NextResponse.json(safeBanks);
  } catch (error) {
    console.error('GET /api/accounting/banks error:', error);
    return NextResponse.json({ error: 'Error al obtener cuentas bancarias' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireOperationalPermission('treasury:manage');
    if ('error' in result) return result.error;
    const { tenant } = result;

    const body = await request.json();
    const { name, type, accountNumber, currency, isActive } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'El nombre y tipo son requeridos' }, { status: 400 });
    }

    const newBank = await prisma.bankAccount.create({
      data: {
        companyId: tenant.companyId,
        name,
        type,
        accountNumber: accountNumber || null,
        currency: currency || 'GTQ',
        isActive: isActive ?? true
      }
    });

    return NextResponse.json({ ...newBank, balance: Number(newBank.balance) });
  } catch (error) {
    console.error('POST /api/accounting/banks error:', error);
    return NextResponse.json({ error: 'Error al crear la cuenta bancaria' }, { status: 500 });
  }
}
