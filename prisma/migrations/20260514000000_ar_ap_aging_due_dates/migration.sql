-- Fase 17 · CxC/CxP + aging + CustomerCredit (anticipos y saldos a favor).
--
-- Esta migración:
--   1. Agrega `Sale.dueDate` (null para ventas contado, fecha para crédito).
--   2. Agrega `Customer.creditDaysDefault` y `Customer.maxOverdueDays`.
--   3. Agrega `Supplier.creditDaysDefault` (reemplaza hardcoded +30 días).
--   4. Crea enums `CustomerCreditStatus` y `CustomerCreditReason`.
--   5. Agrega valor `OVERDUE` al enum `SaleStatus` (idempotente con ALTER TYPE ... ADD VALUE IF NOT EXISTS).
--   6. Crea tablas `CustomerCredit` y `CustomerCreditApplication` con RLS.
--   7. Backfill: `Sale.dueDate` para ventas a crédito históricas (createdAt + creditDaysDefault del customer).
--   8. Backfill: `Sale.status='OVERDUE'` para sales con dueDate < now() y Customer.balance > 0.
--   9. Crea índices para queries de aging eficientes.
--
-- Idempotencia: el patrón es el mismo de Fase 14/15 — DO blocks, IF NOT EXISTS,
-- ON CONFLICT DO NOTHING. Re-aplicar es seguro.

-- ─────────────────────────────────────────
-- 1) Enums nuevos + valor agregado a SaleStatus
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CustomerCreditStatus" AS ENUM ('ACTIVE', 'PARTIALLY_APPLIED', 'FULLY_APPLIED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerCreditReason" AS ENUM ('ADVANCE_PAYMENT', 'SALE_RETURN', 'MANUAL_CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ALTER TYPE ADD VALUE IF NOT EXISTS está disponible desde Postgres 12.
-- IMPORTANTE: este statement NO puede ejecutarse adentro de un bloque
-- transaccional explícito (BEGIN/COMMIT); Prisma migrate cada migration corre
-- en su propia transacción implícita, lo que sí lo permite.
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';

-- ─────────────────────────────────────────
-- 2) Columnas nuevas en Sale, Customer, Supplier
-- ─────────────────────────────────────────

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "creditDaysDefault" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "maxOverdueDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "creditDaysDefault" INTEGER NOT NULL DEFAULT 30;

-- ─────────────────────────────────────────
-- 3) Tablas nuevas (CustomerCredit + CustomerCreditApplication)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomerCredit" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "customerId"    TEXT NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "balance"       DECIMAL(10,2) NOT NULL,
  "status"        "CustomerCreditStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason"        "CustomerCreditReason" NOT NULL,
  "referenceType" TEXT,
  "referenceId"   TEXT,
  "notes"         TEXT,
  "userId"        TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCredit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerCredit_companyId_fkey"  FOREIGN KEY ("companyId")  REFERENCES "Company"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerCredit_userId_fkey"     FOREIGN KEY ("userId")     REFERENCES "User"("id")     ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomerCredit_companyId_customerId_idx" ON "CustomerCredit"("companyId", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerCredit_companyId_status_idx"     ON "CustomerCredit"("companyId", "status");

CREATE TABLE IF NOT EXISTS "CustomerCreditApplication" (
  "id"               TEXT NOT NULL,
  "customerCreditId" TEXT NOT NULL,
  "saleId"           TEXT NOT NULL,
  "amount"           DECIMAL(10,2) NOT NULL,
  "userId"           TEXT NOT NULL,
  "appliedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCreditApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerCreditApplication_customerCreditId_fkey" FOREIGN KEY ("customerCreditId") REFERENCES "CustomerCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerCreditApplication_saleId_fkey"           FOREIGN KEY ("saleId")           REFERENCES "Sale"("id")           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerCreditApplication_userId_fkey"           FOREIGN KEY ("userId")           REFERENCES "User"("id")           ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomerCreditApplication_customerCreditId_idx" ON "CustomerCreditApplication"("customerCreditId");
CREATE INDEX IF NOT EXISTS "CustomerCreditApplication_saleId_idx"           ON "CustomerCreditApplication"("saleId");

-- ─────────────────────────────────────────
-- 4) Índices nuevos para aging eficiente
-- ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Sale_companyId_dueDate_status_idx"
  ON "Sale"("companyId", "dueDate", "status");

CREATE INDEX IF NOT EXISTS "SupplierPayable_companyId_dueDate_status_idx"
  ON "SupplierPayable"("companyId", "dueDate", "status");

-- ─────────────────────────────────────────
-- 5) Backfill `Sale.dueDate` para ventas a crédito históricas
-- ─────────────────────────────────────────
-- Una venta cuenta como "a crédito" si tiene al menos un Payment con
-- method='CREDIT'. Para esas ventas que no tengan dueDate seteado,
-- inferimos `createdAt + Customer.creditDaysDefault` (que recién creamos
-- con default 30 — si el cliente no existe, fallback a +30 directo).

UPDATE "Sale" s
SET "dueDate" = s."createdAt" + (
  COALESCE(c."creditDaysDefault", 30) || ' days'
)::interval
FROM "Customer" c
WHERE s."customerId" = c."id"
  AND s."dueDate" IS NULL
  AND s."status" IN ('COMPLETED', 'PENDING')
  AND EXISTS (
    SELECT 1 FROM "Payment" p
    WHERE p."saleId" = s."id" AND p."method" = 'CREDIT'
  );

-- Si por alguna razón hay sales a crédito sin customer (raro), default +30 días.
UPDATE "Sale" s
SET "dueDate" = s."createdAt" + INTERVAL '30 days'
WHERE s."dueDate" IS NULL
  AND s."customerId" IS NULL
  AND s."status" IN ('COMPLETED', 'PENDING')
  AND EXISTS (
    SELECT 1 FROM "Payment" p
    WHERE p."saleId" = s."id" AND p."method" = 'CREDIT'
  );

-- ─────────────────────────────────────────
-- 6) Backfill `Sale.status='OVERDUE'` para ventas vencidas con saldo
-- ─────────────────────────────────────────
-- Heurística: una venta es OVERDUE si:
--   - status era COMPLETED (no QUOTE/CANCELLED/PENDING ni ya OVERDUE)
--   - dueDate < now()
--   - el cliente tiene `balance > 0` (proxy de saldo pendiente, dado que
--     no rastreamos saldo por documento individual en legacy)
-- Después de Fase 17 el cron diario seguirá actualizando esto correctamente.

UPDATE "Sale" s
SET "status" = 'OVERDUE'
FROM "Customer" c
WHERE s."customerId" = c."id"
  AND s."status" = 'COMPLETED'
  AND s."dueDate" IS NOT NULL
  AND s."dueDate" < CURRENT_TIMESTAMP
  AND c."balance" > 0;

-- ─────────────────────────────────────────
-- 7) RLS en tablas nuevas (patrón Fase 13/14/15)
-- ─────────────────────────────────────────

ALTER TABLE "CustomerCredit"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerCreditApplication" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_customer_credit" ON "CustomerCredit";
CREATE POLICY "tenant_isolation_customer_credit" ON "CustomerCredit"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

-- CustomerCreditApplication no tiene companyId directo — usamos EXISTS sobre el padre.
DROP POLICY IF EXISTS "tenant_isolation_customer_credit_application" ON "CustomerCreditApplication";
CREATE POLICY "tenant_isolation_customer_credit_application" ON "CustomerCreditApplication"
  USING (EXISTS (
    SELECT 1 FROM "CustomerCredit" cc
    WHERE cc."id" = "CustomerCreditApplication"."customerCreditId"
      AND current_setting('app.tenant_id', true) = cc."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "CustomerCredit" cc
    WHERE cc."id" = "CustomerCreditApplication"."customerCreditId"
      AND current_setting('app.tenant_id', true) = cc."companyId"::text
  ));
