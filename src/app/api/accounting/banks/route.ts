import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

const CreateBankSchema = z.object({
  name: z.string().trim().min(2, 'Nombre requerido').max(120),
  type: z.enum(['CASH_BOX', 'BANK_ACCOUNT', 'CREDIT_CARD', 'DIGITAL_WALLET']),
  accountNumber: z.string().trim().max(80).optional().nullable(),
  currency: z.string().trim().length(3, 'Currency ISO de 3 letras').default('GTQ'),
  isActive: z.boolean().default(true),
});

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

    // Serializar Decimal a Number
    const safeBanks = banks.map(b => ({
      ...b,
      balance: Number(b.balance)
    }));

    return NextResponse.json(safeBanks);
  } catch (error) {
    return handleApiError(error, '/api/accounting/banks GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireOperationalPermission('treasury:manage');
    if ('error' in result) return result.error;
    const { tenant } = result;

    const body = await request.json().catch(() => ({}));
    const data = CreateBankSchema.parse(body);

    const newBank = await prisma.bankAccount.create({
      data: {
        companyId: tenant.companyId,
        name: data.name,
        type: data.type,
        accountNumber: data.accountNumber ?? null,
        currency: data.currency,
        isActive: data.isActive,
      }
    });

    return NextResponse.json({ ...newBank, balance: Number(newBank.balance) });
  } catch (error) {
    return handleApiError(error, '/api/accounting/banks POST');
  }
}
