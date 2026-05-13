-- Audit decisiones (Fases 14-21) · Crítico #1 + Crítico #2.
--
-- Convierte 2 decisiones que estaban hardcodeadas en preferencia del SaaS
-- en config por empresa, sin romper compatibilidad con tenants existentes
-- (defaults preservan el comportamiento actual).
--
-- Cambios:
--   1. CREATE TYPE "CostMethod" enum (WAC | FIFO) idempotente con DO block.
--      Lección Fase 17 SqlState 55P04: no se puede usar el value en la misma
--      migración. Pero acá solo creamos la columna con default 'WAC' que ya
--      es el primer valor del enum recién creado — Postgres lo permite porque
--      el default es literal del CREATE TYPE statement.
--   2. ALTER TABLE Company ADD COLUMN costMethod (default WAC).
--   3. ALTER TABLE Company ADD COLUMN agingBucketDays Int[] default {30,60,90}.
--
-- Idempotente: re-aplicar no rompe. Sin RLS adicional (la company ya tiene
-- policy de Fase 13).

-- ─────────────────────────────────────────
-- 1) CostMethod enum
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CostMethod" AS ENUM ('WAC', 'FIFO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) Columnas nuevas en Company
-- ─────────────────────────────────────────

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "costMethod" "CostMethod" NOT NULL DEFAULT 'WAC';

-- agingBucketDays: array de integers con default 30/60/90.
-- Postgres native array literal: '{30,60,90}'.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "agingBucketDays" INTEGER[] NOT NULL DEFAULT ARRAY[30, 60, 90];

-- ─────────────────────────────────────────
-- 3) Backfill defensivo (idempotente)
-- ─────────────────────────────────────────
-- Las columnas se crean con default, así que tenants existentes quedan en
-- 'WAC' y [30,60,90] automáticamente. Pero ejecutamos un UPDATE explícito
-- por defensa contra DBs raras donde el default no se aplicó.

UPDATE "Company"
SET "costMethod" = 'WAC'
WHERE "costMethod" IS NULL;

UPDATE "Company"
SET "agingBucketDays" = ARRAY[30, 60, 90]
WHERE "agingBucketDays" IS NULL OR cardinality("agingBucketDays") = 0;
