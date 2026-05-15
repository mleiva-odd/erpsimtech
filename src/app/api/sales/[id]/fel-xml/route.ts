/**
 * GET /api/sales/:id/fel-xml  · Fase 22c-2
 *
 * Devuelve el XML firmado del DTE asociado a la venta como descarga.
 * Content-Type: `application/xml`.
 *
 * Errores:
 *   - 404 si la venta no existe o no tiene TaxDocument.
 *   - 409 si el TaxDocument no está CERTIFIED.
 *   - 410 si el TaxDocument está CERTIFIED pero no tiene xmlFirmado persistido
 *     (estado inconsistente que debería auto-reproducirse llamando al provider).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTenant();
  if ('error' in auth) return auth.error;
  const { tenant } = auth;

  const { id: saleId } = await params;

  const sale = (await prisma.sale.findFirst({
    where: { id: saleId, companyId: tenant.companyId },
    include: ({
      taxDocument: {
        select: {
          id: true,
          status: true,
          numeroDisplay: true,
          xmlFirmado: true,
        },
      },
    } as unknown) as never,
  })) as
    | {
        id: string;
        branchId: string;
        taxDocument: {
          id: string;
          status: string;
          numeroDisplay: string;
          xmlFirmado: string | null;
        } | null;
      }
    | null;

  if (!sale) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
  }

  const branchCheck = await requireBranchAccess(tenant, sale.branchId);
  if ('error' in branchCheck) return branchCheck.error;

  const doc = sale.taxDocument;
  if (!doc) {
    return NextResponse.json(
      { error: 'Esta venta no tiene DTE asociado.', code: 'FEL_NO_DOCUMENT' },
      { status: 404 },
    );
  }
  if (doc.status !== 'CERTIFIED' && doc.status !== 'CANCELLED') {
    return NextResponse.json(
      { error: `El DTE no está certificado (status=${doc.status}).`, code: 'FEL_NOT_CERTIFIED' },
      { status: 409 },
    );
  }
  if (!doc.xmlFirmado) {
    return NextResponse.json(
      { error: 'El XML firmado no está disponible para este DTE.', code: 'FEL_XML_MISSING' },
      { status: 410 },
    );
  }

  return new NextResponse(doc.xmlFirmado, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="DTE_${doc.numeroDisplay}.xml"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
