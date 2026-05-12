import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { z } from 'zod';
import { createJournalEntry, JournalError } from '@/lib/accounting';

const ManualLineSchema = z
  .object({
    accountCode: z.string().min(1, 'accountCode requerido'),
    debit: z.number().min(0).default(0),
    credit: z.number().min(0).default(0),
    description: z.string().optional(),
    costCenterId: z.string().optional(),
  })
  .refine((l) => (l.debit > 0) !== (l.credit > 0), {
    message: 'Cada línea requiere DR o CR (exclusivo, > 0).',
  });

const CreateManualEntrySchema = z.object({
  description: z.string().min(1, 'Descripción requerida'),
  date: z.string().datetime({ message: 'date debe ser ISO 8601' }).optional(),
  branchId: z.string().uuid().optional().nullable(),
  lines: z.array(ManualLineSchema).min(2, 'Un asiento requiere al menos 2 líneas'),
});

/**
 * Schema legacy (single-line) — preservado para no romper la UI vieja
 * que crea AccountingEntry. Cualquier consumidor nuevo debe usar
 * `CreateManualEntrySchema` (con `lines[]`).
 */
const CreateLegacyEntrySchema = z.object({
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

/**
 * POST: alta manual de asiento.
 *
 * Acepta dos modos en el cuerpo:
 *   A) Partida doble (preferido): { description, date?, branchId?, lines: [...] }
 *      Crea un JournalEntry DRAFT (`posted=false`). Debe publicarse luego
 *      con `POST /api/accounting/journal/[id]/post`.
 *
 *   B) Legacy single-line (deprecado): { type, categoryId, amount, ... }
 *      Crea un AccountingEntry para mantener la UI vieja funcionando
 *      durante la transición. Cuando la UI migre a partida doble, este
 *      branch se elimina.
 */
export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json().catch(() => ({}));

  // Modo A — partida doble (DRAFT)
  if (Array.isArray(body?.lines)) {
    const parsed = CreateManualEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { description, date, branchId, lines } = parsed.data;
    try {
      const journal = await prisma.$transaction((tx) =>
        createJournalEntry(tx, {
          companyId: tenant.companyId,
          branchId: branchId ?? tenant.branchId ?? null,
          date: date ? new Date(date) : new Date(),
          description,
          referenceType: 'MANUAL',
          userId: tenant.userId,
          posted: false, // DRAFT — requiere publicación explícita
          lines,
        }),
      );
      return NextResponse.json(journal, { status: 201 });
    } catch (error) {
      if (error instanceof JournalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error('Error creating journal entry:', error);
      return NextResponse.json({ error: 'Error al crear el asiento' }, { status: 500 });
    }
  }

  // Modo B — legacy (deprecado)
  const parsedLegacy = CreateLegacyEntrySchema.safeParse(body);
  if (!parsedLegacy.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsedLegacy.error.flatten() },
      { status: 400 },
    );
  }
  const { type, categoryId, description, amount, date, branchId } = parsedLegacy.data;

  let targetBranchId = branchId || tenant.branchId;
  if (!targetBranchId) {
    const main = await prisma.branch.findFirst({ where: { companyId: tenant.companyId, isMain: true } });
    targetBranchId = main?.id || null;
  }

  try {
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
