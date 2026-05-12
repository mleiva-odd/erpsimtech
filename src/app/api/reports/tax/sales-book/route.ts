import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { parse } from 'json2csv';

/**
 * GET /api/reports/tax/sales-book?from=&to=&format=json|csv
 *
 * Libro de Ventas SAT — Fase 16.
 *
 * Columnas (estándar SAT):
 *   Fecha emisión, NIT receptor, Nombre receptor, Tipo doc, Serie, Número,
 *   NúmeroAutorización (UUID), BienServicio, ExentoNoAfecto, AfectoIVA,
 *   IVA, Total, Moneda, Estado.
 *
 * Fuente: `TaxDocument` con status in (CERTIFIED, CANCELLED) y tipo FACT/NCRE/NDEB.
 * Acepta cualquier formato `format=json` (default) o `format=csv`.
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
    const docs = await prisma.taxDocument.findMany({
      where: {
        companyId: tenant.companyId,
        status: { in: ['CERTIFIED', 'CANCELLED'] },
        fechaCertificacion: { gte: startDate, lte: endDate },
      },
      include: {
        sale: { select: { id: true, subtotal: true, tax: true, total: true } },
        creditNote: { select: { id: true, subtotal: true, tax: true, total: true } },
        debitNote: { select: { id: true, subtotal: true, tax: true, total: true } },
      },
      orderBy: { fechaCertificacion: 'asc' },
    });

    const rows = docs.map((d) => {
      let subtotalNum = 0;
      let taxNum = 0;
      let totalNum = 0;
      if (d.sale) {
        subtotalNum = Number(d.sale.subtotal);
        taxNum = Number(d.sale.tax);
        totalNum = Number(d.sale.total);
      } else if (d.creditNote) {
        subtotalNum = Number(d.creditNote.subtotal);
        taxNum = Number(d.creditNote.tax);
        totalNum = Number(d.creditNote.total);
      } else if (d.debitNote) {
        subtotalNum = Number(d.debitNote.subtotal);
        taxNum = Number(d.debitNote.tax);
        totalNum = Number(d.debitNote.total);
      }
      const isExempt = taxNum === 0;

      return {
        fechaEmision: d.fechaCertificacion?.toISOString().split('T')[0] ?? '',
        nitReceptor: d.receptorNit,
        nombreReceptor: d.receptorNombre,
        tipoDocumento: d.type,
        serie: d.seriePrefix,
        numero: d.numero,
        numeroAutorizacion: d.dteUuid ?? '',
        bienServicio: 'B', // por simplicidad — el detalle bienServicio está a nivel de Item, no agregado
        exentoNoAfecto: isExempt ? subtotalNum : 0,
        afectoIVA: isExempt ? 0 : subtotalNum,
        iva: taxNum,
        total: totalNum,
        moneda: 'GTQ',
        estado: d.status,
      };
    });

    if (format === 'csv') {
      const fields = [
        'fechaEmision',
        'nitReceptor',
        'nombreReceptor',
        'tipoDocumento',
        'serie',
        'numero',
        'numeroAutorizacion',
        'bienServicio',
        'exentoNoAfecto',
        'afectoIVA',
        'iva',
        'total',
        'moneda',
        'estado',
      ];
      const csv = parse(rows, { fields });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="libro-ventas-${startDate
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
    });
  } catch (error) {
    console.error('Sales book report error:', error);
    return NextResponse.json({ error: 'Error al generar Libro de Ventas' }, { status: 500 });
  }
}
