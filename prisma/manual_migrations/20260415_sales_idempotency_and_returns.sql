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
