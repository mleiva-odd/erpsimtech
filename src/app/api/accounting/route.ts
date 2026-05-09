import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { z } from 'zod';

const CreateEntrySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  categoryId: z.string().uuid(),
  description: z.string().min(1),
  amount: z.number().positive(),
  date: z.string().optional(),
  branchId: z.string().uuid().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const categoryId = searchParams.get('categoryId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const branchId = searchParams.get('branchId');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '30');

  const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');

  const where: Record<string, unknown> = { companyId: tenant.companyId };

  if (type && ['INCOME', 'EXPENSE'].includes(type)) where.type = type;
  if (categoryId) where.categoryId = categoryId;

  const targetBranch = (!isAdmin || !branchId || branchId === 'null') ? tenant.branchId : branchId;
  if (targetBranch) where.branchId = targetBranch;

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    where.date = dateFilter;
  }

  try {
    const [entries, total] = await Promise.all([
      prisma.accountingEntry.findMany({
        where,
        include: {
          category: { select: { name: true, type: true } },
          user: { select: { name: true } },
          branch: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.accountingEntry.count({ where }),
    ]);

    return NextResponse.json({ data: entries, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching accounting entries:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = CreateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { type, categoryId, description, amount, date, branchId } = parsed.data;

  let targetBranchId = branchId || tenant.branchId;
  if (!targetBranchId) {
    const main = await prisma.branch.findFirst({ where: { companyId: tenant.companyId, isMain: true } });
    targetBranchId = main?.id || null;
  }

  try {
    // Validate category belongs to same company
    const category = await prisma.accountingCategory.findFirst({
      where: { id: categoryId, companyId: tenant.companyId },
    });
    if (!category) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    const entry = await prisma.accountingEntry.create({
      data: {
        companyId: tenant.companyId,
        branchId: targetBranchId,
        categoryId,
        type,
        description,
        amount,
        referenceType: 'MANUAL',
        date: date ? new Date(date) : new Date(),
        userId: tenant.userId,
      },
      include: {
        category: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error creating accounting entry:', error);
    return NextResponse.json({ error: 'Error al crear la entrada' }, { status: 500 });
  }
}
