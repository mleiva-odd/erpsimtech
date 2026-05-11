-- Migración Prisma equivalente a prisma/manual_migrations/20260509_create_app_user_role_dormant.sql.
-- Estado: aplicada en producción el 2026-05-09. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260509130000_create_app_user_role_dormant
--
-- Crea el role `app_user` en estado NOLOGIN (DORMANTE). Para activarlo y
-- aislar tenants vía RLS, se completa con la migración hermana
-- `20260511000000_app_user_role_activation_ready` y luego el dueño hace
-- ALTER ROLE app_user LOGIN PASSWORD '<X>' en Supabase Dashboard. Ver
-- docs/operations/credentials-rotation.md.

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
