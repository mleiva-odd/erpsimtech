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

/**
 * POST /api/fel/certify/:saleId
 *
 * Certifica una venta ya creada (status=COMPLETED) emitiendo un DTE FACT
 * al provider configurado. Pasos:
 *   1. Valida que la venta no esté ya certificada.
 *   2. Reserva atómicamente correlativo en TaxSeries (lock optimista).
 *   3. Construye el CertifyInput a partir de la venta + items + emisor.
 *   4. Crea TaxDocument PENDING.
 *   5. Llama provider.certify().
 *   6. Si OK → marca CERTIFIED + retro-llena Sale.invoiceNumber = numeroDisplay.
 *   7. Si error → marca REJECTED y devuelve 502.
 *
 * Idempotente: si la venta ya tiene un TaxDocument CERTIFIED, devuelve 200
 * con el mismo documento.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const result = await requireOperationalPermission(['sales:view', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { saleId } = await params;

  try {
    // Cast del shape: Sale ahora incluye `taxDocument` y `customerNit/Name`,
    // pero el cliente Prisma generado no los conoce hasta `prisma generate`.
    const sale = (await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      include: ({
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, isTaxExempt: true } },
          },
        },
        taxDocument: true,
      } as unknown) as never,
    })) as
      | (Awaited<ReturnType<typeof prisma.sale.findFirst>> & {
          customerNit: string | null;
          customerName: string | null;
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
          taxDocument: { id: string; status: string } | null;
        })
      | null;

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    const branchCheck = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    if (sale.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Solo se pueden certificar ventas con status COMPLETED.' },
        { status: 400 },
      );
    }

    // Idempotencia: si ya está certificado, devolverlo.
    if (sale.taxDocument && sale.taxDocument.status === 'CERTIFIED') {
      return NextResponse.json({ alreadyCertified: true, taxDocument: sale.taxDocument });
    }

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
    if (!company?.taxRegime) {
      return NextResponse.json(
        { error: 'La empresa no tiene régimen tributario configurado.', code: 'TAX_REGIME_NOT_CONFIGURED' },
        { status: 400 },
      );
    }

    const emisorNit = settings?.felNitEmisor?.trim() || company.nit?.trim() || '';
    if (!emisorNit) {
      return NextResponse.json(
        {
          error:
            'No hay NIT del emisor configurado. Setealo en Settings → FEL → NIT Emisor o en la empresa.',
          code: 'EMISOR_NIT_MISSING',
        },
        { status: 400 },
      );
    }

    if (!settings) {
      return NextResponse.json(
        { error: 'Configuración FEL no encontrada en CompanySettings.' },
        { status: 400 },
      );
    }

    // Resolver provider antes de tocar DB (si falla, fail-fast).
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

    // Transacción: reservar correlativo + crear TaxDocument PENDING.
    const { taxDocument, certifyInput } = await prisma.$transaction(async (tx) => {
      const correlativo = await reserveCorrelativo(tx, {
        companyId: tenant.companyId,
        branchId: sale.branchId,
        documentType: 'FACT',
      });

      const items: FelItem[] = sale.items.map((it, idx) => {
        const lineGross = Number(it.unitPrice) * it.quantity;
        const lineDiscount = Number(it.discount ?? 0);
        const precio = Number(it.subtotal); // ya post-descuento, pre-IVA
        const taxRate = Number(it.taxRate ?? 0);
        const iva = Number(it.tax ?? 0);
        const total = precio + iva;
        void lineGross;
        return {
          numeroLinea: idx + 1,
          bienOServicio: 'B',
          codigoItem: it.product.sku,
          descripcion: it.product.name,
          cantidad: it.quantity,
          unidadMedida: 'UNI',
          precioUnitario: Number(it.unitPrice),
          descuento: lineDiscount,
          precio,
          taxRate,
          iva,
          total,
          isTaxExempt: it.product.isTaxExempt ?? false,
        };
      });

      const totalIva = items.reduce((s, i) => s + i.iva, 0);
      const totalGravado = items.filter((i) => !i.isTaxExempt).reduce((s, i) => s + i.precio, 0);
      const totalExento = items.filter((i) => i.isTaxExempt).reduce((s, i) => s + i.precio, 0);
      const granTotal = items.reduce((s, i) => s + i.total, 0);

      const certifyInputLocal: CertifyInput = {
        type: 'FACT',
        seriePrefix: correlativo.prefix,
        numero: correlativo.numero,
        fechaEmision: sale.createdAt,
        emisor: {
          nit: emisorNit,
          nombre: settings.storeName || company.name,
          codigoEstablecimiento: '1', // single-branch por ahora; futuro: branch.code
          direccion: settings.address ?? undefined,
          taxRegime: company.taxRegime!,
        },
        receptor: {
          nit: sale.customerNit ?? 'CF',
          nombre: sale.customerName ?? 'Consumidor Final',
        },
        items,
        totales: { granTotal, totalIva, totalGravado, totalExento },
        internalId: sale.id,
      };

      const created = await tx.taxDocument.create({
        data: {
          companyId: tenant.companyId,
          branchId: sale.branchId,
          seriesId: correlativo.seriesId,
          type: 'FACT',
          seriePrefix: correlativo.prefix,
          numero: correlativo.numero,
          numeroDisplay: correlativo.numeroDisplay,
          status: 'PENDING',
          receptorNit: certifyInputLocal.receptor.nit,
          receptorNombre: certifyInputLocal.receptor.nombre,
          emisorNit: certifyInputLocal.emisor.nit,
          emisorNombre: certifyInputLocal.emisor.nombre,
          taxRegime: company.taxRegime!,
          provider: settings.felProvider as 'MOCK' | 'INFILE' | 'DIGIFACT' | 'NONE',
          saleId: sale.id,
        },
      });

      return { taxDocument: created, certifyInput: certifyInputLocal };
    });

    // Llamada al provider FUERA de la $transaction (puede ser HTTP lento).
    const certifyResult = await provider.certify(certifyInput);

    if (!certifyResult.ok) {
      await prisma.taxDocument.update({
        where: { id: taxDocument.id },
        data: {
          status: 'REJECTED',
          providerResponseJson: certifyResult.providerResponseRaw
            ? (certifyResult.providerResponseRaw as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      return NextResponse.json(
        {
          error: `Provider rechazó la certificación: ${certifyResult.message}`,
          code: certifyResult.code,
        },
        { status: 502 },
      );
    }

    // Persistir CERTIFIED + actualizar Sale.invoiceNumber.
    const updated = await prisma.$transaction(async (tx) => {
      const td = await tx.taxDocument.update({
        where: { id: taxDocument.id },
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
      await tx.sale.update({
        where: { id: sale.id },
        data: { invoiceNumber: td.numeroDisplay },
      });
      return td;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'FEL_CERTIFY',
      entity: 'TaxDocument',
      entityId: updated.id,
      details: {
        saleId: sale.id,
        numeroDisplay: updated.numeroDisplay,
        uuid: updated.dteUuid,
        provider: updated.provider,
      },
    });

    return NextResponse.json({ taxDocument: updated }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof FelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('FEL certify error:', error);
    const message = error instanceof Error ? error.message : 'Error al certificar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
