import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

/**
 * Reporte de Valuación de Inventario
 * Permite conocer el valor monetario de la mercadería en stock.
 */
export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get('branchId');

    const stocks = await prisma.productStock.findMany({
      where: {
        product: { companyId: tenant.companyId, active: true },
        ...(branchId && branchId !== 'all' && { branchId }),
      },
      include: {
        product: {
          select: {
            name: true,
            sku: true,
            price: true,
            cost: true,
            category: { select: { name: true } }
          }
        },
        variant: {
          select: {
            name: true,
            price: true,
            cost: true
          }
        },
        branch: { select: { name: true } }
      }
    });

    let totalInvestment = 0;
    let totalExpectedRevenue = 0;
    let totalItems = 0;

    const valuationByBranch: Record<string, any> = {};
    const valuationByCategory: Record<string, any> = {};

    stocks.forEach(s => {
      const price = Number(s.variant?.price || s.product.price);
      const cost = Number(s.variant?.cost || s.product.cost);
      
      const invValue = cost * s.quantity;
      const revValue = price * s.quantity;

      totalInvestment += invValue;
      totalExpectedRevenue += revValue;
      totalItems += s.quantity;

      // Group by Branch
      if (!valuationByBranch[s.branch.name]) {
        valuationByBranch[s.branch.name] = { investment: 0, revenue: 0, items: 0 };
      }
      valuationByBranch[s.branch.name].investment += invValue;
      valuationByBranch[s.branch.name].revenue += revValue;
      valuationByBranch[s.branch.name].items += s.quantity;

      // Group by Category
      const catName = s.product.category?.name || 'Sin Categoría';
      if (!valuationByCategory[catName]) {
        valuationByCategory[catName] = { investment: 0, revenue: 0, items: 0 };
      }
      valuationByCategory[catName].investment += invValue;
      valuationByCategory[catName].revenue += revValue;
      valuationByCategory[catName].items += s.quantity;
    });

    return NextResponse.json({
      summary: {
        totalItems,
        totalInvestment,
        totalExpectedRevenue,
        potentialProfit: totalExpectedRevenue - totalInvestment,
        margin: totalExpectedRevenue > 0 ? ((totalExpectedRevenue - totalInvestment) / totalExpectedRevenue) * 100 : 0
      },
      byBranch: valuationByBranch,
      byCategory: valuationByCategory
    });
  } catch (error) {
    console.error('Valuation Error:', error);
    return NextResponse.json({ error: 'Error generating valuation' }, { status: 500 });
  }
}
