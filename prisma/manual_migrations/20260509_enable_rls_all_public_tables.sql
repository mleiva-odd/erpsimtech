-- Phase 2.C.1 — Enable Row Level Security on all public tables.
-- Status: APPLIED to Supabase project cfluozcpcrqfapqwquip on 2026-05-09 via MCP.
--
-- Context: 43 tables in the `public` schema were exposed via PostgREST API
-- to the `anon` and `authenticated` roles (the ones reachable with the
-- NEXT_PUBLIC_SUPABASE_ANON_KEY that lives in the client bundle). That meant
-- any visitor could query User.password (bcrypt hashes), SessionLog.token,
-- Sale, Customer, BankAccount, etc. via REST without authentication.
--
-- Resolution: enable RLS on all of them. With NO policies present, RLS denies
-- all access for non-privileged roles (anon, authenticated). The Next.js app
-- still works because:
--   - Server-side Supabase client uses SUPABASE_SERVICE_ROLE_KEY (BYPASSRLS).
--   - Prisma connects as the `postgres` superuser via DATABASE_URL (table
--     owner — RLS doesn't apply).
--
-- Verified on 2026-05-09 with `SET LOCAL ROLE anon` that User.password,
-- SessionLog.token, Sale and Customer return 0 rows. Advisor went from 43
-- ERROR (rls_disabled_in_public) + 2 ERROR (sensitive_columns_exposed) to
-- 43 INFO (rls_enabled_no_policy), which is the desired baseline.
--
-- Next step: Phase 2.C.2 will add per-table policies that scope rows by
-- `current_setting('app.tenant_id')::uuid` and a Prisma Client Extension
-- that sets that variable per request. That gives defense in depth.
--
-- Reversible with: ALTER TABLE public."<name>" DISABLE ROW LEVEL SECURITY;

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
