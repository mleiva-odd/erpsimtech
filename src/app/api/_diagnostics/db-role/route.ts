import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/tenant';
import { getCurrentDbRole } from '@/lib/tenant-prisma';

// Endpoint de diagnóstico Fase 13 — usado para verificar QUÉ role de Postgres
// está conectado en runtime. Crítico para validar el switch a `app_user`
// (DATABASE_URL apuntando al role no-owner sin BYPASSRLS).
//
// Solo accesible para usuarios con permiso `settings:manage` (admins
// del tenant o SUPER_ADMIN). No expone secretos — solo nombre del role.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;

  try {
    const info = await getCurrentDbRole();
    return NextResponse.json({
      current_user: info.current_user,
      bypassrls: info.bypassrls,
      // Banner visual para el dashboard de operaciones.
      tenant_isolation_active: !info.bypassrls,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'No se pudo determinar el role de DB',
        details: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
