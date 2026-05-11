-- Baseline migration · Fase 13 (Foundation)
-- Equivalente a `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma`
-- pero escrito a mano porque el sandbox no tiene red a la DB para correr `prisma migrate diff`.
--
-- IMPORTANTE: este SQL ya está aplicado en producción (Supabase project
-- cfluozcpcrqfapqwquip). El dueño debe correr en Supabase:
--   prisma migrate resolve --applied 20260101000000_init
-- para que Prisma lo registre como "ya aplicado" sin re-ejecutar.
--
-- Posteriores migraciones (manuales históricas) también deben marcarse
-- como aplicadas. Ver docs/audits/phase-13-completion.md.

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────

CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'USER');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'CREDIT');
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PENDING', 'CANCELLED', 'QUOTE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED');
CREATE TYPE "FelProvider" AS ENUM ('NONE', 'INFILE', 'DIGIFACT');
CREATE TYPE "AccountType" AS ENUM ('CASH_BOX', 'BANK_ACCOUNT', 'CREDIT_CARD', 'DIGITAL_WALLET');
CREATE TYPE "UnitOfMeasure" AS ENUM ('UNIT', 'KG', 'LB', 'LITER', 'GALLON', 'BOX');
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PayoutType" AS ENUM ('EXPENSE', 'WITHDRAWAL', 'REFUND');
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR');
CREATE TYPE "TransferStatus" AS ENUM ('COMPLETED', 'PENDING', 'CANCELLED');
CREATE TYPE "SaleChannel" AS ENUM ('POS', 'REMOTE', 'WEB');
CREATE TYPE "AccountingType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
CREATE TYPE "PayableStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HOLIDAY');
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK_LEAVE', 'PERSONAL_DAYS', 'OTHER');
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ─────────────────────────────────────────
-- TABLES (orden topológico de FKs)
-- ─────────────────────────────────────────

CREATE TABLE "Company" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "nit"       TEXT,
  "email"     TEXT NOT NULL,
  "phone"     TEXT,
  "logoUrl"   TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

CREATE TABLE "Branch" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "address"   TEXT,
  "phone"     TEXT,
  "isMain"    BOOLEAN NOT NULL DEFAULT false,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

CREATE TABLE "CustomRole" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "permissions" TEXT[] NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomRole_companyId_name_key" ON "CustomRole"("companyId", "name");

CREATE TABLE "User" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT,
  "branchId"     TEXT,
  "name"         TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "password"     TEXT NOT NULL,
  "role"         "Role" NOT NULL DEFAULT 'USER',
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "customRoleId" TEXT,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "UserBranchAccess" (
  "userId"   TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("userId", "branchId"),
  CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserBranchAccess_userId_idx" ON "UserBranchAccess"("userId");
CREATE INDEX "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");

CREATE TABLE "SessionLog" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SessionLog_token_key" ON "SessionLog"("token");

CREATE TABLE "Category" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

CREATE TABLE "Supplier" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "contactName" TEXT,
  "email"       TEXT,
  "phone"       TEXT,
  "nit"         TEXT,
  "address"     TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Supplier_companyId_nit_key" ON "Supplier"("companyId", "nit");
CREATE UNIQUE INDEX "Supplier_companyId_name_key" ON "Supplier"("companyId", "name");

CREATE TABLE "Product" (
  "id"             TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "categoryId"     TEXT NOT NULL,
  "sku"            TEXT NOT NULL,
  "barcode"        TEXT,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "price"          DECIMAL(10,2) NOT NULL,
  "cost"           DECIMAL(10,2) NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "isTaxExempt"    BOOLEAN NOT NULL DEFAULT false,
  "unitOfMeasure"  "UnitOfMeasure" NOT NULL DEFAULT 'UNIT',
  "wholesalePrice" DECIMAL(10,2),
  "supplierId"     TEXT,
  "hasVariants"    BOOLEAN NOT NULL DEFAULT false,
  "imageUrl"       TEXT,
  "isBundle"       BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
CREATE UNIQUE INDEX "Product_companyId_barcode_key" ON "Product"("companyId", "barcode");
CREATE INDEX "Product_companyId_active_idx" ON "Product"("companyId", "active");

CREATE TABLE "ProductVariant" (
  "id"             TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "sku"            TEXT NOT NULL,
  "barcode"        TEXT,
  "name"           TEXT NOT NULL,
  "price"          DECIMAL(10,2),
  "wholesalePrice" DECIMAL(10,2),
  "cost"           DECIMAL(10,2),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");

CREATE TABLE "ProductStock" (
  "id"        TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "branchId"  TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 0,
  "minStock"  INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "variantId" TEXT,
  CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductStock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductStock_productId_branchId_variantId_key" ON "ProductStock"("productId", "branchId", "variantId");
CREATE INDEX "ProductStock_branchId_quantity_idx" ON "ProductStock"("branchId", "quantity");

CREATE TABLE "InventoryAdjustment" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "branchId"    TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "oldQuantity" INTEGER NOT NULL,
  "newQuantity" INTEGER NOT NULL,
  "difference"  INTEGER NOT NULL,
  "variantId"   TEXT,
  "reason"      TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdjustment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "InventoryAdjustment_branchId_productId_idx" ON "InventoryAdjustment"("branchId", "productId");
CREATE INDEX "InventoryAdjustment_variantId_idx" ON "InventoryAdjustment"("variantId");

CREATE TABLE "ProductBundleItem" (
  "id"              TEXT NOT NULL,
  "bundleProductId" TEXT NOT NULL,
  "componentId"     TEXT NOT NULL,
  "quantity"        INTEGER NOT NULL DEFAULT 1,
  "variantId"       TEXT,
  CONSTRAINT "ProductBundleItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductBundleItem_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductBundleItem_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductBundleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductBundleItem_bundleProductId_componentId_variantId_key" ON "ProductBundleItem"("bundleProductId", "componentId", "variantId");

CREATE TABLE "PurchaseOrder" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "branchId"   TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "reference"  TEXT,
  "total"      DECIMAL(10,2) NOT NULL,
  "status"     "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PurchaseOrderItem" (
  "id"              TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "productId"       TEXT NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "unitCost"        DECIMAL(10,2) NOT NULL,
  "subtotal"        DECIMAL(10,2) NOT NULL,
  "variantId"       TEXT,
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Customer" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "email"       TEXT,
  "phone"       TEXT,
  "nit"         TEXT,
  "address"     TEXT,
  "creditLimit" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "balance"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CashRegister" (
  "id"             TEXT NOT NULL,
  "branchId"       TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "openingBalance" DECIMAL(10,2) NOT NULL,
  "closingBalance" DECIMAL(10,2),
  "status"         TEXT NOT NULL DEFAULT 'OPEN',
  "openedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"       TIMESTAMP(3),
  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashRegister_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BankAccount" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "type"          "AccountType" NOT NULL DEFAULT 'BANK_ACCOUNT',
  "accountNumber" TEXT,
  "currency"      TEXT NOT NULL DEFAULT 'GTQ',
  "balance"       DECIMAL(15,2) NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BankAccount_companyId_type_idx" ON "BankAccount"("companyId", "type");

CREATE TABLE "AccountPayment" (
  "id"             TEXT NOT NULL,
  "customerId"     TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "cashRegisterId" TEXT,
  "bankAccountId"  TEXT,
  "amount"         DECIMAL(10,2) NOT NULL,
  "method"         "PaymentMethod" NOT NULL,
  "reference"      TEXT,
  "notes"          TEXT,
  "status"         TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountPayment_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AccountPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AccountPayment_cashRegisterId_idx" ON "AccountPayment"("cashRegisterId");

CREATE TABLE "Sale" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "branchId"        TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "customerId"      TEXT,
  "cashRegisterId"  TEXT,
  "clientRequestId" TEXT,
  "invoiceNumber"   TEXT,
  "subtotal"        DECIMAL(10,2) NOT NULL,
  "discount"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "tax"             DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total"           DECIMAL(10,2) NOT NULL,
  "status"          "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "channel"         "SaleChannel" NOT NULL DEFAULT 'POS',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Sale_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Sale_companyId_invoiceNumber_key" ON "Sale"("companyId", "invoiceNumber");
CREATE UNIQUE INDEX "Sale_companyId_clientRequestId_key" ON "Sale"("companyId", "clientRequestId");
CREATE INDEX "Sale_companyId_status_createdAt_idx" ON "Sale"("companyId", "status", "createdAt");
CREATE INDEX "Sale_branchId_status_createdAt_idx" ON "Sale"("branchId", "status", "createdAt");
CREATE INDEX "Sale_companyId_channel_idx" ON "Sale"("companyId", "channel");

CREATE TABLE "SaleReturn" (
  "id"         TEXT NOT NULL,
  "saleId"     TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "reason"     TEXT NOT NULL,
  "amount"     DECIMAL(10,2) NOT NULL,
  "stockAdded" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SaleReturn_saleId_createdAt_idx" ON "SaleReturn"("saleId", "createdAt");

CREATE TABLE "SaleItem" (
  "id"        TEXT NOT NULL,
  "saleId"    TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "unitCost"  DECIMAL(10,2),
  "discount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  "subtotal"  DECIMAL(10,2) NOT NULL,
  "variantId" TEXT,
  CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "SaleReturnItem" (
  "id"           TEXT NOT NULL,
  "saleReturnId" TEXT NOT NULL,
  "saleItemId"   TEXT NOT NULL,
  "quantity"     INTEGER NOT NULL,
  "amount"       DECIMAL(10,2) NOT NULL,
  CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleReturnItem_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SaleReturnItem_saleReturnId_idx" ON "SaleReturnItem"("saleReturnId");
CREATE INDEX "SaleReturnItem_saleItemId_idx" ON "SaleReturnItem"("saleItemId");

CREATE TABLE "Payment" (
  "id"            TEXT NOT NULL,
  "saleId"        TEXT NOT NULL,
  "method"        "PaymentMethod" NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "reference"     TEXT,
  "bankAccountId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CashRegisterTransaction" (
  "id"             TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "type"           "PayoutType" NOT NULL DEFAULT 'EXPENSE',
  "amount"         DECIMAL(10,2) NOT NULL,
  "description"    TEXT NOT NULL,
  "reference"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashRegisterTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashRegisterTransaction_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashRegisterTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CompanySettings" (
  "id"                TEXT NOT NULL,
  "companyId"         TEXT NOT NULL,
  "storeName"         TEXT NOT NULL DEFAULT 'Mi Empresa POS',
  "address"           TEXT,
  "phone"             TEXT,
  "nit"               TEXT,
  "receiptMsg"        TEXT DEFAULT '¡Gracias por su compra!',
  "felEnabled"        BOOLEAN NOT NULL DEFAULT false,
  "felProvider"       "FelProvider" NOT NULL DEFAULT 'NONE',
  "felNitEmisor"      TEXT,
  "felApiUser"        TEXT,
  "felApiKey"         TEXT,
  "felCertificateUrl" TEXT,
  "acceptsCash"       BOOLEAN NOT NULL DEFAULT true,
  "acceptsCard"       BOOLEAN NOT NULL DEFAULT true,
  "acceptsTransfer"   BOOLEAN NOT NULL DEFAULT true,
  "acceptsCredit"     BOOLEAN NOT NULL DEFAULT false,
  "taxRate"           DECIMAL(5,4) NOT NULL DEFAULT 0.12,
  "taxIncluded"       BOOLEAN NOT NULL DEFAULT true,
  "currency"          TEXT NOT NULL DEFAULT 'GTQ',
  "currencySymbol"    TEXT NOT NULL DEFAULT 'Q',
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

CREATE TABLE "Subscription" (
  "id"                 TEXT NOT NULL,
  "companyId"          TEXT NOT NULL,
  "plan"               TEXT NOT NULL DEFAULT 'trial',
  "status"             "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "price"              DECIMAL(10,2) NOT NULL DEFAULT 0,
  "maxBranches"        INTEGER NOT NULL DEFAULT 1,
  "maxUsersPerBranch"  INTEGER NOT NULL DEFAULT 3,
  "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodEnd"   TIMESTAMP(3) NOT NULL,
  "trialEndsAt"        TIMESTAMP(3),
  "paymentProviderId"  TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

CREATE TABLE "AuditLog" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId"  TEXT,
  "userId"    TEXT,
  "entity"    TEXT NOT NULL,
  "entityId"  TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "changes"   JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_companyId_entity_idx" ON "AuditLog"("companyId", "entity");
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

CREATE TABLE "Notification" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "message"   TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL DEFAULT 'INFO',
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Notification_companyId_isRead_idx" ON "Notification"("companyId", "isRead");

CREATE TABLE "StockTransfer" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "fromBranchId" TEXT NOT NULL,
  "toBranchId"   TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "reference"    TEXT,
  "status"       "TransferStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockTransferItem" (
  "id"              TEXT NOT NULL,
  "stockTransferId" TEXT NOT NULL,
  "productId"       TEXT NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "variantId"       TEXT,
  CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransferItem_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockTransferItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DeliveryNote" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "branchId"      TEXT NOT NULL,
  "saleId"        TEXT,
  "customerId"    TEXT,
  "userId"        TEXT NOT NULL,
  "noteNumber"    TEXT,
  "recipientName" TEXT NOT NULL,
  "address"       TEXT NOT NULL,
  "phone"         TEXT,
  "notes"         TEXT,
  "status"        "DeliveryNoteStatus" NOT NULL DEFAULT 'PENDING',
  "dispatchedAt"  TIMESTAMP(3),
  "deliveredAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DeliveryNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeliveryNote_companyId_noteNumber_key" ON "DeliveryNote"("companyId", "noteNumber");
CREATE INDEX "DeliveryNote_companyId_status_idx" ON "DeliveryNote"("companyId", "status");
CREATE INDEX "DeliveryNote_saleId_idx" ON "DeliveryNote"("saleId");

CREATE TABLE "DeliveryNoteItem" (
  "id"             TEXT NOT NULL,
  "deliveryNoteId" TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "variantId"      TEXT,
  "quantity"       INTEGER NOT NULL,
  CONSTRAINT "DeliveryNoteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryNoteItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AccountingCategory" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "type"      "AccountingType" NOT NULL,
  "isSystem"  BOOLEAN NOT NULL DEFAULT false,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountingCategory_companyId_name_key" ON "AccountingCategory"("companyId", "name");

CREATE TABLE "BankTransaction" (
  "id"            TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "type"          "AccountingType" NOT NULL,
  "amount"        DECIMAL(15,2) NOT NULL,
  "reference"     TEXT,
  "description"   TEXT,
  "reconciled"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BankTransaction_bankAccountId_type_idx" ON "BankTransaction"("bankAccountId", "type");

CREATE TABLE "AccountingEntry" (
  "id"                TEXT NOT NULL,
  "companyId"         TEXT NOT NULL,
  "branchId"          TEXT,
  "categoryId"        TEXT NOT NULL,
  "type"              "AccountingType" NOT NULL,
  "description"       TEXT NOT NULL,
  "amount"            DECIMAL(10,2) NOT NULL,
  "referenceType"     TEXT,
  "referenceId"       TEXT,
  "date"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"            TEXT NOT NULL,
  "bankTransactionId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccountingCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountingEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountingEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AccountingEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountingEntry_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AccountingEntry_companyId_type_date_idx" ON "AccountingEntry"("companyId", "type", "date");
CREATE INDEX "AccountingEntry_companyId_categoryId_idx" ON "AccountingEntry"("companyId", "categoryId");
CREATE INDEX "AccountingEntry_referenceType_referenceId_idx" ON "AccountingEntry"("referenceType", "referenceId");

CREATE TABLE "SupplierPayable" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "supplierId"  TEXT NOT NULL,
  "purchaseId"  TEXT,
  "userId"      TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "paidAmount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  "status"      "PayableStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate"     TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierPayable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierPayable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SupplierPayable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplierPayable_purchaseId_key" ON "SupplierPayable"("purchaseId");
CREATE INDEX "SupplierPayable_companyId_status_idx" ON "SupplierPayable"("companyId", "status");
CREATE INDEX "SupplierPayable_supplierId_idx" ON "SupplierPayable"("supplierId");

CREATE TABLE "SupplierPayment" (
  "id"            TEXT NOT NULL,
  "payableId"     TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "method"        "PaymentMethod" NOT NULL,
  "reference"     TEXT,
  "notes"         TEXT,
  "status"        TEXT NOT NULL DEFAULT 'COMPLETED',
  "bankAccountId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SupplierPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Employee" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "branchId"        TEXT,
  "userId"          TEXT,
  "firstName"       TEXT NOT NULL,
  "lastName"        TEXT NOT NULL,
  "email"           TEXT,
  "phone"           TEXT,
  "documentId"      TEXT,
  "nit"             TEXT,
  "address"         TEXT,
  "position"        TEXT,
  "baseSalary"      DECIMAL(10,2) NOT NULL,
  "hireDate"        TIMESTAMP(3) NOT NULL,
  "terminationDate" TIMESTAMP(3),
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "bankAccount"     TEXT,
  "bankName"        TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

CREATE TABLE "Payroll" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "startDate"       TIMESTAMP(3) NOT NULL,
  "endDate"         TIMESTAMP(3) NOT NULL,
  "status"          "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
  "totalGross"      DECIMAL(10,2) NOT NULL,
  "totalDeductions" DECIMAL(10,2) NOT NULL,
  "totalNet"        DECIMAL(10,2) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payroll_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Payroll_companyId_idx" ON "Payroll"("companyId");

CREATE TABLE "PayrollItem" (
  "id"              TEXT NOT NULL,
  "payrollId"       TEXT NOT NULL,
  "employeeId"      TEXT NOT NULL,
  "baseSalary"      DECIMAL(10,2) NOT NULL,
  "bonusIncentive"  DECIMAL(10,2) NOT NULL DEFAULT 250.00,
  "otherBonuses"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "igss"            DECIMAL(10,2) NOT NULL,
  "isr"             DECIMAL(10,2) NOT NULL DEFAULT 0,
  "otherDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "netSalary"       DECIMAL(10,2) NOT NULL,
  CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollItem_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PayrollItem_payrollId_idx" ON "PayrollItem"("payrollId");
CREATE INDEX "PayrollItem_employeeId_idx" ON "PayrollItem"("employeeId");

CREATE TABLE "Attendance" (
  "id"         TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL,
  "checkIn"    TIMESTAMP(3),
  "checkOut"   TIMESTAMP(3),
  "status"     "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

CREATE TABLE "LeaveRequest" (
  "id"           TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "type"         "LeaveType" NOT NULL,
  "startDate"    TIMESTAMP(3) NOT NULL,
  "endDate"      TIMESTAMP(3) NOT NULL,
  "reason"       TEXT,
  "status"       "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");

CREATE TABLE "LoginAttempt" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "email"     TEXT NOT NULL,
  "ipAddress" TEXT NOT NULL,
  "success"   BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt" DESC);
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt" DESC);
