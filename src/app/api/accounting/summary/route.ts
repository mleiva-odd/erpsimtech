import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const months = parseInt(searchParams.get('months') ?? '6');
  const branchId = searchParams.get('branchId');

  const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');
  const targetBranch = (!isAdmin || !branchId || branchId === 'null') ? tenant.branchId : branchId;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startOfRange = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const baseWhere: Record<string, unknown> = { companyId: tenant.companyId };
  if (targetBranch) baseWhere.branchId = targetBranch;

  try {
    // Current month totals
    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.accountingEntry.aggregate({
        where: { ...baseWhere, type: 'INCOME', date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      prisma.accountingEntry.aggregate({
        where: { ...baseWhere, type: 'EXPENSE', date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    const monthlyIncome = Number(incomeAgg._sum.amount || 0);
    const monthlyExpense = Number(expenseAgg._sum.amount || 0);

    // Accounts receivable (customer balances)
    const receivablesAgg = await prisma.customer.aggregate({
      where: { companyId: tenant.companyId, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: true,
    });

    // Accounts payable
    const payablesAgg = await prisma.supplierPayable.aggregate({
      where: { companyId: tenant.companyId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    });
    const totalPayable = Number(payablesAgg._sum.totalAmount || 0) - Number(payablesAgg._sum.paidAmount || 0);

    // Monthly series for chart
    const monthlyEntries = await prisma.accountingEntry.findMany({
      where: { ...baseWhere, date: { gte: startOfRange, lte: endOfMonth } },
      select: { type: true, amount: true, date: true },
    });

    const monthlyData: Record<string, { income: number; expense: number }> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { income: 0, expense: 0 };
    }

    for (const entry of monthlyEntries) {
      const d = new Date(entry.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        if (entry.type === 'INCOME') monthlyData[key].income += Number(entry.amount);
        else monthlyData[key].expense += Number(entry.amount);
      }
    }

    const monthlySeries = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      ...data,
      net: data.income - data.expense,
    }));

    // Expense breakdown by category (current month)
    const expenseByCategory = await prisma.accountingEntry.groupBy({
      by: ['categoryId'],
      where: { ...baseWhere, type: 'EXPENSE', date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true },
    });

    const categories = await prisma.accountingCategory.findMany({
      where: { companyId: tenant.companyId },
      select: { id: true, name: true, type: true },
    });

    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const expenseBreakdown = expenseByCategory.map(e => ({
      category: categoryMap[e.categoryId] || 'Sin categoría',
      amount: Number(e._sum.amount || 0),
    })).sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      monthlyIncome,
      monthlyExpense,
      netIncome: monthlyIncome - monthlyExpense,
      receivables: Number(receivablesAgg._sum.balance || 0),
      receivablesCount: receivablesAgg._count,
      payables: totalPayable,
      payablesCount: payablesAgg._count,
      monthlySeries,
      expenseBreakdown,
    });
  } catch (error) {
    console.error('Error in accounting summary:', error);
    return NextResponse.json({ error: 'Error cargando resumen contable' }, { status: 500 });
  }
}
