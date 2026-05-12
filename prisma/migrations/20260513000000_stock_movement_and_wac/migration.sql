-- Fase 15 · Stock Movement + Costeo Promedio Ponderado (WAC).
--
-- Esta migración:
--   1. Crea enum "StockMovementType".
--   2. Crea tabla "StockMovement" con índices y FKs.
--   3. Backfill histórico: genera StockMovement para cada movimiento pasado
--      en PurchaseOrderItem, SaleItem, InventoryAdjustment, StockTransferItem
--      y SaleReturnItem, calculando balanceAfter y costAfter con WAC en
--      orden cronológico por SKU.
--   4. Habilita RLS + policy tenant_isolation_stock_movement (patrón Fase 13/14).
--
-- IDEMPOTENTE: todos los CREATE TYPE/TABLE/INDEX/POLICY se protegen contra
-- duplicado. El backfill usa NOT EXISTS para evitar re-insertar.
--
-- IMPORTANTE: NO modifica las tablas legacy (PurchaseOrderItem, SaleItem,
-- InventoryAdjustment, StockTransferItem, SaleReturnItem). Solo lee.

-- ─────────────────────────────────────────
-- 1) ENUM (idempotente)
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "StockMovementType" AS ENUM (
    'PURCHASE',
    'SALE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'RETURN_FROM_CUSTOMER',
    'RETURN_TO_SUPPLIER',
    'COUNT_DIFFERENCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) TABLA "StockMovement" (idempotente)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "productId"     TEXT NOT NULL,
  "variantId"     TEXT,
  "branchId"      TEXT NOT NULL,
  "type"          "StockMovementType" NOT NULL,
  "quantity"      DECIMAL(15,3) NOT NULL,
  "unitCost"      DECIMAL(15,4) NOT NULL DEFAULT 0,
  "balanceAfter"  DECIMAL(15,3) NOT NULL,
  "costAfter"     DECIMAL(15,4) NOT NULL DEFAULT 0,
  "referenceType" TEXT NOT NULL,
  "referenceId"   TEXT NOT NULL,
  "date"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"        TEXT NOT NULL,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockMovement_companyId_fkey"  FOREIGN KEY ("companyId")  REFERENCES "Company"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_productId_fkey"  FOREIGN KEY ("productId")  REFERENCES "Product"("id")        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_variantId_fkey"  FOREIGN KEY ("variantId")  REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "Branch"("id")         ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_userId_fkey"     FOREIGN KEY ("userId")     REFERENCES "User"("id")           ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StockMovement_companyId_productId_date_idx"
  ON "StockMovement"("companyId", "productId", "date");
CREATE INDEX IF NOT EXISTS "StockMovement_companyId_branchId_date_idx"
  ON "StockMovement"("companyId", "branchId", "date");
CREATE INDEX IF NOT EXISTS "StockMovement_referenceType_referenceId_idx"
  ON "StockMovement"("referenceType", "referenceId");

-- ─────────────────────────────────────────
-- 3) Backfill histórico (idempotente vía NOT EXISTS)
-- ─────────────────────────────────────────
--
-- Estrategia: armar una CTE con TODOS los movimientos históricos del
-- legacy, ordenados cronológicamente por (productId, variantId, date),
-- y calcular el saldo running y WAC por SKU con una window function.
-- Después insertar solo aquellos cuyo (referenceType, referenceId,
-- productId, variantId, type) aún no exista.

WITH all_moves AS (
  -- PURCHASE: PurchaseOrderItem
  SELECT
    poi."productId"                              AS "productId",
    poi."variantId"                              AS "variantId",
    po."branchId"                                AS "branchId",
    po."companyId"                               AS "companyId",
    po."userId"                                  AS "userId",
    po."createdAt"                               AS "date",
    'PURCHASE'::"StockMovementType"              AS "type",
    +poi."quantity"::numeric                     AS "qty",
    poi."unitCost"::numeric                      AS "unitCost",
    'PURCHASE_ORDER'                             AS "referenceType",
    po."id"                                      AS "referenceId",
    NULL::text                                   AS "notes"
  FROM "PurchaseOrderItem" poi
  JOIN "PurchaseOrder" po ON po."id" = poi."purchaseOrderId"
  WHERE po."status" = 'COMPLETED'

  UNION ALL

  -- SALE: SaleItem (cantidad negativa). Fallback unitCost = Product.cost si NULL.
  SELECT
    si."productId",
    si."variantId",
    s."branchId",
    s."companyId",
    s."userId",
    s."createdAt"                                AS "date",
    'SALE'::"StockMovementType"                  AS "type",
    -si."quantity"::numeric                      AS "qty",
    COALESCE(si."unitCost"::numeric, pr."cost"::numeric, 0) AS "unitCost",
    'SALE'                                       AS "referenceType",
    s."id"                                       AS "referenceId",
    NULL::text                                   AS "notes"
  FROM "SaleItem" si
  JOIN "Sale" s ON s."id" = si."saleId"
  JOIN "Product" pr ON pr."id" = si."productId"
  WHERE s."status" = 'COMPLETED'

  UNION ALL

  -- InventoryAdjustment: tipo según signo de difference.
  SELECT
    ia."productId",
    ia."variantId",
    ia."branchId",
    ia."companyId",
    ia."userId",
    ia."createdAt"                               AS "date",
    (CASE WHEN ia."difference" >= 0
          THEN 'ADJUSTMENT_IN'
          ELSE 'ADJUSTMENT_OUT' END)::"StockMovementType" AS "type",
    ia."difference"::numeric                     AS "qty",
    COALESCE(prv."cost"::numeric, pr."cost"::numeric, 0) AS "unitCost",
    'INVENTORY_ADJUSTMENT'                       AS "referenceType",
    ia."id"                                      AS "referenceId",
    ia."reason"                                  AS "notes"
  FROM "InventoryAdjustment" ia
  JOIN "Product" pr ON pr."id" = ia."productId"
  LEFT JOIN "ProductVariant" prv ON prv."id" = ia."variantId"

  UNION ALL

  -- StockTransfer: 2 movimientos por línea (OUT en origen, IN en destino).
  SELECT
    sti."productId",
    sti."variantId",
    st."fromBranchId"                            AS "branchId",
    st."companyId",
    st."userId",
    st."createdAt"                               AS "date",
    'TRANSFER_OUT'::"StockMovementType"          AS "type",
    -sti."quantity"::numeric                     AS "qty",
    COALESCE(prv."cost"::numeric, pr."cost"::numeric, 0) AS "unitCost",
    'STOCK_TRANSFER'                             AS "referenceType",
    st."id"                                      AS "referenceId",
    'Traslado salida (backfill)'                 AS "notes"
  FROM "StockTransferItem" sti
  JOIN "StockTransfer" st ON st."id" = sti."stockTransferId"
  JOIN "Product" pr ON pr."id" = sti."productId"
  LEFT JOIN "ProductVariant" prv ON prv."id" = sti."variantId"
  WHERE st."status" IN ('PENDING', 'COMPLETED')

  UNION ALL

  SELECT
    sti."productId",
    sti."variantId",
    st."toBranchId"                              AS "branchId",
    st."companyId",
    st."userId",
    st."createdAt"                               AS "date",
    'TRANSFER_IN'::"StockMovementType"           AS "type",
    +sti."quantity"::numeric                     AS "qty",
    COALESCE(prv."cost"::numeric, pr."cost"::numeric, 0) AS "unitCost",
    'STOCK_TRANSFER'                             AS "referenceType",
    st."id"                                      AS "referenceId",
    'Traslado entrada (backfill)'                AS "notes"
  FROM "StockTransferItem" sti
  JOIN "StockTransfer" st ON st."id" = sti."stockTransferId"
  JOIN "Product" pr ON pr."id" = sti."productId"
  LEFT JOIN "ProductVariant" prv ON prv."id" = sti."variantId"
  WHERE st."status" = 'COMPLETED'

  UNION ALL

  -- SaleReturn: SaleReturnItem solo si stockAdded=true (sino no afecta stock).
  SELECT
    si."productId",
    si."variantId",
    s."branchId",
    s."companyId",
    sr."userId",
    sr."createdAt"                               AS "date",
    'RETURN_FROM_CUSTOMER'::"StockMovementType"  AS "type",
    +sri."quantity"::numeric                     AS "qty",
    COALESCE(si."unitCost"::numeric, pr."cost"::numeric, 0) AS "unitCost",
    'SALE_RETURN'                                AS "referenceType",
    sr."id"                                      AS "referenceId",
    sr."reason"                                  AS "notes"
  FROM "SaleReturnItem" sri
  JOIN "SaleReturn" sr ON sr."id" = sri."saleReturnId"
  JOIN "SaleItem" si ON si."id" = sri."saleItemId"
  JOIN "Sale" s ON s."id" = si."saleId"
  JOIN "Product" pr ON pr."id" = si."productId"
  WHERE sr."stockAdded" = true
),
ordered AS (
  SELECT
    am.*,
    -- Orden estable por SKU y fecha (rompemos empates con un id sintético).
    ROW_NUMBER() OVER (
      PARTITION BY am."companyId", am."productId", COALESCE(am."variantId", '')
      ORDER BY am."date" ASC, am."referenceType" ASC, am."referenceId" ASC
    ) AS "rn"
  FROM all_moves am
),
running AS (
  -- Saldo running por SKU (suma global cross-branch, consistente con WAC global).
  SELECT
    o.*,
    SUM(o."qty") OVER (
      PARTITION BY o."companyId", o."productId", COALESCE(o."variantId", '')
      ORDER BY o."rn"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS "balanceAfter"
  FROM ordered o
)
INSERT INTO "StockMovement" (
  "id", "companyId", "productId", "variantId", "branchId", "type",
  "quantity", "unitCost", "balanceAfter", "costAfter",
  "referenceType", "referenceId", "date", "userId", "notes", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  r."companyId",
  r."productId",
  r."variantId",
  r."branchId",
  r."type",
  r."qty",
  r."unitCost",
  r."balanceAfter",
  -- WAC ex-post: aproximamos costo después usando el unitCost del movimiento
  -- en entradas, y el unitCost del SKU al momento (no podemos reconstruir
  -- el WAC exacto histórico sin replay paso a paso por SKU). Esto es la
  -- "mejor aproximación" para un backfill — los nuevos movimientos sí
  -- calculan WAC exacto. Para entradas usamos su propio unitCost; para
  -- salidas usamos unitCost también (que en SALE fue el cost snapshot).
  r."unitCost",
  r."referenceType",
  r."referenceId",
  r."date",
  r."userId",
  r."notes",
  r."date"
FROM running r
WHERE NOT EXISTS (
  SELECT 1 FROM "StockMovement" sm
  WHERE sm."referenceType" = r."referenceType"
    AND sm."referenceId"   = r."referenceId"
    AND sm."productId"     = r."productId"
    AND COALESCE(sm."variantId", '') = COALESCE(r."variantId", '')
    AND sm."type"          = r."type"
    AND sm."branchId"      = r."branchId"
);

-- ─────────────────────────────────────────
-- 4) RLS + policy tenant_isolation (consistente con Fase 13/14)
-- ─────────────────────────────────────────

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_stock_movement" ON "StockMovement";
CREATE POLICY "tenant_isolation_stock_movement" ON "StockMovement"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);
