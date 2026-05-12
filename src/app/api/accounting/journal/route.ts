import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { createJournalEntry, JournalError } from '@/lib/accounting';

/**
 * GET /api/accounting/journal — lista paginada de asientos con filtros.
 * Query params:
 *   - from / to (ISO dates)
 *   - referenceType
 *   - accountCode (filtra asientos cuyas líneas toquen esta cuenta)
 *   - posted=true|false
 *   - page / limit (defaults 1 / 30)
 */
export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage', 'reports:view']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const referenceType = searchParams.get('referenceType');
  const accountCode = searchParams.get('accountCode');
  const postedParam = searchParams.get('posted');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '30')));

  const where: Prisma.JournalEntryWhereInput = { companyId: tenant.companyId };

  if (from || to) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    where.date = dateFilter;
  }
  if (referenceType) where.referenceType = referenceType;
  if (postedParam === 'true') where.posted = true;
  else if (postedParam === 'false') where.posted = false;
  if (accountCode) {
    where.lines = { some: { account: { code: accountCode } } };
  }

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: { include: { account: { select: { code: true, name: true } } } },
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        period: { select: { year: true, month: true, status: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  return NextResponse.json({
    data: entries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

const ManualLineSchema = z
  .object({
    accountCode: z.string().min(1),
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
  date: z.string().datetime().optional(),
  branchId: z.string().uuid().optional().nullable(),
  lines: z.array(ManualLineSchema).min(2, 'Un asiento requiere al menos 2 líneas'),
});

/**
 * POST /api/accounting/journal — crea asiento manual en estado DRAFT
 * (posted=false). Requiere publicación explícita en `/journal/[id]/post`.
 */
export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json().catch(() => ({}));
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
        posted: false,
        lines,
      }),
    );
    return NextResponse.json(journal, { status: 201 });
  } catch (error) {
    if (error instanceof JournalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error creating manual journal entry:', error);
    return NextResponse.json({ error: 'Error al crear el asiento' }, { status: 500 });
  }
}
