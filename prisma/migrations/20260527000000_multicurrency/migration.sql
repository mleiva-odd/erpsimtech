-- Fase 21 · Multi-moneda + ExchangeRate + diferencia cambiaria.
--
-- Esta migración:
--   1. Crea enum ExchangeRateSource.
--   2. Crea tabla ExchangeRate con índice único (companyId, currency, date)
--      + índice (companyId, date) + (companyId, currency, date).
--   3. Agrega columnas snapshot (currency, exchangeRate, functionalAmount) a:
--      Sale, PurchaseOrder, Payment, AccountPayment, SupplierPayment,
--      SupplierInvoice, BankTransaction.
--   4. Backfill: todos los documentos existentes quedan con currency='GTQ',
--      exchangeRate=1.0, functionalAmount = total (o amount, según tabla).
--   5. RLS + policy "tenant_isolation_exchange_rate" sobre ExchangeRate.
--
-- READ-ONLY de Fase 14/15/16/17/18/19/20: no se tocan sus tablas más allá de
-- agregar columnas snapshot. Defaults seguros: GTQ, rate=1, functionalAmount
-- = total persistido, para que la mono-moneda siga funcionando intacta.
--
-- IDEMPOTENTE: DO blocks, IF NOT EXISTS, CREATE OR REPLACE.

-- ─────────────────────────────────────────
-- 1) Enum ExchangeRateSource
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'BANGUAT', 'API');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) Tabla ExchangeRate
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ExchangeRate" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "currency"    TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "rate"        DECIMAL(18, 8) NOT NULL,
  "source"      "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
  "notes"       TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExchangeRate_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExchangeRate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRate_companyId_currency_date_key"
  ON "ExchangeRate"("companyId", "currency", "date");
CREATE INDEX IF NOT EXISTS "ExchangeRate_companyId_date_idx"
  ON "ExchangeRate"("companyId", "date");
CREATE INDEX IF NOT EXISTS "ExchangeRate_companyId_currency_date_idx"
  ON "ExchangeRate"("companyId", "currency", "date");

-- ─────────────────────────────────────────
-- 3) Columnas snapshot en documentos monetarios
--    (idempotente con ADD COLUMN IF NOT EXISTS).
-- ─────────────────────────────────────────

-- Sale
ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- PurchaseOrder
ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- Payment
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- AccountPayment
ALTER TABLE "AccountPayment"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- SupplierPayment
ALTER TABLE "SupplierPayment"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- SupplierInvoice
ALTER TABLE "SupplierInvoice"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- BankTransaction
ALTER TABLE "BankTransaction"
  ADD COLUMN IF NOT EXISTS "currency"         TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS "exchangeRate"     DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS "functionalAmount" DECIMAL(15, 2);

-- ─────────────────────────────────────────
-- 4) Backfill: documentos existentes en mono-moneda GTQ.
--    rate=1.0, functionalAmount = total/amount persistido.
--    Solo aplica a filas con exchangeRate IS NULL (idempotente).
-- ─────────────────────────────────────────

UPDATE "Sale"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "total"
WHERE "exchangeRate" IS NULL;

UPDATE "PurchaseOrder"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "total"
WHERE "exchangeRate" IS NULL;

UPDATE "Payment"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "amount"
WHERE "exchangeRate" IS NULL;

UPDATE "AccountPayment"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "amount"
WHERE "exchangeRate" IS NULL;

UPDATE "SupplierPayment"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "amount"
WHERE "exchangeRate" IS NULL;

UPDATE "SupplierInvoice"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "total"
WHERE "exchangeRate" IS NULL;

UPDATE "BankTransaction"
SET "exchangeRate"     = 1.0,
    "functionalAmount" = "amount"
WHERE "exchangeRate" IS NULL;

-- ─────────────────────────────────────────
-- 5) RLS + policy sobre ExchangeRate (patrón Fase 13/14/15/16/17/18/19/20)
-- ─────────────────────────────────────────

ALTER TABLE "ExchangeRate" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_exchange_rate" ON "ExchangeRate";
CREATE POLICY "tenant_isolation_exchange_rate" ON "ExchangeRate"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);
