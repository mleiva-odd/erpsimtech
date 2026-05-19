/**
 * GET /api/sales/:id/fel-pdf  · Fase 22c-2
 *
 * Devuelve la representación impresa del DTE en PDF (`application/pdf`).
 * Útil para imprimir o adjuntar al cliente final. El XML firmado sigue siendo
 * el documento legal — este PDF es solo una "representación gráfica".
 *
 * Se construye on-the-fly con `jspdf` a partir de:
 *   - TaxDocument (snapshot del DTE certificado).
 *   - Sale.items (líneas con cantidades, precios e IVA).
 *
 * Errores:
 *   - 404 si la venta no existe.
 *   - 409 si no hay TaxDocument o no está CERTIFIED/CANCELLED.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';
import { generateFelPdf, type FelPdfItem } from '@/lib/fel/pdf-generator';
import { fetchLogoAsDataUrl } from '@/lib/branding/logo';

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  FACT: 'Factura Electrónica',
  NCRE: 'Nota de Crédito',
  NDEB: 'Nota de Débito',
};

const TAX_REGIME_LABEL: Record<string, string> = {
  GENERAL: 'Régimen General · IVA 12%',
  PEQUENO_CONTRIBUYENTE: 'Pequeño Contribuyente · IVA 5%',
};

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
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true } },
          variant: { select: { id: true, sku: true, name: true } },
        },
      },
      taxDocument: true,
    } as unknown) as never,
  })) as
    | {
        id: string;
        branchId: string;
        currency: string;
        items: Array<{
          id: string;
          quantity: number;
          unitPrice: unknown;
          discount: unknown;
          subtotal: unknown;
          tax: unknown;
          product: { sku: string; name: string };
          variant: { sku: string; name: string } | null;
        }>;
        taxDocument: {
          id: string;
          type: string;
          numeroDisplay: string;
          status: string;
          dteUuid: string | null;
          autorizacion: string | null;
          fechaCertificacion: Date | null;
          taxRegime: string;
          provider: string;
          emisorNit: string;
          emisorNombre: string;
          receptorNit: string;
          receptorNombre: string;
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

  const [settings, company] = await Promise.all([
    prisma.companySettings.findUnique({
      where: { companyId: tenant.companyId },
      select: { address: true, storeName: true },
    }),
    prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: { logoUrl: true },
    }),
  ]);
  // Fase 29 · Branding: pre-fetcheamos el logo a Data URL para que el
  // generador PDF (sync) lo embeba directo. Falla silenciosa si no se puede.
  const logoDataUrl = await fetchLogoAsDataUrl(company?.logoUrl ?? null);

  const items: FelPdfItem[] = sale.items.map((it) => {
    const unitPrice = Number(it.unitPrice ?? 0);
    const discount = Number(it.discount ?? 0);
    const subtotal = Number(it.subtotal ?? 0);
    const tax = Number(it.tax ?? 0);
    return {
      sku: it.variant?.sku ?? it.product.sku,
      description: it.variant ? `${it.product.name} — ${it.variant.name}` : it.product.name,
      quantity: it.quantity,
      unitPrice,
      discount,
      subtotal,
      tax,
      total: subtotal + tax,
    };
  });

  const subtotalSum = items.reduce((s, it) => s + it.subtotal, 0);
  const taxSum = items.reduce((s, it) => s + it.tax, 0);
  const totalSum = items.reduce((s, it) => s + it.total, 0);

  const pdf = generateFelPdf({
    documentTypeLabel: DOCUMENT_TYPE_LABEL[doc.type] ?? doc.type,
    numeroDisplay: doc.numeroDisplay,
    dteUuid: doc.dteUuid,
    autorizacion: doc.autorizacion,
    fechaCertificacion: doc.fechaCertificacion,
    status: doc.status,
    taxRegimeLabel: TAX_REGIME_LABEL[doc.taxRegime] ?? doc.taxRegime,
    providerName: doc.provider,
    emisor: {
      nit: doc.emisorNit,
      nombre: doc.emisorNombre,
      nombreComercial: settings?.storeName ?? null,
      direccion: settings?.address ?? null,
      logoDataUrl,
    },
    receptor: {
      nit: doc.receptorNit,
      nombre: doc.receptorNombre,
    },
    items,
    totals: {
      subtotal: subtotalSum,
      tax: taxSum,
      total: totalSum,
      currency: sale.currency || 'GTQ',
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DTE_${doc.numeroDisplay}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
