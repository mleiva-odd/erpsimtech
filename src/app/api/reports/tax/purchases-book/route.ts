import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { parse } from 'json2csv';

/**
 * GET /api/reports/tax/purchases-book?from=&to=&format=json|csv
 *
 * Libro de Compras SAT — Fase 16.
 *
 * Por ahora no existe modelo `SupplierTaxDocument` espejo de `TaxDocument`
 * (compras certificadas FEL son DTE emitidos por proveedores, recibidos por
 * nosotros). La fuente acá es `PurchaseOrder` + `Supplier.nit` con totales.
 *
 * Columnas (estándar SAT):
 *   Fecha emisión, NIT proveedor, Nombre proveedor, Tipo doc, Serie, Número,
 *   NúmeroAutorización, BienServicio, ExentoNoAfecto, AfectoIVA, IVA crédito,
 *   Total, Moneda, Estado.
 *
 * IMPORTANTE: hoy `PurchaseOrderItem` no tiene desglose de IVA. Esta versión
 * reporta tax=0 hasta que Fase 19 (compras enterprise) introduzca FEL receipt.
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const format = (searchParams.get('format') || 'json').toLowerCase();

  const startDate = from
    ? new Date(from)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = to ? new Date(to) : new Date();
  endDate.setHours(23, 59, 59, 999);

  try {
    const purchases = await prisma.purchaseOrder.findMany({
      where: {
        companyId: tenant.companyId,
        status: { in: ['COMPLETED', 'CANCELLED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        supplier: { select: { name: true, nit: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = purchases.map((p) => {
      const totalNum = Number(p.total);
      // Sin desglose tributario por compra todavía: reportamos total como
      // gravable y tax=0. Fase 19 lo refina.
      return {
        fechaEmision: p.createdAt.toISOString().split('T')[0],
        nitProveedor: p.supplier.nit ?? 'NA',
        nombreProveedor: p.supplier.name,
        tipoDocumento: 'FACT',
        serie: '',
        numero: '',
        numeroAutorizacion: p.reference ?? '',
        bienServicio: 'B',
        exentoNoAfecto: 0,
        afectoIVA: totalNum,
        ivaCredito: 0,
        total: totalNum,
        moneda: 'GTQ',
        estado: p.status,
      };
    });

    if (format === 'csv') {
      const fields = [
        'fechaEmision',
        'nitProveedor',
        'nombreProveedor',
        'tipoDocumento',
        'serie',
        'numero',
        'numeroAutorizacion',
        'bienServicio',
        'exentoNoAfecto',
        'afectoIVA',
        'ivaCredito',
        'total',
        'moneda',
        'estado',
      ];
      const csv = parse(rows, { fields });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="libro-compras-${startDate
            .toISOString()
            .split('T')[0]}-${endDate.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      count: rows.length,
      rows,
      note:
        'Fase 16: desglose tributario por compra pendiente hasta Fase 19 (recibo FEL de proveedor). Hoy IVA crédito = 0.',
    });
  } catch (error) {
    console.error('Purchases book report error:', error);
    return NextResponse.json({ error: 'Error al generar Libro de Compras' }, { status: 500 });
  }
}
