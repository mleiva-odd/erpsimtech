import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/**
 * GET /api/reports/accounting/general-journal
 *
 * Libro Diario: lista cronológica de TODOS los asientos con sus líneas.
 * Query:
 *   - from / to (ISO date strings)
 *   - posted=true|false (default true)
 *   - page / limit
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const postedOnly = searchParams.get('posted') !== 'false';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));

  const where: Prisma.JournalEntryWhereInput = {
    companyId: tenant.companyId,
    ...(postedOnly ? { posted: true } : {}),
  };
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

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: { account: { select: { code: true, name: true, type: true } } },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
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
