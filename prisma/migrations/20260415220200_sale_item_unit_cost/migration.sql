-- Migración Prisma equivalente a prisma/manual_migrations/20260415_sale_item_unit_cost.sql.
-- Estado: aplicada en producción el 2026-04-15. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260415220200_sale_item_unit_cost

ALTER TABLE "SaleItem"
ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(10, 2);
