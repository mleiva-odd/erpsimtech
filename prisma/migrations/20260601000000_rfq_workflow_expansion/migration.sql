-- Fase 22c-4 · RFQ workflow expansion
--
-- Expande el módulo Request For Quotation para soportar el flujo completo
-- de una SaaS ERP de verdad:
--   1. Estado DRAFT (borrador editable) antes de SENT (enviado a proveedores).
--   2. Tabla de invitaciones a proveedores (incluyendo externos sin Supplier
--      registrado), con timestamps de envío y respuesta.
--   3. Adjudicación por item (split award): un RFQ puede dar item A al
--      proveedor X y el item B al proveedor Y.
--   4. Trazabilidad: PurchaseOrder.sourceRfqId apunta al RFQ origen.
--   5. Campos operativos: reference, responseDeadline, quoteValidityDays,
--      deliveryPlace, buyerId, sentAt.
--
-- Aditiva y idempotente: no rompe datos existentes. Registros RFQRequest
-- legacy con status='OPEN' siguen funcionando (OPEN se mantiene como
-- sinónimo deprecado de SENT; nuevos registros usan DRAFT al crearse).
--
-- Lecciones previas aplicadas:
--   - Fase 17 SqlState 55P04: ALTER TYPE ADD VALUE no se puede usar en la
--     misma transacción que un UPDATE/insert que use ese valor nuevo. Los
--     nuevos valores se agregan acá; los UPDATEs defensivos usan SOLO
--     valores que ya existían antes (OPEN, AWARDED, etc.).
--   - Fase 14 SqlState 42804: casting explícito ::"EnumType" cuando se
--     usa literal de texto con default.

-- ──────────────────────────────────────────────────────────────────
-- 1) Enum RFQStatus: agregar DRAFT y SENT
-- ──────────────────────────────────────────────────────────────────
-- Postgres ≥ 12 soporta IF NOT EXISTS en ALTER TYPE ADD VALUE.
-- Sin embargo, esa cláusula falla en una transacción si el valor ya existe
-- en una versión inferior — usamos DO block defensivo igual.

DO $$ BEGIN
  ALTER TYPE "RFQStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'OPEN';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "RFQStatus" ADD VALUE IF NOT EXISTS 'SENT' AFTER 'OPEN';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nota: NO renombramos OPEN→SENT ni eliminamos OPEN. Los datos legacy
-- quedan funcionales y el código nuevo trata OPEN === SENT semánticamente.
-- Si Marvin quiere limpiar OPEN en el futuro, requeriría UPDATE masivo +
-- DROP del valor, que NO puede ir en esta migración (SqlState 55P04).

-- ──────────────────────────────────────────────────────────────────
-- 2) RFQRequest: nuevas columnas (todas opcionales, no rompe legacy)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "RFQRequest"
  ADD COLUMN IF NOT EXISTS "reference" TEXT,
  ADD COLUMN IF NOT EXISTS "responseDeadline" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quoteValidityDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "deliveryPlace" TEXT,
  ADD COLUMN IF NOT EXISTS "buyerId" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);

-- FK opcional al User comprador (puede diferir del createdBy).
DO $$ BEGIN
  ALTER TABLE "RFQRequest"
    ADD CONSTRAINT "RFQRequest_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "RFQRequest_buyerId_idx"
  ON "RFQRequest"("buyerId");

CREATE INDEX IF NOT EXISTS "RFQRequest_responseDeadline_idx"
  ON "RFQRequest"("responseDeadline")
  WHERE "responseDeadline" IS NOT NULL;

-- Backfill defensivo: registros legacy con status='OPEN' marcan sentAt al
-- createdAt (fueron "enviados" implícitamente al crearse en flujo viejo).
UPDATE "RFQRequest"
SET "sentAt" = "createdAt"
WHERE "status" = 'OPEN' AND "sentAt" IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- 3) RFQRequestItem: columnas para split award
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "RFQRequestItem"
  ADD COLUMN IF NOT EXISTS "unit" TEXT,
  ADD COLUMN IF NOT EXISTS "observations" TEXT,
  ADD COLUMN IF NOT EXISTS "awardedSupplierId" TEXT,
  ADD COLUMN IF NOT EXISTS "awardedQuoteItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "awardedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "RFQRequestItem"
    ADD CONSTRAINT "RFQRequestItem_awardedSupplierId_fkey"
    FOREIGN KEY ("awardedSupplierId") REFERENCES "Supplier"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RFQRequestItem"
    ADD CONSTRAINT "RFQRequestItem_awardedQuoteItemId_fkey"
    FOREIGN KEY ("awardedQuoteItemId") REFERENCES "RFQQuoteItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "RFQRequestItem_awardedSupplierId_idx"
  ON "RFQRequestItem"("awardedSupplierId")
  WHERE "awardedSupplierId" IS NOT NULL;

-- Backfill defensivo: si el RFQ legacy tenía awardedQuoteId (1-quote-gana-todo),
-- propagar la decisión a cada item del RFQ usando el RFQQuoteItem correspondiente.
-- Match por (productId, variantId) — el RFQRequestItem y RFQQuoteItem
-- comparten el producto.
UPDATE "RFQRequestItem" AS ri
SET
  "awardedSupplierId" = q."supplierId",
  "awardedQuoteItemId" = qi."id",
  "awardedAt" = COALESCE(r."closedAt", r."createdAt")
FROM "RFQRequest" AS r
JOIN "RFQQuote" AS q ON q."id" = r."awardedQuoteId"
JOIN "RFQQuoteItem" AS qi ON qi."rfqQuoteId" = q."id"
  AND qi."productId" = ri."productId"
  AND (
    (qi."variantId" IS NULL AND ri."variantId" IS NULL)
    OR qi."variantId" = ri."variantId"
  )
WHERE ri."rfqRequestId" = r."id"
  AND r."awardedQuoteId" IS NOT NULL
  AND ri."awardedSupplierId" IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- 4) RFQInvitation: tabla nueva
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RFQInvitation" (
  "id"             TEXT NOT NULL,
  "rfqRequestId"   TEXT NOT NULL,
  "supplierId"     TEXT,
  "externalEmail"  TEXT,
  "sentAt"         TIMESTAMP(3),
  "respondedAt"    TIMESTAMP(3),
  "declinedAt"     TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RFQInvitation_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "RFQInvitation"
    ADD CONSTRAINT "RFQInvitation_rfqRequestId_fkey"
    FOREIGN KEY ("rfqRequestId") REFERENCES "RFQRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RFQInvitation"
    ADD CONSTRAINT "RFQInvitation_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- @@unique([rfqRequestId, supplierId]) — solo cuando supplierId no es null.
-- Usamos índice único parcial porque Postgres permite múltiples NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "RFQInvitation_rfqRequestId_supplierId_key"
  ON "RFQInvitation"("rfqRequestId", "supplierId")
  WHERE "supplierId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "RFQInvitation_rfqRequestId_idx"
  ON "RFQInvitation"("rfqRequestId");

CREATE INDEX IF NOT EXISTS "RFQInvitation_supplierId_idx"
  ON "RFQInvitation"("supplierId")
  WHERE "supplierId" IS NOT NULL;

-- Backfill defensivo: para RFQs legacy ya con quotes registradas, crear
-- invitaciones retroactivas con respondedAt = createdAt de la quote.
-- Idempotente vía índice único parcial: si ya existe (rfqRequestId, supplierId),
-- el INSERT es ignorado con ON CONFLICT DO NOTHING.
INSERT INTO "RFQInvitation" (
  "id", "rfqRequestId", "supplierId", "sentAt", "respondedAt", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  q."rfqRequestId",
  q."supplierId",
  r."createdAt",
  q."createdAt",
  r."createdAt"
FROM "RFQQuote" AS q
JOIN "RFQRequest" AS r ON r."id" = q."rfqRequestId"
WHERE NOT EXISTS (
  SELECT 1 FROM "RFQInvitation" inv
  WHERE inv."rfqRequestId" = q."rfqRequestId"
    AND inv."supplierId" = q."supplierId"
);

-- ──────────────────────────────────────────────────────────────────
-- 5) PurchaseOrder: trazabilidad a RFQ origen
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "sourceRfqId" TEXT;

DO $$ BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_sourceRfqId_fkey"
    FOREIGN KEY ("sourceRfqId") REFERENCES "RFQRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_sourceRfqId_idx"
  ON "PurchaseOrder"("sourceRfqId")
  WHERE "sourceRfqId" IS NOT NULL;

-- Backfill defensivo: detectar POs legacy creadas desde el endpoint
-- /api/purchases/rfq/[id]/award/[quoteId] usando el patrón reference="RFQ-{id8}".
-- Match conservador: solo si reference comienza con "RFQ-" y los 8 chars
-- siguientes coinciden con el prefijo del UUID de algún RFQ de la misma company.
UPDATE "PurchaseOrder" AS po
SET "sourceRfqId" = r."id"
FROM "RFQRequest" AS r
WHERE po."sourceRfqId" IS NULL
  AND po."reference" IS NOT NULL
  AND po."reference" LIKE 'RFQ-%'
  AND po."companyId" = r."companyId"
  AND substring(po."reference" FROM 5 FOR 8) = substring(r."id" FROM 1 FOR 8);
