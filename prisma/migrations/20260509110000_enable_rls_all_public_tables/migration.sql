-- Migración Prisma equivalente a prisma/manual_migrations/20260509_enable_rls_all_public_tables.sql.
-- Phase 2.C.1 — Enable Row Level Security on all public tables.
-- Estado: aplicada en producción el 2026-05-09. Marcar como aplicada con:
--   prisma migrate resolve --applied 20260509110000_enable_rls_all_public_tables
--
-- Con NO policies presentes, RLS deniega todo acceso para roles no privilegiados
-- (anon, authenticated). Prisma usaba `postgres` (BYPASSRLS por default) → su
-- comportamiento NO cambió al activar RLS.

ALTER TABLE public."Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CustomRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserBranchAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SessionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InventoryAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductBundleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PurchaseOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PurchaseOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AccountPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SaleReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SaleReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CashRegister" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CashRegisterTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompanySettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StockTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StockTransferItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DeliveryNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DeliveryNoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AccountingCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AccountingEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupplierPayable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupplierPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BankTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payroll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayrollItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LeaveRequest" ENABLE ROW LEVEL SECURITY;
