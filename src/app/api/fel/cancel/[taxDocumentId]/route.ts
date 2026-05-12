import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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
import { z } from 'zod';

const CancelSchema = z.object({
  motivo: z.string().trim().min(3, 'Motivo de anulación requerido'),
});

/**
 * POST /api/fel/cancel/:taxDocumentId
 *
 * Emite una NCRE asociada al DTE original y marca el TaxDocument original
 * como CANCELLED. La NCRE se crea, se certifica con el provider y se enlaza
 * con `cancelledById` (puntando del nuevo al viejo).
 *
 * NO revierte el JournalEntry de la venta original — eso lo hace el handler
 * de anulación de venta (`PATCH /api/sales/:id` con action=CANCEL). La NCRE
 * es el documento fiscal; el reverso contable es independiente.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taxDocumentId: string }> },
) {
  const result = await requireOperationalPermission(['sales:void', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { taxDocumentId } = await params;
  const body = await req.json();
  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const original = (await prisma.taxDocument.findFirst({
      where: { id: taxDocumentId, companyId: tenant.companyId },
      include: {
        sale: {
          include: {
            items: { include: { product: { select: { id: true, sku: true, name: true, isTaxExempt: true } } } },
          },
        },
      },
    })) as {
      id: string;
      branchId: string;
      status: string;
      cancelledById: string | null;
      taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE';
      provider: 'NONE' | 'MOCK' | 'INFILE' | 'DIGIFACT';
      dteUuid: string | null;
      fechaCertificacion: Date | null;
      createdAt: Date;
      seriePrefix: string;
      numero: number;
      receptorNit: string;
      receptorNombre: string;
      emisorNit: string;
      emisorNombre: string;
      sale: {
        id: string;
        branchId: string;
        subtotal: unknown;
        tax: unknown;
        total: unknown;
        items: Array<{
          id: string;
          productId: string;
          variantId: string | null;
          quantity: number;
          unitPrice: unknown;
          discount: unknown;
          subtotal: unknown;
          taxRate: unknown;
          tax: unknown;
          product: { id: string; sku: string; name: string; isTaxExempt: boolean };
        }>;
      } | null;
    } | null;

    if (!original) {
      return NextResponse.json({ error: 'TaxDocument no encontrado' }, { status: 404 });
    }
    if (original.status !== 'CERTIFIED') {
      return NextResponse.json(
        { error: 'Solo se pueden anular DTE en estado CERTIFIED.' },
        { status: 400 },
      );
    }
    if (original.cancelledById) {
      return NextResponse.json({ error: 'Este DTE ya fue anulado.' }, { status: 409 });
    }

    const branchCheck = await requireBranchAccess(tenant, original.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    const settings = await prisma.companySettings.findUnique({
      where: { companyId: tenant.companyId },
      select: {
        felEnabled: true,
        felProvider: true,
        felApiUser: true,
        felApiKey: true,
        felCertificateUrl: true,
        storeName: true,
        address: true,
      },
    });
    if (!settings) {
      return NextResponse.json({ error: 'CompanySettings no configurado.' }, { status: 400 });
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

    // Crear NCRE en transacción.
    const { ncreDoc, certifyInput } = await prisma.$transaction(async (tx) => {
      const correlativo = await reserveCorrelativo(tx, {
        companyId: tenant.companyId,
        branchId: original.branchId,
        documentType: 'NCRE',
      });

      const sale = original.sale;
      if (!sale) {
        throw new FelError('TaxDocument no tiene Sale asociado — no se puede emitir NCRE automática.', {
          code: 'NCRE_NO_SALE',
          status: 400,
        });
      }

      // Crear CreditNote modelo con líneas espejo de la venta.
      // Casts a `Number()` para convertir los Decimal de Prisma a primitives
      // que el create acepta (el include con select indirecto deja los Decimal
      // como `unknown` en el cast manual del findFirst).
      const creditNote = await tx.creditNote.create({
        data: {
          companyId: tenant.companyId,
          saleId: sale.id,
          branchId: original.branchId,
          userId: tenant.userId,
          reason: parsed.data.motivo,
          subtotal: Number(sale.subtotal),
          tax: Number(sale.tax),
          total: Number(sale.total),
          taxRegime: original.taxRegime,
          items: {
            create: sale.items.map((it) => ({
              saleItemId: it.id,
              productId: it.productId,
              variantId: it.variantId,
              description: it.product.name,
              quantity: it.quantity,
              unitPrice: Number(it.unitPrice),
              taxRate: Number(it.taxRate ?? 0),
              subtotal: Number(it.subtotal),
              tax: Number(it.tax ?? 0),
            })),
          },
        },
        include: { items: true },
      });

      const items: FelItem[] = sale.items.map((it, idx) => ({
        numeroLinea: idx + 1,
        bienOServicio: 'B',
        codigoItem: it.product.sku,
        descripcion: it.product.name,
        cantidad: it.quantity,
        unidadMedida: 'UNI',
        precioUnitario: Number(it.unitPrice),
        descuento: Number(it.discount ?? 0),
        precio: Number(it.subtotal),
        taxRate: Number(it.taxRate ?? 0),
        iva: Number(it.tax ?? 0),
        total: Number(it.subtotal) + Number(it.tax ?? 0),
        isTaxExempt: it.product.isTaxExempt ?? false,
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
          nit: original.emisorNit,
          nombre: original.emisorNombre,
          codigoEstablecimiento: '1',
          taxRegime: original.taxRegime,
        },
        receptor: { nit: original.receptorNit, nombre: original.receptorNombre },
        items,
        totales: { granTotal, totalIva, totalGravado, totalExento },
        internalId: creditNote.id,
        documentoReferencia: {
          uuid: original.dteUuid ?? original.id,
          serie: original.seriePrefix,
          numero: original.numero,
          fechaEmision: original.fechaCertificacion ?? original.createdAt,
          motivo: parsed.data.motivo,
        },
      };

      const ncrePending = await tx.taxDocument.create({
        data: {
          companyId: tenant.companyId,
          branchId: original.branchId,
          seriesId: correlativo.seriesId,
          type: 'NCRE',
          seriePrefix: correlativo.prefix,
          numero: correlativo.numero,
          numeroDisplay: correlativo.numeroDisplay,
          status: 'PENDING',
          receptorNit: original.receptorNit,
          receptorNombre: original.receptorNombre,
          emisorNit: original.emisorNit,
          emisorNombre: original.emisorNombre,
          taxRegime: original.taxRegime,
          provider: original.provider,
          creditNoteId: creditNote.id,
        },
      });

      return { ncreDoc: ncrePending, certifyInput: certifyInputLocal };
    });

    // Certificar la NCRE en el provider.
    const certifyResult = await provider.certify(certifyInput);
    if (!certifyResult.ok) {
      await prisma.taxDocument.update({
        where: { id: ncreDoc.id },
        data: { status: 'REJECTED' },
      });
      return NextResponse.json(
        {
          error: `Provider rechazó la NCRE: ${certifyResult.message}`,
          code: certifyResult.code,
        },
        { status: 502 },
      );
    }

    // Llamar cancel en el provider sobre el DTE original.
    const cancelResult = await provider.cancel({
      uuid: original.dteUuid ?? original.id,
      motivoAnulacion: parsed.data.motivo,
      fechaAnulacion: new Date(),
      emisorNit: original.emisorNit,
    });

    // Persistir: NCRE CERTIFIED + original CANCELLED + link cancelledById.
    const finalNcre = await prisma.$transaction(async (tx) => {
      const ncreFinal = await tx.taxDocument.update({
        where: { id: ncreDoc.id },
        data: {
          status: 'CERTIFIED',
          dteUuid: certifyResult.uuid,
          autorizacion: certifyResult.autorizacion,
          fechaCertificacion: certifyResult.fechaCertificacion,
          hashCertificacion: certifyResult.hashCertificacion,
          xmlFirmado: certifyResult.xmlFirmado,
          providerResponseJson: certifyResult.providerResponseRaw
            ? (certifyResult.providerResponseRaw as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      await tx.taxDocument.update({
        where: { id: original.id },
        data: {
          status: 'CANCELLED',
          cancelledById: ncreFinal.id,
          providerResponseJson: cancelResult.providerResponseRaw
            ? (cancelResult.providerResponseRaw as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      return ncreFinal;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'FEL_CANCEL',
      entity: 'TaxDocument',
      entityId: original.id,
      details: { ncreId: finalNcre.id, motivo: parsed.data.motivo },
    });

    return NextResponse.json({ ncre: finalNcre, originalId: original.id }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof FelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('FEL cancel error:', error);
    const message = error instanceof Error ? error.message : 'Error al anular DTE';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
