-- Fase 20 · Ventas enterprise · STEP 2: ciclo QUOTE→ORDER→DELIVERED→INVOICED.
--
-- Esta migración:
--   1. Crea enums nuevos: PromotionType, CouponType, CommissionBasis, CommissionStatus.
--   2. Agrega columnas a Company (allowQuotes, allowOrders, quoteValidDays, commissionEnabled).
--   3. Agrega columnas a Sale (expiresAt, acceptedAt, priceListId, couponCode, salesUserId).
--   4. Agrega columna a SaleItem (discountRate).
--   5. Crea tablas nuevas: PriceList, PriceListItem, CustomerPriceList, StockReservation,
--      Promotion, Coupon, CouponRedemption, CommissionRule, Commission, DeliveryNoteSequence.
--   6. Backfill: DeliveryNoteSequence inicializado por empresa con nextNumber tomando
--      el correlativo más alto existente + 1.
--   7. RLS + policies en las 10 tablas nuevas.
--
-- READ-ONLY de Fase 14/15/16/17/18/19: no se tocan sus tablas más allá de Company / Sale / SaleItem
-- (que ya estaban modificadas por Fase 16).
--
-- IDEMPOTENTE: DO blocks, IF NOT EXISTS, ON CONFLICT DO NOTHING.

-- ─────────────────────────────────────────
-- 1) Enums nuevos
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PromotionType" AS ENUM ('BUY_N_GET_M', 'PERCENTAGE_OFF', 'FIXED_PRICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CouponType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionBasis" AS ENUM ('MARGIN', 'SUBTOTAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionStatus" AS ENUM ('ACCRUED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) Columnas nuevas en Company
-- ─────────────────────────────────────────

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "allowQuotes"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowOrders"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "quoteValidDays"    INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "commissionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────
-- 3) Columnas nuevas en Sale (Fase 20)
-- ─────────────────────────────────────────

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "expiresAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acceptedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "priceListId" TEXT,
  ADD COLUMN IF NOT EXISTS "couponCode"  TEXT,
  ADD COLUMN IF NOT EXISTS "salesUserId" TEXT;

-- ─────────────────────────────────────────
-- 4) Columna nueva en SaleItem (discountRate)
-- ─────────────────────────────────────────

ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "discountRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────
-- 5) Tablas nuevas
-- ─────────────────────────────────────────

-- PriceList
CREATE TABLE IF NOT EXISTS "PriceList" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriceList_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceList_companyId_name_key"
  ON "PriceList"("companyId", "name");
CREATE INDEX IF NOT EXISTS "PriceList_companyId_active_idx"
  ON "PriceList"("companyId", "active");

-- PriceListItem
CREATE TABLE IF NOT EXISTS "PriceListItem" (
  "id"          TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "variantId"   TEXT,
  "price"       DECIMAL(10,2) NOT NULL,
  CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriceListItem_priceListId_fkey"
    FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PriceListItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PriceListItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceListItem_priceListId_productId_variantId_key"
  ON "PriceListItem"("priceListId", "productId", "variantId");

-- CustomerPriceList
CREATE TABLE IF NOT EXISTS "CustomerPriceList" (
  "customerId"  TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "assignedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPriceList_pkey" PRIMARY KEY ("customerId", "priceListId"),
  CONSTRAINT "CustomerPriceList_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerPriceList_priceListId_fkey"
    FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- StockReservation
CREATE TABLE IF NOT EXISTS "StockReservation" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "saleId"     TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "variantId"  TEXT,
  "branchId"   TEXT NOT NULL,
  "quantity"   DECIMAL(15,3) NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "reason"     TEXT,
  CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockReservation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockReservation_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockReservation_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockReservation_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockReservation_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StockReservation_companyId_productId_branchId_idx"
  ON "StockReservation"("companyId", "productId", "branchId");
CREATE INDEX IF NOT EXISTS "StockReservation_saleId_idx"
  ON "StockReservation"("saleId");

-- Promotion
CREATE TABLE IF NOT EXISTS "Promotion" (
  "id"                   TEXT NOT NULL,
  "companyId"            TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "type"                 "PromotionType" NOT NULL,
  "minPurchase"          DECIMAL(10,2),
  "applicableProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "quantityRequired"     INTEGER,
  "quantityFree"         INTEGER,
  "discountRate"         DECIMAL(5,4),
  "fixedPrice"           DECIMAL(10,2),
  "startsAt"             TIMESTAMP(3) NOT NULL,
  "endsAt"               TIMESTAMP(3) NOT NULL,
  "active"               BOOLEAN NOT NULL DEFAULT true,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Promotion_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Promotion_companyId_active_startsAt_endsAt_idx"
  ON "Promotion"("companyId", "active", "startsAt", "endsAt");

-- Coupon
CREATE TABLE IF NOT EXISTS "Coupon" (
  "id"               TEXT NOT NULL,
  "companyId"        TEXT NOT NULL,
  "code"             TEXT NOT NULL,
  "type"             "CouponType" NOT NULL,
  "amount"           DECIMAL(10,2),
  "percentage"       DECIMAL(5,4),
  "maxUses"          INTEGER,
  "usedCount"        INTEGER NOT NULL DEFAULT 0,
  "perCustomerLimit" INTEGER,
  "minPurchase"      DECIMAL(10,2),
  "validFrom"        TIMESTAMP(3) NOT NULL,
  "validUntil"       TIMESTAMP(3) NOT NULL,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Coupon_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_companyId_code_key"
  ON "Coupon"("companyId", "code");
CREATE INDEX IF NOT EXISTS "Coupon_companyId_active_idx"
  ON "Coupon"("companyId", "active");

-- CouponRedemption
CREATE TABLE IF NOT EXISTS "CouponRedemption" (
  "id"         TEXT NOT NULL,
  "couponId"   TEXT NOT NULL,
  "saleId"     TEXT NOT NULL,
  "customerId" TEXT,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount"     DECIMAL(10,2) NOT NULL,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouponRedemption_couponId_fkey"
    FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CouponRedemption_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CouponRedemption_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CouponRedemption_saleId_key"
  ON "CouponRedemption"("saleId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_idx"
  ON "CouponRedemption"("couponId");

-- CommissionRule
CREATE TABLE IF NOT EXISTS "CommissionRule" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "categoryId" TEXT,
  "basis"      "CommissionBasis" NOT NULL DEFAULT 'MARGIN',
  "rate"       DECIMAL(5,4) NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionRule_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommissionRule_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CommissionRule_companyId_active_idx"
  ON "CommissionRule"("companyId", "active");

-- Commission
CREATE TABLE IF NOT EXISTS "Commission" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "ruleId"        TEXT NOT NULL,
  "saleId"        TEXT NOT NULL,
  "employeeId"    TEXT,
  "amount"        DECIMAL(10,2) NOT NULL,
  "status"        "CommissionStatus" NOT NULL DEFAULT 'ACCRUED',
  "paidAt"        TIMESTAMP(3),
  "payrollItemId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Commission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Commission_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Commission_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Commission_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Commission_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Commission_companyId_status_idx"
  ON "Commission"("companyId", "status");
CREATE INDEX IF NOT EXISTS "Commission_saleId_idx"
  ON "Commission"("saleId");

-- DeliveryNoteSequence
CREATE TABLE IF NOT EXISTS "DeliveryNoteSequence" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "prefix"     TEXT NOT NULL DEFAULT 'ND-',
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryNoteSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryNoteSequence_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNoteSequence_companyId_key"
  ON "DeliveryNoteSequence"("companyId");

-- FK Sale.priceListId → PriceList (idempotente)
DO $$ BEGIN
  ALTER TABLE "Sale"
    ADD CONSTRAINT "Sale_priceListId_fkey"
      FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 6) Backfill DeliveryNoteSequence por empresa
-- ─────────────────────────────────────────
-- Para cada empresa existente, calcular el correlativo numérico máximo de
-- DeliveryNote.noteNumber (parseado de la parte final numérica) y sembrar
-- DeliveryNoteSequence con nextNumber = max + 1 (o 1 si no hay notas).

INSERT INTO "DeliveryNoteSequence" ("id", "companyId", "nextNumber", "prefix", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  COALESCE((
    SELECT MAX(
      CAST(
        regexp_replace(dn."noteNumber", '\D', '', 'g')
        AS INTEGER
      )
    ) + 1
    FROM "DeliveryNote" dn
    WHERE dn."companyId" = c."id"
      AND dn."noteNumber" IS NOT NULL
      AND dn."noteNumber" ~ '\d'
  ), 1),
  'ND-',
  CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId") DO NOTHING;

-- ─────────────────────────────────────────
-- 7) RLS en tablas nuevas (patrón Fase 13/14/15/16/17/18/19)
-- ─────────────────────────────────────────

ALTER TABLE "PriceList"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceListItem"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerPriceList"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockReservation"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Promotion"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouponRedemption"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommissionRule"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Commission"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryNoteSequence" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_price_list" ON "PriceList";
CREATE POLICY "tenant_isolation_price_list" ON "PriceList"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_price_list_item" ON "PriceListItem";
CREATE POLICY "tenant_isolation_price_list_item" ON "PriceListItem"
  USING (EXISTS (
    SELECT 1 FROM "PriceList" pl
    WHERE pl."id" = "PriceListItem"."priceListId"
      AND current_setting('app.tenant_id', true) = pl."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "PriceList" pl
    WHERE pl."id" = "PriceListItem"."priceListId"
      AND current_setting('app.tenant_id', true) = pl."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_customer_price_list" ON "CustomerPriceList";
CREATE POLICY "tenant_isolation_customer_price_list" ON "CustomerPriceList"
  USING (EXISTS (
    SELECT 1 FROM "PriceList" pl
    WHERE pl."id" = "CustomerPriceList"."priceListId"
      AND current_setting('app.tenant_id', true) = pl."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "PriceList" pl
    WHERE pl."id" = "CustomerPriceList"."priceListId"
      AND current_setting('app.tenant_id', true) = pl."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_stock_reservation" ON "StockReservation";
CREATE POLICY "tenant_isolation_stock_reservation" ON "StockReservation"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_promotion" ON "Promotion";
CREATE POLICY "tenant_isolation_promotion" ON "Promotion"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_coupon" ON "Coupon";
CREATE POLICY "tenant_isolation_coupon" ON "Coupon"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_coupon_redemption" ON "CouponRedemption";
CREATE POLICY "tenant_isolation_coupon_redemption" ON "CouponRedemption"
  USING (EXISTS (
    SELECT 1 FROM "Coupon" c
    WHERE c."id" = "CouponRedemption"."couponId"
      AND current_setting('app.tenant_id', true) = c."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Coupon" c
    WHERE c."id" = "CouponRedemption"."couponId"
      AND current_setting('app.tenant_id', true) = c."companyId"::text
  ));

DROP POLICY IF EXISTS "tenant_isolation_commission_rule" ON "CommissionRule";
CREATE POLICY "tenant_isolation_commission_rule" ON "CommissionRule"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_commission" ON "Commission";
CREATE POLICY "tenant_isolation_commission" ON "Commission"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_delivery_note_sequence" ON "DeliveryNoteSequence";
CREATE POLICY "tenant_isolation_delivery_note_sequence" ON "DeliveryNoteSequence"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);
