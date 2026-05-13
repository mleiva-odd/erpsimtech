-- Fase 20 · Ventas enterprise · STEP 1: agregar valores nuevos al enum SaleStatus.
--
-- Postgres no permite usar nuevos valores de enum en la MISMA migración donde
-- se agregaron (SqlState 55P04). Por eso esta migración SOLO toca el enum.
-- El resto (tablas/columnas/RLS/backfill) va en `20260525000100_sales_enterprise`.
--
-- IDEMPOTENTE.

ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'ORDER';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_DELIVERED';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'INVOICED';
