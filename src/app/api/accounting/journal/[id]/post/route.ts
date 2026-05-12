import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { postJournalEntry, JournalError } from '@/lib/accounting/journal';

/**
 * POST /api/accounting/journal/[id]/post — publica un asiento DRAFT.
 * Verifica balance y período abierto. Idempotente (si ya está posted, no-op).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const updated = await prisma.$transaction((tx) =>
      postJournalEntry(tx, id, tenant.companyId),
    );
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof JournalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error posting journal entry:', error);
    return NextResponse.json({ error: 'Error al publicar el asiento' }, { status: 500 });
  }
}
