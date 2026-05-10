import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(120),
  type: z.enum(['INCOME', 'EXPENSE']),
});

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const categories = await prisma.accountingCategory.findMany({
      where: { companyId: tenant.companyId },
      orderBy: [{ type: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { entries: true } } },
    });
    return NextResponse.json(categories);
  } catch (error) {
    return handleApiError(error, '/api/accounting/categories GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const data = CreateCategorySchema.parse(body);

    const cat = await prisma.accountingCategory.create({
      data: { companyId: tenant.companyId, name: data.name, type: data.type },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/accounting/categories POST');
  }
}
