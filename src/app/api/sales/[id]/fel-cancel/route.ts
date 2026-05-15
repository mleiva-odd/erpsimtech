/**
 * POST /api/sales/:id/fel-cancel  · Fase 22c-2
 *
 * Anula el DTE de una venta. Wrapper alrededor de `/api/fel/cancel/:taxDocumentId`:
 *   1. Resuelve el `TaxDocument` asociado a la venta.
 *   2. Re-emite el body al handler canónico (que valida permisos, motivo,
 *      crea NCRE, anula DTE original y registra AuditLog).
 *
 * Body esperado: `{ motivo: string }`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { POST as cancelByTaxDocument } from '@/app/api/fel/cancel/[taxDocumentId]/route';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTenant();
  if ('error' in auth) return auth.error;
  const { tenant } = auth;

  const { id: saleId } = await params;

  const sale = (await prisma.sale.findFirst({
    where: { id: saleId, companyId: tenant.companyId },
    include: ({ taxDocument: { select: { id: true, status: true } } } as unknown) as never,
  })) as
    | { id: string; companyId: string; taxDocument: { id: string; status: string } | null }
    | null;

  if (!sale) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
  }

  if (!sale.taxDocument) {
    return NextResponse.json(
      { error: 'Esta venta no tiene un DTE certificado para anular.', code: 'FEL_NO_DOCUMENT' },
      { status: 404 },
    );
  }

  return cancelByTaxDocument(req, {
    params: Promise.resolve({ taxDocumentId: sale.taxDocument.id }),
  });
}
