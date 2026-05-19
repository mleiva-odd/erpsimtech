import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';

/**
 * GET /api/admin/saas/companies/[id]
 *
 * Detalle de una empresa para SUPER_ADMIN. Devuelve info básica,
 * suscripción, users, sucursales con sus ventas del mes en curso y los
 * últimos 20 eventos de auditoría.
 *
 * Rechaza con 403 a cualquiera que no sea SUPER_ADMIN. No filtra por
 * companyId del tenant — es vista global del SaaS.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  if (tenant.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Solo SUPER_ADMIN puede ver el detalle global de empresas' },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const company = (await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        nit: true,
        phone: true,
        active: true,
        logoUrl: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          select: {
            status: true,
            plan: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
          },
        },
        branches: {
          select: { id: true, name: true, code: true, address: true },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            createdAt: true,
            customRole: { select: { name: true } },
            branch: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })) as {
      id: string;
      name: string;
      slug: string;
      email: string;
      nit: string | null;
      phone: string | null;
      active: boolean;
      logoUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
      subscription: {
        status: string;
        plan: string;
        trialEndsAt: Date | null;
        currentPeriodEnd: Date | null;
      } | null;
      branches: Array<{ id: string; name: string; code: string; address: string | null }>;
      users: Array<{
        id: string;
        name: string;
        email: string;
        role: string;
        active: boolean;
        createdAt: Date;
        customRole: { name: string } | null;
        branch: { name: string } | null;
      }>;
    } | null;

    if (!company) throw new ApiError(404, 'Empresa no encontrada');

    // Métricas mes para cada sucursal en paralelo.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const branchIds = company.branches.map((b) => b.id);
    const salesByBranchRaw = await prisma.sale.groupBy({
      by: ['branchId'],
      where: {
        branchId: { in: branchIds },
        createdAt: { gte: startOfMonth },
      },
      _count: { _all: true },
      _sum: { total: true },
    });

    type SaleGroupRow = {
      branchId: string;
      _count: { _all: number };
      _sum: { total: unknown };
    };
    const salesByBranchMap = new Map(
      (salesByBranchRaw as SaleGroupRow[]).map((s) => [
        s.branchId,
        { count: s._count._all, total: Number(s._sum.total) || 0 },
      ]),
    );

    const branchesWithMetrics = company.branches.map((b) => ({
      ...b,
      salesThisMonth: salesByBranchMap.get(b.id)?.count ?? 0,
      salesAmountThisMonth: salesByBranchMap.get(b.id)?.total ?? 0,
    }));

    // Últimos 20 eventos de auditoría de esta empresa.
    const auditLog = (await prisma.auditLog.findMany({
      where: { companyId: id },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })) as Array<{
      id: string;
      action: string;
      entity: string;
      entityId: string;
      createdAt: Date;
      user: { name: string; email: string } | null;
    }>;

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        email: company.email,
        nit: company.nit,
        phone: company.phone,
        active: company.active,
        logoUrl: company.logoUrl,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
      subscription: company.subscription,
      branches: branchesWithMetrics,
      users: company.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        customRoleName: u.customRole?.name ?? null,
        branchName: u.branch?.name ?? null,
        active: u.active,
        createdAt: u.createdAt,
      })),
      recentActivity: auditLog,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/saas/companies/[id] GET');
  }
}
