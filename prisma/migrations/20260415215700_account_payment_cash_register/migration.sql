-- Migración Prisma equivalente a prisma/manual_migrations/20260415_account_payment_cash_register.sql.
-- Estado: aplicada en producción el 2026-04-15. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260415215700_account_payment_cash_register

ALTER TABLE "AccountPayment"
ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT;

CREATE INDEX IF NOT EXISTS "AccountPayment_cashRegisterId_idx"
ON "AccountPayment" ("cashRegisterId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AccountPayment_cashRegisterId_fkey'
  ) THEN
    ALTER TABLE "AccountPayment"
    ADD CONSTRAINT "AccountPayment_cashRegisterId_fkey"
    FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
