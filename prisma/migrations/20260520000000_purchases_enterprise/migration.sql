-- Fase 19 · Compras enterprise: PR → RFQ → PO → GRN → SupplierInvoice + retenciones GT.
--
-- Esta migración:
--   1. Extiende enum PurchaseStatus con PENDING_APPROVAL/APPROVED/PARTIALLY_RECEIVED/
--      RECEIVED/INVOICED (mantiene DRAFT/COMPLETED/CANCELLED por backcompat).
--   2. Crea enums nuevos: PurchaseRequestStatus, RFQStatus.
--   3. Agrega columnas a Supplier (taxRegime, withholdsIVA, withholdsISR, isrRate).
--   4. Agrega columnas a Company (purchaseApprovalThreshold).
--   5. Agrega columnas a PurchaseOrder (subtotal, tax, withheldIVA, withheldISR,
--      landedCost, approvedById, approvedAt, receivedAt, invoiceNumber, taxRegime,
--      purchaseRequestId).
--   6. Convierte PurchaseOrderItem.quantity Int → Decimal(12,3) (idempotente por
--      data_type check) y agrega quantityReceived, quantityInvoiced, taxRate.
--   7. Crea tablas nuevas: PurchaseRequest(+items), RFQRequest(+items), RFQQuote(+items),
--      GoodsReceivedNote(+items), SupplierInvoice, SupplierCreditNote.
--   8. RLS + policies tenant_isolation_* sobre las 9 tablas nuevas.
--   9. Backfill mínimo: PO legacy con `reference` no nulo & total > 0 → status='INVOICED'
--      via SupplierPayable.purchaseId match; resto queda en COMPLETED. No se tocan
--      PO CANCELLED. PurchaseOrderItem.quantityReceived := quantity (legacy ya
--      había recibido al crear la PO bajo el flujo viejo).
--
-- IDEMPOTENTE: DO blocks, IF NOT EXISTS, ON CONFLICT DO NOTHING.
--
-- Nota (lección Fase 17, SqlState 55P04): los valores nuevos de enum agregados
-- por ALTER TYPE ADD VALUE NO se pueden usar en la misma migración. Por eso el
-- backfill que requiere PARTIALLY_RECEIVED/RECEIVED/INVOICED se delega a un
-- segundo paso al runtime (script de onboarding) o a una migración posterior.
-- En esta migración SOLO se setea quantityReceived (que es Decimal, no enum) y
-- se deja el `status` como estaba (COMPLETED/CANCELLED) para los registros
-- viejos. Los nuevos valores quedan disponibles para los inserts del API
-- inmediatamente al deploy de esta migración.

-- ─────────────────────────────────────────
-- 1) Enums nuevos + valores agregados a PurchaseStatus
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PurchaseRequestStatus" AS ENUM (
    'PENDING', 'APPROVED', 'REJECTED', 'CONVERTED_TO_PO', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RFQStatus" AS ENUM ('OPEN', 'AWARDED', 'CANCELLED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'INVOICED';

-- ─────────────────────────────────────────
-- 2) Columnas nuevas en Supplier (régimen + retenciones)
-- ─────────────────────────────────────────

ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "taxRegime"     "TaxRegime",
  ADD COLUMN IF NOT EXISTS "withholdsIVA"  BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "withholdsISR"  BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isrRate"       DECIMAL(5,4)  NOT NULL DEFAULT 0.0500;

-- ─────────────────────────────────────────
-- 3) Columna nueva en Company (umbral de aprobación)
-- ─────────────────────────────────────────

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "purchaseApprovalThreshold" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────
-- 4) Columnas nuevas en PurchaseOrder
-- ─────────────────────────────────────────

ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "subtotal"           DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "tax"                DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "withheldIVA"        DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "withheldISR"        DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "landedCost"         DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approvedById"       TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receivedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceNumber"      TEXT,
  ADD COLUMN IF NOT EXISTS "taxRegime"          "TaxRegime",
  ADD COLUMN IF NOT EXISTS "purchaseRequestId"  TEXT;

DO $$ BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_purchaseRequestId_key"
  ON "PurchaseOrder"("purchaseRequestId");

-- ─────────────────────────────────────────
-- 5) PurchaseOrderItem: quantity Int → Decimal(12,3) + columnas nuevas
-- ─────────────────────────────────────────

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name='PurchaseOrderItem' AND column_name='quantity';

  IF current_type = 'integer' THEN
    ALTER TABLE "PurchaseOrderItem"
      ALTER COLUMN "quantity" TYPE DECIMAL(12,3) USING ("quantity"::numeric);
  END IF;
END $$;

ALTER TABLE "PurchaseOrderItem"
  ADD COLUMN IF NOT EXISTS "quantityReceived" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantityInvoiced" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxRate"          DECIMAL(5,4)  NOT NULL DEFAULT 0;

-- Backfill: el flujo legacy recibía y facturaba todo al crear la PO. Para no
-- mostrar las PO viejas como "0 recibidas / 0 facturadas", inicializamos
-- quantityReceived := quantity y quantityInvoiced := quantity para PO con
-- status 'COMPLETED' (legacy: alta + recepción + factura en un solo POST).
UPDATE "PurchaseOrderItem" poi
SET
  "quantityReceived" = poi."quantity",
  "quantityInvoiced" = poi."quantity"
FROM "PurchaseOrder" po
WHERE poi."purchaseOrderId" = po."id"
  AND po."status" = 'COMPLETED'
  AND poi."quantityReceived" = 0
  AND poi."quantityInvoiced" = 0;

-- Backfill: snapshot de PurchaseOrder.subtotal := total para PO legacy
-- (no había IVA separado).
UPDATE "PurchaseOrder"
SET "subtotal" = "total"
WHERE "subtotal" IS NULL;

-- Backfill: invoiceNumber := reference cuando hay payable asociado.
UPDATE "PurchaseOrder" po
SET "invoiceNumber" = po."reference"
FROM "SupplierPayable" sp
WHERE sp."purchaseId" = po."id"
  AND po."invoiceNumber" IS NULL
  AND po."reference" IS NOT NULL;

-- ─────────────────────────────────────────
-- 6) Tabla PurchaseRequest (+items)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PurchaseRequest" (
  "id"               TEXT NOT NULL,
  "companyId"        TEXT NOT NULL,
  "branchId"         TEXT NOT NULL,
  "supplierId"       TEXT,
  "requestedById"    TEXT NOT NULL,
  "reason"           TEXT NOT NULL,
  "status"           "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"     TEXT,
  "approvedAt"       TIMESTAMP(3),
  "rejectedAt"       TIMESTAMP(3),
  "rejectionReason"  TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseRequest_companyId_fkey"
    FOREIGN KEY ("companyId")   REFERENCES "Company"("id")  ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "PurchaseRequest_branchId_fkey"
    FOREIGN KEY ("branchId")    REFERENCES "Branch"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseRequest_supplierId_fkey"
    FOREIGN KEY ("supplierId")  REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PurchaseRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseRequest_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")    ON DELETE SET NULL  ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseRequest_companyId_status_idx"
  ON "PurchaseRequest"("companyId", "status");

CREATE TABLE IF NOT EXISTS "PurchaseRequestItem" (
  "id"                TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "productId"         TEXT NOT NULL,
  "variantId"         TEXT,
  "quantity"          DECIMAL(12,3) NOT NULL,
  "estimatedUnitCost" DECIMAL(10,2),
  "notes"             TEXT,
  CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey"
    FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseRequestItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseRequestItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- FK PurchaseOrder.purchaseRequestId → PurchaseRequest
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey"
      FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 7) Tabla RFQRequest (+items, +quotes, +quoteItems)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RFQRequest" (
  "id"             TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "branchId"       TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "createdById"    TEXT NOT NULL,
  "status"         "RFQStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt"       TIMESTAMP(3),
  "awardedQuoteId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RFQRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RFQRequest_companyId_fkey"
    FOREIGN KEY ("companyId")  REFERENCES "Company"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "RFQRequest_branchId_fkey"
    FOREIGN KEY ("branchId")   REFERENCES "Branch"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RFQRequest_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")   ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RFQRequest_companyId_status_idx"
  ON "RFQRequest"("companyId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "RFQRequest_awardedQuoteId_key"
  ON "RFQRequest"("awardedQuoteId");

CREATE TABLE IF NOT EXISTS "RFQRequestItem" (
  "id"             TEXT NOT NULL,
  "rfqRequestId"   TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "variantId"      TEXT,
  "quantity"       DECIMAL(12,3) NOT NULL,
  "specifications" TEXT,
  CONSTRAINT "RFQRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RFQRequestItem_rfqRequestId_fkey"
    FOREIGN KEY ("rfqRequestId") REFERENCES "RFQRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RFQRequestItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RFQRequestItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RFQQuote" (
  "id"           TEXT NOT NULL,
  "rfqRequestId" TEXT NOT NULL,
  "supplierId"   TEXT NOT NULL,
  "quotedById"   TEXT NOT NULL,
  "totalAmount"  DECIMAL(10,2) NOT NULL,
  "validUntil"   TIMESTAMP(3),
  "notes"        TEXT,
  "selected"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RFQQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RFQQuote_rfqRequestId_fkey"
    FOREIGN KEY ("rfqRequestId") REFERENCES "RFQRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RFQQuote_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RFQQuote_quotedById_fkey"
    FOREIGN KEY ("quotedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- FK RFQRequest.awardedQuoteId → RFQQuote (resuelta DESPUÉS de crear RFQQuote)
DO $$ BEGIN
  ALTER TABLE "RFQRequest"
    ADD CONSTRAINT "RFQRequest_awardedQuoteId_fkey"
      FOREIGN KEY ("awardedQuoteId") REFERENCES "RFQQuote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RFQQuoteItem" (
  "id"           TEXT NOT NULL,
  "rfqQuoteId"   TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "variantId"    TEXT,
  "quantity"     DECIMAL(12,3) NOT NULL,
  "unitPrice"    DECIMAL(10,2) NOT NULL,
  "deliveryDays" INTEGER,
  CONSTRAINT "RFQQuoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RFQQuoteItem_rfqQuoteId_fkey"
    FOREIGN KEY ("rfqQuoteId") REFERENCES "RFQQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RFQQuoteItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RFQQuoteItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ─────────────────────────────────────────
-- 8) Tabla GoodsReceivedNote (+items)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GoodsReceivedNote" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "receivedById"    TEXT NOT NULL,
  "receivedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"           TEXT,
  CONSTRAINT "GoodsReceivedNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoodsReceivedNote_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceivedNote_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceivedNote_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "GoodsReceivedNote_companyId_purchaseOrderId_idx"
  ON "GoodsReceivedNote"("companyId", "purchaseOrderId");

CREATE TABLE IF NOT EXISTS "GoodsReceivedNoteItem" (
  "id"                  TEXT NOT NULL,
  "grnId"               TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "quantityReceived"    DECIMAL(12,3) NOT NULL,
  "unitCost"            DECIMAL(10,2) NOT NULL,
  "notes"               TEXT,
  CONSTRAINT "GoodsReceivedNoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoodsReceivedNoteItem_grnId_fkey"
    FOREIGN KEY ("grnId") REFERENCES "GoodsReceivedNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceivedNoteItem_purchaseOrderItemId_fkey"
    FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─────────────────────────────────────────
-- 9) Tabla SupplierInvoice
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SupplierInvoice" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "supplierId"      TEXT NOT NULL,
  "registeredById"  TEXT NOT NULL,
  "invoiceNumber"   TEXT NOT NULL,
  "invoiceDate"     TIMESTAMP(3) NOT NULL,
  "dueDate"         TIMESTAMP(3) NOT NULL,
  "subtotal"        DECIMAL(10,2) NOT NULL,
  "tax"             DECIMAL(10,2) NOT NULL,
  "withheldIVA"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "withheldISR"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total"           DECIMAL(10,2) NOT NULL,
  "attachmentUrl"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierInvoice_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierInvoice_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierInvoice_registeredById_fkey"
    FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierInvoice_purchaseOrderId_key"
  ON "SupplierInvoice"("purchaseOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierInvoice_companyId_supplierId_invoiceNumber_key"
  ON "SupplierInvoice"("companyId", "supplierId", "invoiceNumber");
CREATE INDEX IF NOT EXISTS "SupplierInvoice_companyId_invoiceDate_idx"
  ON "SupplierInvoice"("companyId", "invoiceDate");

-- ─────────────────────────────────────────
-- 10) Tabla SupplierCreditNote
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SupplierCreditNote" (
  "id"                TEXT NOT NULL,
  "companyId"         TEXT NOT NULL,
  "supplierId"        TEXT NOT NULL,
  "supplierInvoiceId" TEXT,
  "registeredById"    TEXT NOT NULL,
  "noteNumber"        TEXT NOT NULL,
  "noteDate"          TIMESTAMP(3) NOT NULL,
  "reason"            TEXT NOT NULL,
  "subtotal"          DECIMAL(10,2) NOT NULL,
  "tax"               DECIMAL(10,2) NOT NULL,
  "total"             DECIMAL(10,2) NOT NULL,
  "attachmentUrl"     TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierCreditNote_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierCreditNote_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierCreditNote_supplierInvoiceId_fkey"
    FOREIGN KEY ("supplierInvoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SupplierCreditNote_registeredById_fkey"
    FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierCreditNote_companyId_supplierId_noteNumber_key"
  ON "SupplierCreditNote"("companyId", "supplierId", "noteNumber");

-- ─────────────────────────────────────────
-- 11) RLS en tablas nuevas (patrón Fase 13/14/15/16/17/18)
-- ─────────────────────────────────────────

ALTER TABLE "PurchaseRequest"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseRequestItem"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RFQRequest"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RFQRequestItem"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RFQQuote"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RFQQuoteItem"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoodsReceivedNote"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoodsReceivedNoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierInvoice"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierCreditNote"   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_purchase_request" ON "PurchaseRequest";
CREATE POLICY "tenant_isolation_purchase_request" ON "PurchaseRequest"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_purchase_request_item" ON "PurchaseRequestItem";
CREATE POLICY "tenant_isolation_purchase_request_item" ON "PurchaseRequestItem"
  USING (EXISTS (
    SELECT 1 FROM "PurchaseRequest" pr
    WHERE pr."id" = "PurchaseRequestItem"."purchaseRequestId"
      AND current_setting('app.tenant_id', true) = pr."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "PurchaseRequest" pr
    WHERE pr."id" = "PurchaseRequestItem"."purchaseRequestId"
      AND current_setting('app.tenant_id', true) = pr."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_rfq_request" ON "RFQRequest";
CREATE POLICY "tenant_isolation_rfq_request" ON "RFQRequest"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_rfq_request_item" ON "RFQRequestItem";
CREATE POLICY "tenant_isolation_rfq_request_item" ON "RFQRequestItem"
  USING (EXISTS (
    SELECT 1 FROM "RFQRequest" r
    WHERE r."id" = "RFQRequestItem"."rfqRequestId"
      AND current_setting('app.tenant_id', true) = r."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "RFQRequest" r
    WHERE r."id" = "RFQRequestItem"."rfqRequestId"
      AND current_setting('app.tenant_id', true) = r."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_rfq_quote" ON "RFQQuote";
CREATE POLICY "tenant_isolation_rfq_quote" ON "RFQQuote"
  USING (EXISTS (
    SELECT 1 FROM "RFQRequest" r
    WHERE r."id" = "RFQQuote"."rfqRequestId"
      AND current_setting('app.tenant_id', true) = r."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "RFQRequest" r
    WHERE r."id" = "RFQQuote"."rfqRequestId"
      AND current_setting('app.tenant_id', true) = r."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_rfq_quote_item" ON "RFQQuoteItem";
CREATE POLICY "tenant_isolation_rfq_quote_item" ON "RFQQuoteItem"
  USING (EXISTS (
    SELECT 1 FROM "RFQQuote" q
    JOIN "RFQRequest" r ON r."id" = q."rfqRequestId"
    WHERE q."id" = "RFQQuoteItem"."rfqQuoteId"
      AND current_setting('app.tenant_id', true) = r."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "RFQQuote" q
    JOIN "RFQRequest" r ON r."id" = q."rfqRequestId"
    WHERE q."id" = "RFQQuoteItem"."rfqQuoteId"
      AND current_setting('app.tenant_id', true) = r."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_goods_received_note" ON "GoodsReceivedNote";
CREATE POLICY "tenant_isolation_goods_received_note" ON "GoodsReceivedNote"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_goods_received_note_item" ON "GoodsReceivedNoteItem";
CREATE POLICY "tenant_isolation_goods_received_note_item" ON "GoodsReceivedNoteItem"
  USING (EXISTS (
    SELECT 1 FROM "GoodsReceivedNote" g
    WHERE g."id" = "GoodsReceivedNoteItem"."grnId"
      AND current_setting('app.tenant_id', true) = g."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "GoodsReceivedNote" g
    WHERE g."id" = "GoodsReceivedNoteItem"."grnId"
      AND current_setting('app.tenant_id', true) = g."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_supplier_invoice" ON "SupplierInvoice";
CREATE POLICY "tenant_isolation_supplier_invoice" ON "SupplierInvoice"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_supplier_credit_note" ON "SupplierCreditNote";
CREATE POLICY "tenant_isolation_supplier_credit_note" ON "SupplierCreditNote"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);
