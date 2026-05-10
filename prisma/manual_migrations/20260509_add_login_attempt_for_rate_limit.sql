-- Sprint 2.B.2 — Rate limit de login.
-- Status: APPLIED to Supabase project cfluozcpcrqfapqwquip on 2026-05-09 via MCP.
-- Migration name: add_login_attempt_for_rate_limit
--
-- Tabla que registra cada intento (exitoso o fallido) para poder contar
-- en una ventana móvil de 15 minutos. Indexada por (email, createdAt) y
-- (ipAddress, createdAt) para que las consultas de conteo sean rápidas.
--
-- NO contiene la contraseña intentada — solo email, IP y resultado.
-- Los registros >24h pueden eliminarse en un cron posterior (Sprint 6).

CREATE TABLE public."LoginAttempt" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  "ipAddress" text NOT NULL,
  success     boolean NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX "LoginAttempt_email_createdAt_idx"
  ON public."LoginAttempt" ("email", "createdAt" DESC);

CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx"
  ON public."LoginAttempt" ("ipAddress", "createdAt" DESC);

ALTER TABLE public."LoginAttempt" ENABLE ROW LEVEL SECURITY;
