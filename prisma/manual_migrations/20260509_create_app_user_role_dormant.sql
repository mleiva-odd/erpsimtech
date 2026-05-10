-- Sprint 2.C.2 (preparación) — crear el role app_user DORMANTE.
-- Status: APPLIED to Supabase project cfluozcpcrqfapqwquip on 2026-05-09 via MCP.
-- Migration name: create_app_user_role_dormant
--
-- Estado: NOLOGIN. No puede conectar hoy. Cuando lo activés (ALTER ROLE
-- app_user LOGIN PASSWORD 'X'), sus queries respetan automáticamente las
-- policies tenant_isolation creadas en la migración previa porque NO es
-- owner del schema y por lo tanto NO tiene BYPASSRLS.
--
-- Para ACTIVAR el aislamiento real:
--   1. ALTER ROLE app_user LOGIN PASSWORD '<contraseña-fuerte>';
--   2. Update DATABASE_URL en Vercel a:
--        postgresql://app_user:<password>@<host>:5432/postgres?...
--   3. Migrar handlers a usar src/lib/tenant-prisma.ts:
--        forTenant(companyId).withTx(async (tx) => { ... })
--      que setea SET LOCAL app.tenant_id = '<companyId>' antes de cada query.
--   4. Validar en preview de Vercel:
--        - Login + venta de prueba.
--        - Otra empresa no ve la primera (tests cross-tenant en e2e/).
--   5. Promover a producción.
--
-- DESACTIVACIÓN rápida (rollback):
--   ALTER ROLE app_user NOLOGIN;
--   Restaurar DATABASE_URL al role postgres en Vercel.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO app_user;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
