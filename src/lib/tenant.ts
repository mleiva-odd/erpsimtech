import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export interface TenantContext {
  userId: string;
  companyId: string;
  branchId: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CASHIER';
}

/**
 * Gets the current tenant context from the session.
 * Use this in every API route to ensure data isolation.
 * 
 * @returns TenantContext with companyId and branchId for data filtering
 * @throws Returns null if not authenticated
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return {
    userId: session.user.id,
    companyId: session.user.companyId,
    branchId: session.user.branchId,
    role: session.user.role,
  };
}

/**
 * Requires authentication and returns tenant context.
 * Returns a NextResponse error if not authenticated.
 */
export async function requireTenant(): Promise<
  { tenant: TenantContext } | { error: NextResponse }
> {
  const tenant = await getTenantContext();

  if (!tenant) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  if (!tenant.companyId && tenant.role !== 'SUPER_ADMIN') {
    return { error: NextResponse.json({ error: 'Usuario sin empresa asignada' }, { status: 403 }) };
  }

  return { tenant };
}

/**
 * Requires a specific role or higher.
 * Role hierarchy: SUPER_ADMIN > ADMIN > SUPERVISOR > CASHIER
 */
export async function requireRole(minRole: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CASHIER'): Promise<
  { tenant: TenantContext } | { error: NextResponse }
> {
  const result = await requireTenant();
  if ('error' in result) return result;

  const hierarchy = ['CASHIER', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'];
  const userLevel = hierarchy.indexOf(result.tenant.role);
  const requiredLevel = hierarchy.indexOf(minRole);

  if (userLevel < requiredLevel) {
    return { error: NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }) };
  }

  return result;
}

export function isAdminRole(role: TenantContext['role']) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Ensures the tenant can operate on the provided branch.
 * Admins may access any branch within their company. Other roles are limited to their assigned branch.
 */
export async function requireBranchAccess(
  tenant: TenantContext,
  branchId: string | null | undefined
): Promise<{ branchId: string | null | undefined } | { error: NextResponse }> {
  if (!branchId) {
    return { branchId };
  }

  if (isAdminRole(tenant.role)) {
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId: tenant.companyId,
      },
      select: { id: true },
    });

    if (!branch) {
      return { error: NextResponse.json({ error: 'Sucursal no encontrada o fuera de tu empresa' }, { status: 403 }) };
    }

    return { branchId: branch.id };
  }

  if (tenant.branchId !== branchId) {
    return { error: NextResponse.json({ error: 'Acceso denegado a la sucursal solicitada' }, { status: 403 }) };
  }

  return { branchId };
}
