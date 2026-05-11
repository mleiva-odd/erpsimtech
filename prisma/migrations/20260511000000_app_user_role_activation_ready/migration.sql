-- Fase 13 — Endurecer y dejar listo el role app_user para activación.
-- Mismo contenido que prisma/manual_migrations/20260511000000_app_user_role_activation_ready.sql.
-- Pendiente de aplicar a Supabase. El dueño la aplica con:
--   prisma migrate deploy
-- o ejecutando el SQL directamente en Supabase SQL Editor.
--
-- NO setea password (eso lo hace el dueño manualmente con):
--   ALTER ROLE app_user LOGIN PASSWORD '<password-fuerte-32+chars>';

-- NOTA: Supabase Postgres administrado bloquea ALTER ROLE de atributos
-- (NOSUPERUSER/NOBYPASSRLS/etc) vía supautils. Pero los defaults de
-- Postgres después de `CREATE ROLE x NOLOGIN` ya son exactamente los
-- correctos para este caso: NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
-- NOBYPASSRLS, NOLOGIN. Por eso solo necesitamos crear + grants.
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

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
