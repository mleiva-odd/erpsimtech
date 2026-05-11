-- Fase 13 (Foundation) — Endurecer y dejar listo el role `app_user` para activación.
-- Fecha: 2026-05-11. NO se aplicó automáticamente desde el sandbox (sin red a Supabase).
-- Esta migración la corre el dueño en Supabase (SQL Editor) DESPUÉS de aceptar
-- el plan de rotación de DATABASE_URL.
--
-- Pasos manuales que hace esta migración:
--   1. Re-asegura que el role exista y NO sea SUPERUSER ni tenga BYPASSRLS.
--   2. Re-aplica grants idempotentes sobre todas las tablas del schema public
--      (por si se crearon tablas después de la baseline original sin que se
--      heredaran los grants del default privileges).
--   3. Se asegura del default privileges para tablas y secuencias futuras.
--
-- IMPORTANTE: el password de `app_user` NO se setea acá (no se commitea en
-- repo). El dueño lo configura desde Supabase con:
--   ALTER ROLE app_user LOGIN PASSWORD '<password-fuerte-32+chars>';
-- y luego rota DATABASE_URL en Vercel a la conexión que usa app_user.

-- 1. Garantizar que el role exista y tenga las propiedades correctas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- Crear como NOLOGIN; el dueño lo cambia a LOGIN al activarlo.
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Defensa contra escalado accidental: nos aseguramos que el role
-- NO tenga BYPASSRLS, NO sea SUPERUSER, NO tenga CREATEROLE/CREATEDB.
-- Si alguno está activo, lo apagamos.
ALTER ROLE app_user
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- 2. Grants idempotentes sobre el schema y tablas/secuencias actuales.
GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO app_user;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- 3. Default privileges para que tablas/secuencias creadas por `postgres`
-- (owner) en el futuro hereden automáticamente los grants. CRÍTICO porque
-- cada migración nueva crea tablas con owner `postgres`.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- 4. Verificación: dejar registrado el estado en pg_roles para auditoría.
-- Ejecutá manualmente después:
--   SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
--     FROM pg_roles WHERE rolname = 'app_user';
-- Expected:
--   app_user | f | f | f   (antes de activar)
--   app_user | f | f | t   (después de ALTER ROLE app_user LOGIN PASSWORD '...')
