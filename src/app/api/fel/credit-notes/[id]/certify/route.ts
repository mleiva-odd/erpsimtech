import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission, requireBranchAccess } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import {
  resolveProvider,
  reserveCorrelativo,
  FelError,
  type CertifyInput,
  type FelItem,
} from '@/lib/fel';

/**
 * POST /api/fel/credit-notes/:id/certify
 *
 * Certifica una CreditNote manual (creada vía /api/credit-notes). Análogo a
 * /api/fel/certify/:saleId pero para NCRE.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['sales:void', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const ncre = (await prisma.creditNote.findFirst({
      where: { id, companyId: tenant.companyId },
      include: ({
        items: true,
        taxDocument: true,
        sale: { select: { id: true, customerNit: true, customerName: true } },
      } as unknown) as Parameters<typeof prisma.creditNote.findFirst>[0]['include'],
    })) as {
      id: string;
      branchId: string;
      taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE';
      items: Array<{
        productId: string;
        description: string;
        quantity: number;
        unitPrice: unknown;
        taxRate: unknown;
        subtotal: unknown;
        tax: unknown;
      }>;
      taxDocument: { id: string; status: string } | null;
      sale: { id: string; customerNit: string | null; customerName: string | null };
    } | null;
    if (!ncre) return NextResponse.json({ error: 'NCRE no encontrada' }, { status: 404 });

    if (ncre.taxDocument && ncre.taxDocument.status === 'CERTIFIED') {
      return NextResponse.json({ alreadyCertified: true, taxDocument: ncre.taxDocument });
    }

    const branchCheck = await requireBranchAccess(tenant, ncre.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    const [companyRaw, settings] = await Promise.all([
      prisma.company.findUnique({
        where: { id: tenant.companyId },
      }),
      prisma.companySettings.findUnique({
        where: { companyId: tenant.companyId },
        select: {
          felEnabled: true,
          felProvider: true,
          felNitEmisor: true,
          felApiUser: true,
          felApiKey: true,
          felCertificateUrl: true,
          storeName: true,
          address: true,
        },
      }),
    ]);
    const company = companyRaw as
      | { name: string; nit: string | null; taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null }
      | null;
    if (!company || !settings) {
      return NextResponse.json({ error: 'Configuración incompleta' }, { status: 400 });
    }
    const emisorNit = settings.felNitEmisor?.trim() || company.nit?.trim() || '';
    if (!emisorNit) {
      return NextResponse.json(
        { error: 'NIT del emisor no configurado', code: 'EMISOR_NIT_MISSING' },
        { status: 400 },
      );
    }

    let provider;
    try {
      provider = resolveProvider({
        felEnabled: settings.felEnabled,
        felProvider: settings.felProvider as string,
        felApiUser: settings.felApiUser,
        felApiKey: settings.felApiKey,
        felCertificateUrl: settings.felCertificateUrl,
      });
    } catch (err) {
      if (err instanceof FelError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      throw err;
    }

    const { ncreDoc, certifyInput } = await prisma.$transaction(async (tx) => {
      const correlativo = await reserveCorrelativo(tx, {
        companyId: tenant.companyId,
        branchId: ncre.branchId,
        documentType: 'NCRE',
      });

      const items: FelItem[] = ncre.items.map((it, idx) => ({
        numeroLinea: idx + 1,
        bienOServicio: 'B',
        codigoItem: it.productId,
        descripcion: it.description,
        cantidad: it.quantity,
        unidadMedida: 'UNI',
        precioUnitario: Number(it.unitPrice),
        descuento: 0,
        precio: Number(it.subtotal),
        taxRate: Number(it.taxRate),
        iva: Number(it.tax),
        total: Number(it.subtotal) + Number(it.tax),
        isTaxExempt: Number(it.taxRate) === 0,
      }));

      const totalIva = items.reduce((s, i) => s + i.iva, 0);
      const totalGravado = items.filter((i) => !i.isTaxExempt).reduce((s, i) => s + i.precio, 0);
      const totalExento = items.filter((i) => i.isTaxExempt).reduce((s, i) => s + i.precio, 0);
      const granTotal = items.reduce((s, i) => s + i.total, 0);

      const certifyInputLocal: CertifyInput = {
        type: 'NCRE',
        seriePrefix: correlativo.prefix,
        numero: correlativo.numero,
        fechaEmision: new Date(),
        emisor: {
          nit: emisorNit,
          nombre: settings.storeName || company.name,
          codigoEstablecimiento: '1',
          direccion: settings.address ?? undefined,
          taxRegime: company.taxRegime!,
        },
        receptor: {
          nit: ncre.sale.customerNit ?? 'CF',
          nombre: ncre.sale.customerName ?? 'Consumidor Final',
        },
        items,
        totales: { granTotal, totalIva, totalGravado, totalExento },
        internalId: ncre.id,
      };

      const created = await tx.taxDocument.create({
        data: {
          companyId: tenant.companyId,
          branchId: ncre.branchId,
          seriesId: correlativo.seriesId,
          type: 'NCRE',
          seriePrefix: correlativo.prefix,
          numero: correlativo.numero,
          numeroDisplay: correlativo.numeroDisplay,
          status: 'PENDING',
          receptorNit: certifyInputLocal.receptor.nit,
          receptorNombre: certifyInputLocal.receptor.nombre,
          emisorNit,
          emisorNombre: certifyInputLocal.emisor.nombre,
          taxRegime: ncre.taxRegime,
          provider: settings.felProvider as 'MOCK' | 'INFILE' | 'DIGIFACT' | 'NONE',
          creditNoteId: ncre.id,
        },
      });

      return { ncreDoc: created, certifyInput: certifyInputLocal };
    });

    const certifyResult = await provider.certify(certifyInput);
    if (!certifyResult.ok) {
      await prisma.taxDocument.update({
        where: { id: ncreDoc.id },
        data: { status: 'REJECTED' },
      });
      return NextResponse.json(
        { error: `Provider rechazó: ${certifyResult.message}`, code: certifyResult.code },
        { status: 502 },
      );
    }

    const final = await prisma.taxDocument.update({
      where: { id: ncreDoc.id },
      data: {
        status: 'CERTIFIED',
        dteUuid: certifyResult.uuid,
        autorizacion: certifyResult.autorizacion,
        fechaCertificacion: certifyResult.fechaCertificacion,
        hashCertificacion: certifyResult.hashCertificacion,
        xmlFirmado: certifyResult.xmlFirmado,
        providerResponseJson: certifyResult.providerResponseRaw
          ? (certifyResult.providerResponseRaw as Record<string, unknown>)
          : undefined,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'FEL_CERTIFY_NCRE',
      entity: 'TaxDocument',
      entityId: final.id,
      details: { creditNoteId: ncre.id, uuid: final.dteUuid },
    });

    return NextResponse.json({ taxDocument: final }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof FelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Certify NCRE error:', error);
    const message = error instanceof Error ? error.message : 'Error al certificar NCRE';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
