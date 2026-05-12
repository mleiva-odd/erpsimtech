-- Fase 16 · Infraestructura FEL (Facturación Electrónica Guatemala).
--
-- Esta migración:
--   1. Crea enums `TaxRegime`, `TaxDocumentType`, `TaxDocumentStatus`.
--   2. Agrega valor `MOCK` al enum `FelProvider` (idempotente con
--      ALTER TYPE ... ADD VALUE IF NOT EXISTS). IMPORTANTE: el nuevo valor
--      NO se usa en la misma migración (lección Fase 17 / SqlState 55P04
--      "unsafe use of new value"). Cualquier USE de 'MOCK' debe hacerse en
--      una migración posterior o desde la aplicación. Por defecto las
--      empresas existentes mantienen `felProvider='NONE'`.
--   3. Agrega columna `Company.taxRegime` (nullable).
--   4. Agrega columnas snapshot a `Sale`: `customerNit`, `customerName`, `taxRegime`.
--   5. Agrega columnas `SaleItem.taxRate`, `SaleItem.tax` con default 0
--      (backfill implícito: todas las ventas históricas quedan con 0 IVA —
--      NO se intenta recalcular).
--   6. Crea tablas `TaxSeries`, `TaxDocument`, `CreditNote`, `CreditNoteItem`,
--      `DebitNote`, `DebitNoteItem` con FKs e índices.
--   7. Siembra `TaxSeries` default (prefix='A', nextNumber=1, type=FACT)
--      para cada Branch existente, idempotente vía ON CONFLICT DO NOTHING.
--   8. Habilita RLS + policy `tenant_isolation_*` para las 6 tablas nuevas
--      (patrón Fase 13/14/15/17).
--
-- IDEMPOTENTE: todos los CREATE TYPE/TABLE/INDEX/POLICY se protegen contra
-- duplicado. Re-aplicar es seguro.

-- ─────────────────────────────────────────
-- 1) ENUMS nuevos (idempotente)
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "TaxRegime" AS ENUM ('GENERAL', 'PEQUENO_CONTRIBUYENTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TaxDocumentType" AS ENUM ('FACT', 'NCRE', 'NDEB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TaxDocumentStatus" AS ENUM ('PENDING', 'CERTIFIED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) Ampliar enum FelProvider (agregar MOCK)
-- ─────────────────────────────────────────
-- ATENCIÓN (lección Fase 17): un valor de enum recién agregado por ALTER
-- TYPE ADD VALUE NO puede usarse en la MISMA transacción/migración (SqlState
-- 55P04 "unsafe use of new value of enum type"). Esta migración solo agrega
-- el valor; cualquier referencia desde la app o seeds posteriores ya lo verá
-- committed.

ALTER TYPE "FelProvider" ADD VALUE IF NOT EXISTS 'MOCK';

-- ─────────────────────────────────────────
-- 3) Columnas nuevas en Company y Sale, SaleItem
-- ─────────────────────────────────────────

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "taxRegime" "TaxRegime";

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "customerNit"  TEXT,
  ADD COLUMN IF NOT EXISTS "customerName" TEXT,
  ADD COLUMN IF NOT EXISTS "taxRegime"    "TaxRegime";

ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax"     DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────
-- 4) Tablas nuevas
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TaxSeries" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "branchId"      TEXT NOT NULL,
  "documentType"  "TaxDocumentType" NOT NULL,
  "prefix"        TEXT NOT NULL,
  "nextNumber"    INTEGER NOT NULL DEFAULT 1,
  "rangeFrom"     INTEGER,
  "rangeTo"       INTEGER,
  "authorization" TEXT,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxSeries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxSeries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaxSeries_branchId_fkey"  FOREIGN KEY ("branchId")  REFERENCES "Branch"("id")  ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaxSeries_companyId_branchId_documentType_prefix_key"
  ON "TaxSeries"("companyId", "branchId", "documentType", "prefix");
CREATE INDEX IF NOT EXISTS "TaxSeries_companyId_documentType_idx"
  ON "TaxSeries"("companyId", "documentType");

CREATE TABLE IF NOT EXISTS "TaxDocument" (
  "id"                   TEXT NOT NULL,
  "companyId"            TEXT NOT NULL,
  "branchId"             TEXT NOT NULL,
  "seriesId"             TEXT NOT NULL,
  "type"                 "TaxDocumentType" NOT NULL,
  "seriePrefix"          TEXT NOT NULL,
  "numero"               INTEGER NOT NULL,
  "numeroDisplay"        TEXT NOT NULL,
  "status"               "TaxDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "receptorNit"          TEXT NOT NULL,
  "receptorNombre"       TEXT NOT NULL,
  "emisorNit"            TEXT NOT NULL,
  "emisorNombre"         TEXT NOT NULL,
  "taxRegime"            "TaxRegime" NOT NULL,
  "provider"             "FelProvider" NOT NULL,
  "dteUuid"              TEXT,
  "autorizacion"         TEXT,
  "fechaCertificacion"   TIMESTAMP(3),
  "hashCertificacion"    TEXT,
  "xmlFirmado"           TEXT,
  "providerResponseJson" JSONB,
  "saleId"               TEXT,
  "creditNoteId"         TEXT,
  "debitNoteId"          TEXT,
  "cancelledById"        TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxDocument_companyId_fkey"     FOREIGN KEY ("companyId")     REFERENCES "Company"("id")     ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "TaxDocument_branchId_fkey"      FOREIGN KEY ("branchId")      REFERENCES "Branch"("id")      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TaxDocument_seriesId_fkey"      FOREIGN KEY ("seriesId")      REFERENCES "TaxSeries"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TaxDocument_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "TaxDocument"("id") ON DELETE SET NULL  ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaxDocument_saleId_key"        ON "TaxDocument"("saleId");
CREATE UNIQUE INDEX IF NOT EXISTS "TaxDocument_creditNoteId_key"  ON "TaxDocument"("creditNoteId");
CREATE UNIQUE INDEX IF NOT EXISTS "TaxDocument_debitNoteId_key"   ON "TaxDocument"("debitNoteId");
CREATE UNIQUE INDEX IF NOT EXISTS "TaxDocument_cancelledById_key" ON "TaxDocument"("cancelledById");
CREATE UNIQUE INDEX IF NOT EXISTS "TaxDocument_companyId_branchId_seriePrefix_numero_key"
  ON "TaxDocument"("companyId", "branchId", "seriePrefix", "numero");
CREATE INDEX IF NOT EXISTS "TaxDocument_companyId_type_status_idx"
  ON "TaxDocument"("companyId", "type", "status");
CREATE INDEX IF NOT EXISTS "TaxDocument_companyId_fechaCertificacion_idx"
  ON "TaxDocument"("companyId", "fechaCertificacion");

CREATE TABLE IF NOT EXISTS "CreditNote" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "saleId"    TEXT NOT NULL,
  "branchId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "subtotal"  DECIMAL(10,2) NOT NULL,
  "tax"       DECIMAL(10,2) NOT NULL,
  "total"     DECIMAL(10,2) NOT NULL,
  "taxRegime" "TaxRegime" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "CreditNote_saleId_fkey"    FOREIGN KEY ("saleId")    REFERENCES "Sale"("id")    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditNote_branchId_fkey"  FOREIGN KEY ("branchId")  REFERENCES "Branch"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditNote_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreditNote_companyId_saleId_idx" ON "CreditNote"("companyId", "saleId");

CREATE TABLE IF NOT EXISTS "CreditNoteItem" (
  "id"           TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "saleItemId"   TEXT,
  "productId"    TEXT NOT NULL,
  "variantId"    TEXT,
  "description"  TEXT NOT NULL,
  "quantity"     INTEGER NOT NULL,
  "unitPrice"    DECIMAL(10,2) NOT NULL,
  "taxRate"      DECIMAL(5,4) NOT NULL,
  "subtotal"     DECIMAL(10,2) NOT NULL,
  "tax"          DECIMAL(10,2) NOT NULL,
  CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreditNoteItem_saleItemId_fkey"   FOREIGN KEY ("saleItemId")   REFERENCES "SaleItem"("id")   ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");

CREATE TABLE IF NOT EXISTS "DebitNote" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "saleId"    TEXT NOT NULL,
  "branchId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "subtotal"  DECIMAL(10,2) NOT NULL,
  "tax"       DECIMAL(10,2) NOT NULL,
  "total"     DECIMAL(10,2) NOT NULL,
  "taxRegime" "TaxRegime" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DebitNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "DebitNote_saleId_fkey"    FOREIGN KEY ("saleId")    REFERENCES "Sale"("id")    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DebitNote_branchId_fkey"  FOREIGN KEY ("branchId")  REFERENCES "Branch"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DebitNote_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DebitNote_companyId_saleId_idx" ON "DebitNote"("companyId", "saleId");

CREATE TABLE IF NOT EXISTS "DebitNoteItem" (
  "id"          TEXT NOT NULL,
  "debitNoteId" TEXT NOT NULL,
  "productId"   TEXT,
  "description" TEXT NOT NULL,
  "quantity"    INTEGER NOT NULL,
  "unitPrice"   DECIMAL(10,2) NOT NULL,
  "taxRate"     DECIMAL(5,4) NOT NULL,
  "subtotal"    DECIMAL(10,2) NOT NULL,
  "tax"         DECIMAL(10,2) NOT NULL,
  CONSTRAINT "DebitNoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DebitNoteItem_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "DebitNote"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DebitNoteItem_debitNoteId_idx" ON "DebitNoteItem"("debitNoteId");

-- ─────────────────────────────────────────
-- 5) Seed default TaxSeries (prefix='A', tipo FACT) por Branch existente
-- ─────────────────────────────────────────
-- Cada empresa-sucursal arranca con UNA serie FACT default. La empresa puede
-- agregar más prefijos o tipos NCRE/NDEB desde Settings cuando SAT le asigne
-- las autorizaciones.

INSERT INTO "TaxSeries" ("id", "companyId", "branchId", "documentType", "prefix", "nextNumber", "active", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  b."companyId",
  b."id",
  'FACT'::"TaxDocumentType",
  'A',
  1,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Branch" b
ON CONFLICT ("companyId", "branchId", "documentType", "prefix") DO NOTHING;

-- ─────────────────────────────────────────
-- 6) RLS en tablas nuevas (patrón Fase 13/14/15/17)
-- ─────────────────────────────────────────

ALTER TABLE "TaxSeries"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxDocument"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNote"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DebitNote"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DebitNoteItem"  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_tax_series" ON "TaxSeries";
CREATE POLICY "tenant_isolation_tax_series" ON "TaxSeries"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_tax_document" ON "TaxDocument";
CREATE POLICY "tenant_isolation_tax_document" ON "TaxDocument"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_credit_note" ON "CreditNote";
CREATE POLICY "tenant_isolation_credit_note" ON "CreditNote"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

-- CreditNoteItem no tiene companyId directo: lo derivamos vía padre.
DROP POLICY IF EXISTS "tenant_isolation_credit_note_item" ON "CreditNoteItem";
CREATE POLICY "tenant_isolation_credit_note_item" ON "CreditNoteItem"
  USING (EXISTS (
    SELECT 1 FROM "CreditNote" cn
    WHERE cn."id" = "CreditNoteItem"."creditNoteId"
      AND current_setting('app.tenant_id', true) = cn."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "CreditNote" cn
    WHERE cn."id" = "CreditNoteItem"."creditNoteId"
      AND current_setting('app.tenant_id', true) = cn."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_debit_note" ON "DebitNote";
CREATE POLICY "tenant_isolation_debit_note" ON "DebitNote"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_debit_note_item" ON "DebitNoteItem";
CREATE POLICY "tenant_isolation_debit_note_item" ON "DebitNoteItem"
  USING (EXISTS (
    SELECT 1 FROM "DebitNote" dn
    WHERE dn."id" = "DebitNoteItem"."debitNoteId"
      AND current_setting('app.tenant_id', true) = dn."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "DebitNote" dn
    WHERE dn."id" = "DebitNoteItem"."debitNoteId"
      AND current_setting('app.tenant_id', true) = dn."companyId"::text
  ));
