import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export interface TenantContext {
  userId: string;
  companyId: string;
  branchId: string | null;
  role: 'SUPER_ADMIN' | 'USER';
  customRoleName?: string;
  permissions: string[];
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
    customRoleName: session.user.customRoleName,
    permissions: session.user.permissions || [],
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
 * Requires authentication and an attached company context.
 * Super admins without a company should use global SaaS routes instead.
 */
export async function requireCompanyTenant(): Promise<
  { tenant: TenantContext } | { error: NextResponse }
> {
  const result = await requireTenant();
  if ('error' in result) return result;

  if (!result.tenant.companyId) {
    return {
      error: NextResponse.json(
        { error: 'Este recurso requiere una empresa activa en contexto' },
        { status: 403 }
      ),
    };
  }

  return result;
}

/**
 * Helper to check if a tenant has a specific permission.
 * SUPER_ADMIN has access to everything.
 * Users with the 'admin:all' (virtual) or specific permissions get access.
 */
export function hasPermission(tenant: TenantContext, permission: string): boolean {
  if (tenant.role === 'SUPER_ADMIN') return true;
  
  // Si el usuario tiene permisos absolutos por ser "ADMIN" clásico (migrado a todos los permisos)
  if (tenant.permissions.includes('admin:all')) return true;

  return tenant.permissions.includes(permission);
}

/**
 * Requires a specific permission to access an API route.
 * Replaces the old requireRole function.
 */
export async function requirePermission(permission: string): Promise<
  { tenant: TenantContext } | { error: NextResponse }
> {
  const result = await requireTenant();
  if ('error' in result) return result;

  if (!hasPermission(result.tenant, permission)) {
    return { error: NextResponse.json({ error: `Permiso denegado: se requiere ${permission}` }, { status: 403 }) };
  }

  return result;
}

/**
 * Admins are those who have settings:manage or are SUPER_ADMIN
 */
export function isAdminRole(tenant: TenantContext) {
  return tenant.role === 'SUPER_ADMIN' || tenant.permissions.includes('settings:manage');
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

  if (isAdminRole(tenant)) {
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

