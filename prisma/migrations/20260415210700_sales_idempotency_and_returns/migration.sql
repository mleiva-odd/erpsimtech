-- Migración Prisma equivalente a prisma/manual_migrations/20260415_sales_idempotency_and_returns.sql.
-- Estado: aplicada en producción el 2026-04-15. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260415210700_sales_idempotency_and_returns
-- Conservamos IF NOT EXISTS / IF NOT EXISTS porque la baseline 0_init ya
-- incluyó estas columnas y constraints en el SQL inicial (refleja el schema
-- vigente). Esta migración existe para preservar la historia.

ALTER TABLE "Sale"
ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_companyId_clientRequestId_key"
ON "Sale"("companyId", "clientRequestId");

CREATE INDEX IF NOT EXISTS "SaleReturn_saleId_createdAt_idx"
ON "SaleReturn"("saleId", "createdAt");

CREATE TABLE IF NOT EXISTS "SaleReturnItem" (
  "id" TEXT NOT NULL,
  "saleReturnId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleReturnItem_saleReturnId_fkey"
    FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleReturnItem_saleItemId_fkey"
    FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SaleReturnItem_saleReturnId_idx"
ON "SaleReturnItem"("saleReturnId");

CREATE INDEX IF NOT EXISTS "SaleReturnItem_saleItemId_idx"
ON "SaleReturnItem"("saleItemId");
