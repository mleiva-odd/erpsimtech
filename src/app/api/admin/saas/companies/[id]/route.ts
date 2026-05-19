import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { hashPassword, validatePasswordStrength } from '@/lib/hashing';

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
            // @ts-expect-error lastLoginAt: regenerar Prisma client tras
            // este deploy para que el tipo lo incluya y borrar este comentario.
            lastLoginAt: true,
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
        lastLoginAt: Date | null;
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
        lastLoginAt: u.lastLoginAt,
      })),
      recentActivity: auditLog,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/saas/companies/[id] GET');
  }
}

/**
 * PATCH /api/admin/saas/companies/[id]
 *
 * Acciones administrativas sobre una empresa, solo SUPER_ADMIN:
 *
 *   - { action: 'suspend' }     → marca Company.active = false
 *   - { action: 'reactivate' }  → marca Company.active = true
 *   - { action: 'reset-user-password', userId, newPassword }
 *        → resetea la password de un usuario específico de la empresa.
 *          La password se valida con la política estándar (12 chars +
 *          may/min/dig/sim). Útil para soporte cuando un cliente
 *          pierde acceso (alternativa al forgot-password por email).
 *
 * Todas las acciones quedan registradas en AuditLog.
 */

const PatchBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('reactivate') }),
  z.object({
    action: z.literal('reset-user-password'),
    userId: z.string().uuid(),
    newPassword: z.string().min(12).max(256),
  }),
  z.object({
    action: z.literal('toggle-user-active'),
    userId: z.string().uuid(),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  if (tenant.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Solo SUPER_ADMIN puede modificar empresas' },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = PatchBody.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(400, 'Acción inválida o body mal formado');
    }
    const body = parsed.data;

    // Verificar que la empresa existe antes de actuar.
    const company = (await prisma.company.findUnique({
      where: { id },
      select: { id: true, name: true, active: true },
    })) as { id: string; name: string; active: boolean } | null;
    if (!company) throw new ApiError(404, 'Empresa no encontrada');

    if (body.action === 'suspend') {
      if (!company.active) {
        return NextResponse.json({ ok: true, alreadySuspended: true });
      }
      await prisma.company.update({
        where: { id },
        data: { active: false },
      });
      await createAuditLog({
        companyId: id,
        userId: tenant.userId,
        action: 'COMPANY_SUSPENDED',
        entity: 'Company',
        entityId: id,
        details: { suspendedBy: tenant.userId, suspendedByRole: tenant.role },
      });
      return NextResponse.json({ ok: true, action: 'suspend' });
    }

    if (body.action === 'reactivate') {
      if (company.active) {
        return NextResponse.json({ ok: true, alreadyActive: true });
      }
      await prisma.company.update({
        where: { id },
        data: { active: true },
      });
      await createAuditLog({
        companyId: id,
        userId: tenant.userId,
        action: 'COMPANY_SUSPENDED', // reusamos enum existente; details indica reactivación
        entity: 'Company',
        entityId: id,
        details: {
          reactivated: true,
          reactivatedBy: tenant.userId,
        },
      });
      return NextResponse.json({ ok: true, action: 'reactivate' });
    }

    if (body.action === 'toggle-user-active') {
      const user = (await prisma.user.findFirst({
        where: { id: body.userId, companyId: id },
        select: { id: true, active: true, email: true },
      })) as { id: string; active: boolean; email: string } | null;
      if (!user) {
        throw new ApiError(404, 'Usuario no pertenece a esta empresa');
      }
      const newActive = !user.active;
      await prisma.user.update({
        where: { id: user.id },
        data: { active: newActive },
      });
      await createAuditLog({
        companyId: id,
        userId: tenant.userId,
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: user.id,
        details: {
          toggledActiveByAdmin: true,
          newActive,
          toggledBy: tenant.userId,
        },
      });
      return NextResponse.json({
        ok: true,
        action: 'toggle-user-active',
        newActive,
      });
    }

    // reset-user-password
    const validation = validatePasswordStrength(body.newPassword);
    if (!validation.ok) {
      throw new ApiError(400, validation.errors.join(' '));
    }
    // El user debe pertenecer a esta empresa (defensa contra IDOR cruzados).
    const user = (await prisma.user.findFirst({
      where: { id: body.userId, companyId: id },
      select: { id: true, email: true },
    })) as { id: string; email: string } | null;
    if (!user) {
      throw new ApiError(404, 'Usuario no pertenece a esta empresa');
    }

    const newHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: newHash },
    });
    // Invalidar tokens de reset pendientes del usuario por seguridad.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await createAuditLog({
      companyId: id,
      userId: tenant.userId,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: user.id,
      details: {
        passwordResetByAdmin: true,
        resetBy: tenant.userId,
        resetByRole: tenant.role,
      },
    });

    return NextResponse.json({ ok: true, action: 'reset-user-password' });
  } catch (error) {
    return handleApiError(error, '/api/admin/saas/companies/[id] PATCH');
  }
}
