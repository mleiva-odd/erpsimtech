-- Migración Prisma equivalente a prisma/manual_migrations/20260509_add_login_attempt_for_rate_limit.sql.
-- Estado: aplicada en producción el 2026-05-09. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260509100000_add_login_attempt_for_rate_limit
--
-- Tabla que registra cada intento (exitoso o fallido) para poder contar en una
-- ventana móvil de 15 minutos. NO contiene la contraseña intentada — solo
-- email, IP y resultado. RLS deny-all para anon (no tiene companyId, es pre-auth).

CREATE TABLE IF NOT EXISTS public."LoginAttempt" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  "ipAddress" text NOT NULL,
  success     boolean NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "LoginAttempt_email_createdAt_idx"
  ON public."LoginAttempt" ("email", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "LoginAttempt_ipAddress_createdAt_idx"
  ON public."LoginAttempt" ("ipAddress", "createdAt" DESC);

ALTER TABLE public."LoginAttempt" ENABLE ROW LEVEL SECURITY;
