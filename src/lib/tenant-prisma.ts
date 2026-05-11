import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Cliente Prisma scoped a un tenant que setea `app.tenant_id` en cada
 * transacción para que las policies RLS de Postgres apliquen aislamiento
 * automático a nivel DB.
 *
 * Estado actual (Fase 13): PREPARATORIO + extensión disponible. Por default,
 * los handlers siguen usando `prisma` directamente — la app sigue conectándose
 * como el role `postgres` que bypassea RLS, así que el comportamiento es
 * idéntico al previo. Cuando el dueño rote `DATABASE_URL` en Vercel para
 * apuntar al role `app_user` (no-owner, sin BYPASSRLS), todos los handlers
 * deben migrar a `forTenant(tenant.companyId).withTx(...)` o usar
 * `withTenantContext(tenant.companyId, async (tx) => {...})`.
 *
 * El switch implica:
 *   1. Crear password de `app_user` en Supabase Dashboard:
 *        ALTER ROLE app_user LOGIN PASSWORD '<password-fuerte>';
 *      (los grants ya están aplicados vía migration
 *      20260511000000_app_user_role_activation_ready).
 *   2. Rotar DATABASE_URL en Vercel a la conexión que usa app_user.
 *      DIRECT_URL sigue apuntando al role privilegiado para correr migrations.
 *   3. Migrar handlers a `withTenantContext`. Ver docs/audits/phase-13-completion.md.
 *
 * NOTA TÉCNICA: la única forma confiable de garantizar que `SET LOCAL
 * app.tenant_id` se aplique a las queries posteriores en pgbouncer/transaction
 * pooling es envolver TODO en una transacción explícita. Por eso `forTenant`
 * retorna helpers que internamente usan `$transaction`.
 */

// Patrón UUID v4 usado para validar companyId antes de inyectarlo en SET LOCAL.
// Prisma NO parametriza SET LOCAL, así que validamos el formato en aplicación.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!UUID_PATTERN.test(companyId)) {
    throw new Error('forTenant: companyId no parece un UUID válido');
  }

  return {
    async withTx<T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: { timeout?: number },
    ): Promise<T> {
      return prisma.$transaction(
        async (tx) => {
          // SET LOCAL es seguro porque el valor está validado como UUID estricto
          // arriba (línea ~35). Prisma.raw es necesario porque PostgreSQL
          // SET LOCAL no acepta placeholders parametrizados.
          // TODO: si alguna vez se afloja la validación UUID o Prisma soporta
          // SET con bind params, conmutar a $executeRaw para eliminar el
          // riesgo de inyección.
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

/**
 * Azúcar sintáctico encima de `forTenant(companyId).withTx(...)` para
 * llamarlo en una sola línea desde un handler ya autenticado.
 *
 * Uso recomendado en endpoints:
 *
 *   const result = await requireCompanyTenant();
 *   if ('error' in result) return result.error;
 *   const sales = await withTenantContext(result.tenant.companyId, (tx) =>
 *     tx.sale.findMany({ where: { ... } })
 *   );
 *
 * Importante: el companyId DEBE venir SIEMPRE de `tenant.companyId` tras
 * `requireTenant()`/`requireCompanyTenant()`/`requirePermission()`. NUNCA
 * tomarlo de un parámetro de URL, body o header — eso anularía la defensa.
 */
export async function withTenantContext<T>(
  companyId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  return forTenant(companyId).withTx(fn, options);
}

/**
 * Nota sobre `prisma.$extends({ query: ... })`:
 *
 * Se evaluó usar la API de Client Extensions de Prisma para envolver cada
 * operación de modelo con un `SET LOCAL app.tenant_id` automático. El
 * problema técnico es que la función `query` del extension está bound al
 * cliente base, no a un `tx` arbitrario: si se intenta correrla dentro de
 * un `$transaction` propio, la query igual usa una conexión distinta del
 * pool y el `SET LOCAL` no aplica al statement real. Con pgbouncer en
 * modo transaction pooling (Supabase pooled DSN), eso degenera en una
 * falsa sensación de seguridad: las queries siguen viendo todos los rows
 * porque el `SET LOCAL` quedó en otra sesión.
 *
 * Conclusión: el patrón seguro es agrupar TODAS las operaciones de un
 * request en una sola transacción explícita con `SET LOCAL` adentro. Eso
 * lo provee `forTenant(companyId).withTx(...)` y el alias
 * `withTenantContext(companyId, fn)` definido arriba. Cuando se haga el
 * switch al role `app_user`, hay que migrar los handlers a este patrón.
 *
 * Si en el futuro Prisma ofrece un hook que garantice misma conexión, se
 * agrega acá un `tenantExtendedPrisma(companyId)` que devuelva un cliente
 * drop-in. Por ahora NO se exporta para no inducir bugs.
 */
