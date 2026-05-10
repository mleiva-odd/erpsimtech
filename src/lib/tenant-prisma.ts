import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Cliente Prisma scoped a un tenant que setea `app.tenant_id` en cada
 * transacción para que las policies RLS de Postgres apliquen aislamiento
 * automático a nivel DB.
 *
 * Estado actual: PREPARATORIO. Por default, los handlers siguen usando
 * `prisma` directamente. Cuando se decida activar el role no-owner en
 * Vercel (rotando DATABASE_URL para usar `app_user`), todos los handlers
 * deben migrar a `forTenant(companyId)`.
 *
 * El switch implica:
 *   1. CREATE ROLE app_user LOGIN PASSWORD '<fuerte>'.
 *   2. GRANT USAGE ON SCHEMA public TO app_user;
 *      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
 *      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
 *   3. ALTER DEFAULT PRIVILEGES IN SCHEMA public
 *      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
 *   4. Cambiar DATABASE_URL en Vercel a la conexión via app_user.
 *   5. Reemplazar `prisma` por `forTenant(tenant.companyId)` en todos los
 *      handlers de API que necesiten queries scoped al tenant.
 *
 * Hasta entonces, este módulo existe pero no se usa en runtime.
 *
 * NOTA TÉCNICA: la única forma confiable de garantizar que `SET LOCAL
 * app.tenant_id` se aplique a las queries posteriores en pgbouncer/transaction
 * pooling es envolver TODO en una transacción explícita. Por eso `forTenant`
 * retorna helpers que internamente usan `$transaction`.
 */

export interface TenantScopedPrisma {
  /**
   * Ejecuta una serie de operaciones Prisma con `app.tenant_id` seteado.
   * Útil cuando necesitás encadenar varias queries o un único mutation
   * dentro del mismo contexto de tenant.
   */
  withTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;
}

/**
 * Devuelve un wrapper de Prisma que ejecuta cada operación en una
 * transacción con `SET LOCAL app.tenant_id = <companyId>`.
 *
 * Importante: el companyId DEBE venir de una sesión validada
 * (`tenant.companyId` después de `requireTenant`/`requirePermission`).
 * NO confiar en parámetros de URL ni body para este valor.
 */
export function forTenant(companyId: string): TenantScopedPrisma {
  if (!companyId || typeof companyId !== 'string') {
    throw new Error('forTenant: companyId requerido y debe ser string');
  }

  // Validación adicional: companyId debe parecer UUID para evitar SQL injection
  // a través del SET LOCAL (Prisma no parametriza el SET).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    throw new Error('forTenant: companyId no parece un UUID válido');
  }

  return {
    async withTx<T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: { timeout?: number },
    ): Promise<T> {
      return prisma.$transaction(
        async (tx) => {
          // SET LOCAL es seguro porque el valor está validado como UUID arriba.
          // Prisma.raw es necesario porque SET no acepta placeholders.
          await tx.$executeRawUnsafe(
            `SET LOCAL app.tenant_id = '${companyId}'`,
          );
          return fn(tx);
        },
        { timeout: options?.timeout ?? 10_000 },
      );
    },
  };
}

/**
 * Helper para verificar en runtime si el role actual de DB respeta RLS.
 * Útil para tests post-deploy del switch a app_user.
 */
export async function getCurrentDbRole(client: PrismaClient = prisma): Promise<{
  current_user: string;
  bypassrls: boolean;
}> {
  const rows = await client.$queryRaw<Array<{ current_user: string; bypassrls: boolean }>>`
    SELECT
      current_user::text AS current_user,
      (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls
  `;
  return rows[0] ?? { current_user: 'unknown', bypassrls: false };
}
