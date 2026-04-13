import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { parse } from 'json2csv';

/**
 * Reporte de Ventas y Rentabilidad (Utilidad)
 * Permite analizar ingresos vs costos por periodo y sucursal.
 */
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const branchId = searchParams.get('branchId');
    const exportFormat = searchParams.get('export');

    const startDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const where: any = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (branchId && branchId !== 'all') {
      where.branchId = branchId;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { name: true, sku: true } },
            variant: { select: { name: true } },
          }
        },
        user: { select: { name: true } },
        branch: { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcular Métricas
    let totalRevenue = 0;
    let totalCost = 0;
    let totalTransactions = sales.length;

    const detailedData = sales.flatMap(sale => 
      sale.items.map(item => {
        const revenue = Number(item.subtotal);
        const cost = Number(item.unitCost || 0) * item.quantity;
        const profit = revenue - cost;
        
        totalRevenue += revenue;
        totalCost += cost;

        return {
          fecha: sale.createdAt.toISOString().split('T')[0],
          ticket: sale.invoiceNumber || sale.id.substring(0, 8),
          vendedor: sale.user.name,
          sucursal: sale.branch.name,
          cliente: sale.customer?.name || 'Consumidor Final',
          producto: item.product.name + (item.variant ? ` (${item.variant.name})` : ''),
          sku: item.product.sku,
          cantidad: item.quantity,
          precio_unitario: Number(item.unitPrice),
          costo_unitario: Number(item.unitCost || 0),
          total_venta: revenue,
          total_costo: cost,
          utilidad: profit,
          margen_porcentaje: revenue > 0 ? (profit / revenue) * 100 : 0
        };
      })
    );

    const summary = {
      periodo: { desde: startDate, hasta: endDate },
      totalRevenue,
      totalCost,
      grossProfit: totalRevenue - totalCost,
      marginPercentage: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
      totalTransactions,
      averageTicket: totalTransactions > 0 ? totalRevenue / totalTransactions : 0
    };

    if (exportFormat === 'csv') {
      const csv = parse(detailedData);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=reporte_ventas_${startDate.toISOString().split('T')[0]}.csv`,
        },
      });
    }

    return NextResponse.json({ summary, data: detailedData });
  } catch (error) {
    console.error('Report Error:', error);
    return NextResponse.json({ error: 'Error generating report' }, { status: 500 });
  }
}
