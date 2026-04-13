import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

/**
 * Reporte de Ranking de Productos (Análisis ABC)
 * Identifica los productos más vendidos y los más rentables.
 */
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '10');

    const startDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const items = await prisma.saleItem.findMany({
      where: {
        sale: {
          companyId: tenant.companyId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate }
        }
      },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { select: { name: true } }
      }
    });

    const productStats: Record<string, any> = {};

    items.forEach(item => {
      const key = item.variantId ? `${item.productId}-${item.variantId}` : item.productId;
      if (!productStats[key]) {
        productStats[key] = {
          name: item.product.name + (item.variant ? ` (${item.variant.name})` : ''),
          sku: item.product.sku,
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0
        };
      }

      const rev = Number(item.subtotal);
      const cst = Number(item.unitCost || 0) * item.quantity;

      productStats[key].quantity += item.quantity;
      productStats[key].revenue += rev;
      productStats[key].cost += cst;
      productStats[key].profit += (rev - cst);
    });

    const statsArray = Object.values(productStats);

    const topByQuantity = [...statsArray].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
    const topByRevenue = [...statsArray].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
    const topByProfit = [...statsArray].sort((a, b) => b.profit - a.profit).slice(0, limit);

    return NextResponse.json({
      periodo: { desde: startDate, hasta: endDate },
      topByQuantity,
      topByRevenue,
      topByProfit
    });
  } catch (error) {
    console.error('Top Products Error:', error);
    return NextResponse.json({ error: 'Error generating top products' }, { status: 500 });
  }
}
