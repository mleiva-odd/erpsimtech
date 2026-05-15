-- Fase 22d-5 · Plantillas (Document Templates) + sortOrder en items.
--
-- 1) Modelo nuevo: DocumentTemplate. Almacena plantillas reutilizables de
--    documentos transaccionales (QUOTE, SALE, RFQ, PURCHASE_ORDER, PURCHASE_REQUEST).
--    Los items se guardan como JSONB (no relacional) porque la plantilla es
--    un snapshot inmutable de "productos + cantidades + notas"; instanciarla
--    no requiere foreign keys a los items.
--
-- 2) sortOrder Int en los 4 modelos de items donde el orden importa para el
--    documento generado:
--      - SaleItem
--      - PurchaseRequestItem
--      - PurchaseOrderItem
--      - RFQRequestItem
--    Default 0. Backfill: ROW_NUMBER() OVER (PARTITION BY parent ORDER BY id)
--    asigna orden estable a registros existentes para que la primera lectura
--    post-migración respete el orden de inserción aproximado.
--
-- Aditiva e idempotente. No rompe datos. Compatible con el cliente Prisma
-- generado tras `prisma generate`.

-- ──────────────────────────────────────────────────────────────────
-- 1) Enum DocumentTemplateType
-- ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "DocumentTemplateType" AS ENUM (
    'QUOTE',
    'SALE',
    'RFQ',
    'PURCHASE_ORDER',
    'PURCHASE_REQUEST'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────────────
-- 2) Modelo DocumentTemplate
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DocumentTemplate" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "type"         "DocumentTemplateType" NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  -- items[] = [{ productId, variantId?, quantity, notes?, unit?, ... }]
  -- JSONB para flexibilidad — cada `type` define su propio shape mínimo.
  "items"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- metadata opcional (deliveryPlace, paymentTerms, etc. por tipo)
  "metadata"     JSONB,
  "createdById"  TEXT NOT NULL,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "DocumentTemplate"
    ADD CONSTRAINT "DocumentTemplate_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentTemplate"
    ADD CONSTRAINT "DocumentTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "DocumentTemplate_companyId_type_idx"
  ON "DocumentTemplate"("companyId", "type")
  WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "DocumentTemplate_createdById_idx"
  ON "DocumentTemplate"("createdById");

-- Nombre único por (company, type) entre plantillas activas para evitar
-- ambigüedad en la UI (puede haber misma "name" si una está inactiva).
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTemplate_companyId_type_name_active_key"
  ON "DocumentTemplate"("companyId", "type", "name")
  WHERE "isActive" = true;

-- ──────────────────────────────────────────────────────────────────
-- 3) sortOrder en SaleItem
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: orden estable basado en id (UUID) por sale. ROW_NUMBER es
-- determinista dada la partición + orden. Sólo aplica a registros donde
-- sortOrder = 0 (el default), preservando idempotencia.
UPDATE "SaleItem" AS si
SET "sortOrder" = sub.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "saleId" ORDER BY "id") AS rn
  FROM "SaleItem"
) AS sub
WHERE si."id" = sub."id"
  AND si."sortOrder" = 0;

CREATE INDEX IF NOT EXISTS "SaleItem_saleId_sortOrder_idx"
  ON "SaleItem"("saleId", "sortOrder");

-- ──────────────────────────────────────────────────────────────────
-- 4) sortOrder en PurchaseOrderItem
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "PurchaseOrderItem"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "PurchaseOrderItem" AS poi
SET "sortOrder" = sub.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "purchaseOrderId" ORDER BY "id") AS rn
  FROM "PurchaseOrderItem"
) AS sub
WHERE poi."id" = sub."id"
  AND poi."sortOrder" = 0;

CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_purchaseOrderId_sortOrder_idx"
  ON "PurchaseOrderItem"("purchaseOrderId", "sortOrder");

-- ──────────────────────────────────────────────────────────────────
-- 5) sortOrder en PurchaseRequestItem
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "PurchaseRequestItem"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "PurchaseRequestItem" AS pri
SET "sortOrder" = sub.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "purchaseRequestId" ORDER BY "id") AS rn
  FROM "PurchaseRequestItem"
) AS sub
WHERE pri."id" = sub."id"
  AND pri."sortOrder" = 0;

CREATE INDEX IF NOT EXISTS "PurchaseRequestItem_purchaseRequestId_sortOrder_idx"
  ON "PurchaseRequestItem"("purchaseRequestId", "sortOrder");

-- ──────────────────────────────────────────────────────────────────
-- 6) sortOrder en RFQRequestItem
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "RFQRequestItem"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "RFQRequestItem" AS rri
SET "sortOrder" = sub.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "rfqRequestId" ORDER BY "id") AS rn
  FROM "RFQRequestItem"
) AS sub
WHERE rri."id" = sub."id"
  AND rri."sortOrder" = 0;

CREATE INDEX IF NOT EXISTS "RFQRequestItem_rfqRequestId_sortOrder_idx"
  ON "RFQRequestItem"("rfqRequestId", "sortOrder");
