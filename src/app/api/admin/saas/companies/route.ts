import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * GET /api/admin/saas/companies
 *
 * Vista global para SUPER_ADMIN (Marvin / dueño del SaaS). Lista TODAS
 * las empresas registradas con métricas operativas básicas: # usuarios,
 * # sucursales, # ventas mes actual, # payrolls mes actual, estado de
 * suscripción.
 *
 * Soporta filtro por ?search=<texto> que matchea name/email/slug.
 *
 * NO confundir con /api/users (que filtra por companyId del tenant).
 * Este endpoint es global y solo accesible para SUPER_ADMIN.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  nit: string | null;
  active: boolean;
  createdAt: Date;
  branches: number;
  users: number;
  salesThisMonth: number;
  payrollsThisMonth: number;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();

  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  if (tenant.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Solo SUPER_ADMIN puede ver el directorio global' },
      { status: 403 },
    );
  }

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Una sola query con _count + relations; suficiente para volúmenes
    // de cliente pequeños (decenas/cientos). Si crece, paginamos.
    const companies = (await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        nit: true,
        active: true,
        createdAt: true,
        _count: {
          select: {
            branches: true,
            users: true,
          },
        },
        subscription: {
          select: {
            status: true,
            trialEndsAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })) as Array<{
      id: string;
      name: string;
      slug: string;
      email: string;
      nit: string | null;
      active: boolean;
      createdAt: Date;
      _count: { branches: number; users: number };
      subscription: { status: string; trialEndsAt: Date | null } | null;
    }>;

    // Métricas por mes — agrupadas para evitar N+1.
    const companyIds = companies.map((c) => c.id);

    const [salesByCompany, payrollsByCompany] = await Promise.all([
      prisma.sale.groupBy({
        by: ['companyId'],
        where: {
          companyId: { in: companyIds },
          createdAt: { gte: startOfMonth },
        },
        _count: { _all: true },
      }),
      prisma.payroll.groupBy({
        by: ['companyId'],
        where: {
          companyId: { in: companyIds },
          createdAt: { gte: startOfMonth },
        },
        _count: { _all: true },
      }),
    ]);

    type GroupRow = { companyId: string; _count: { _all: number } };
    const salesMap = new Map(
      (salesByCompany as GroupRow[]).map((s) => [s.companyId, s._count._all]),
    );
    const payrollsMap = new Map(
      (payrollsByCompany as GroupRow[]).map((p) => [p.companyId, p._count._all]),
    );

    const rows: CompanyRow[] = companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      email: c.email,
      nit: c.nit,
      active: c.active,
      createdAt: c.createdAt,
      branches: c._count.branches,
      users: c._count.users,
      salesThisMonth: salesMap.get(c.id) ?? 0,
      payrollsThisMonth: payrollsMap.get(c.id) ?? 0,
      subscriptionStatus: c.subscription?.status ?? null,
      trialEndsAt: c.subscription?.trialEndsAt ?? null,
    }));

    return NextResponse.json({
      total: rows.length,
      companies: rows,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/saas/companies GET');
  }
}
