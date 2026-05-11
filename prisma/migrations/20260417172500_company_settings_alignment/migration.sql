-- Migración Prisma equivalente a prisma/manual_migrations/20260417_company_settings_alignment.sql.
-- Estado: aplicada en producción el 2026-04-17. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260417172500_company_settings_alignment

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'FelProvider'
  ) THEN
    CREATE TYPE "FelProvider" AS ENUM ('NONE', 'INFILE', 'DIGIFACT');
  END IF;
END $$;

ALTER TABLE "CompanySettings"
ADD COLUMN IF NOT EXISTS "felCertificateUrl" TEXT,
ADD COLUMN IF NOT EXISTS "acceptsCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.12,
ADD COLUMN IF NOT EXISTS "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'GTQ',
ADD COLUMN IF NOT EXISTS "currencySymbol" TEXT NOT NULL DEFAULT 'Q';

ALTER TABLE "CompanySettings"
ALTER COLUMN "felProvider" SET DEFAULT 'NONE',
ALTER COLUMN "acceptsCash" SET DEFAULT true,
ALTER COLUMN "acceptsCard" SET DEFAULT true,
ALTER COLUMN "acceptsTransfer" SET DEFAULT true,
ALTER COLUMN "acceptsCredit" SET DEFAULT false,
ALTER COLUMN "taxIncluded" SET DEFAULT true,
ALTER COLUMN "currency" SET DEFAULT 'GTQ',
ALTER COLUMN "currencySymbol" SET DEFAULT 'Q';
