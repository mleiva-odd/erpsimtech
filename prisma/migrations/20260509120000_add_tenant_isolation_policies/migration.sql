-- Migración Prisma equivalente a prisma/manual_migrations/20260509_add_tenant_isolation_policies.sql.
-- Sprint 2.C.2 — Policies de aislamiento multi-tenant.
-- Estado: aplicada en producción el 2026-05-09 (vía MCP) en dos migraciones nombradas
-- add_tenant_isolation_policies_v2 y add_tenant_isolation_policies_hr_cash. Marcar
-- como aplicada con:
--   prisma migrate resolve --applied 20260509120000_add_tenant_isolation_policies
--
-- Patrón:
--   USING ("companyId"::text = current_setting('app.tenant_id', true))
-- - Si `current_setting` no está seteado → NULL → fila no visible (deny safe).
-- - Si está seteado → solo coincide cuando matchea el row.
-- LoginAttempt queda sin policy (pre-auth, sin companyId). Mantiene deny-all para anon.

-- ───── Top-level: tablas con companyId directo ─────

CREATE POLICY tenant_isolation ON public."Branch"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."User"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."CustomRole"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Category"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Product"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."InventoryAdjustment"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Supplier"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."PurchaseOrder"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Customer"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Sale"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."CompanySettings"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Subscription"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."AuditLog"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Notification"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."StockTransfer"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."DeliveryNote"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."AccountingCategory"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."AccountingEntry"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."SupplierPayable"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."BankAccount"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Company"
  FOR ALL USING (id::text = current_setting('app.tenant_id', true))
  WITH CHECK (id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Employee"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON public."Payroll"
  FOR ALL USING ("companyId"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true));

-- ───── Sub-models con relación al parent ─────

CREATE POLICY tenant_isolation ON public."SaleReturn"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Sale" s
    WHERE s.id = "SaleReturn"."saleId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Sale" s
    WHERE s.id = "SaleReturn"."saleId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."ProductVariant"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Product" p
    WHERE p.id = "ProductVariant"."productId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Product" p
    WHERE p.id = "ProductVariant"."productId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."ProductStock"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Product" p
    WHERE p.id = "ProductStock"."productId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Product" p
    WHERE p.id = "ProductStock"."productId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."ProductBundleItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Product" p
    WHERE p.id = "ProductBundleItem"."bundleProductId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Product" p
    WHERE p.id = "ProductBundleItem"."bundleProductId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."PurchaseOrderItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."PurchaseOrder" po
    WHERE po.id = "PurchaseOrderItem"."purchaseOrderId"
      AND po."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."PurchaseOrder" po
    WHERE po.id = "PurchaseOrderItem"."purchaseOrderId"
      AND po."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."SaleItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Sale" s
    WHERE s.id = "SaleItem"."saleId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Sale" s
    WHERE s.id = "SaleItem"."saleId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."SaleReturnItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."SaleReturn" sr
    JOIN public."Sale" s ON s.id = sr."saleId"
    WHERE sr.id = "SaleReturnItem"."saleReturnId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."SaleReturn" sr
    JOIN public."Sale" s ON s.id = sr."saleId"
    WHERE sr.id = "SaleReturnItem"."saleReturnId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."Payment"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Sale" s
    WHERE s.id = "Payment"."saleId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Sale" s
    WHERE s.id = "Payment"."saleId"
      AND s."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."AccountPayment"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Customer" c
    WHERE c.id = "AccountPayment"."customerId"
      AND c."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Customer" c
    WHERE c.id = "AccountPayment"."customerId"
      AND c."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."BankTransaction"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."BankAccount" b
    WHERE b.id = "BankTransaction"."bankAccountId"
      AND b."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."BankAccount" b
    WHERE b.id = "BankTransaction"."bankAccountId"
      AND b."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."SupplierPayment"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."SupplierPayable" sp
    WHERE sp.id = "SupplierPayment"."payableId"
      AND sp."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."SupplierPayable" sp
    WHERE sp.id = "SupplierPayment"."payableId"
      AND sp."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."StockTransferItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."StockTransfer" st
    WHERE st.id = "StockTransferItem"."stockTransferId"
      AND st."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."StockTransfer" st
    WHERE st.id = "StockTransferItem"."stockTransferId"
      AND st."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."DeliveryNoteItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."DeliveryNote" dn
    WHERE dn.id = "DeliveryNoteItem"."deliveryNoteId"
      AND dn."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."DeliveryNote" dn
    WHERE dn.id = "DeliveryNoteItem"."deliveryNoteId"
      AND dn."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."UserBranchAccess"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."User" u
    WHERE u.id = "UserBranchAccess"."userId"
      AND u."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u
    WHERE u.id = "UserBranchAccess"."userId"
      AND u."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."SessionLog"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."User" u
    WHERE u.id = "SessionLog"."userId"
      AND u."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."User" u
    WHERE u.id = "SessionLog"."userId"
      AND u."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."PayrollItem"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Payroll" p
    WHERE p.id = "PayrollItem"."payrollId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Payroll" p
    WHERE p.id = "PayrollItem"."payrollId"
      AND p."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."Attendance"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Employee" e
    WHERE e.id = "Attendance"."employeeId"
      AND e."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Employee" e
    WHERE e.id = "Attendance"."employeeId"
      AND e."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."LeaveRequest"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Employee" e
    WHERE e.id = "LeaveRequest"."employeeId"
      AND e."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Employee" e
    WHERE e.id = "LeaveRequest"."employeeId"
      AND e."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."CashRegister"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."Branch" b
    WHERE b.id = "CashRegister"."branchId"
      AND b."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Branch" b
    WHERE b.id = "CashRegister"."branchId"
      AND b."companyId"::text = current_setting('app.tenant_id', true)));

CREATE POLICY tenant_isolation ON public."CashRegisterTransaction"
  FOR ALL USING (EXISTS (SELECT 1 FROM public."CashRegister" cr
    JOIN public."Branch" b ON b.id = cr."branchId"
    WHERE cr.id = "CashRegisterTransaction"."cashRegisterId"
      AND b."companyId"::text = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public."CashRegister" cr
    JOIN public."Branch" b ON b.id = cr."branchId"
    WHERE cr.id = "CashRegisterTransaction"."cashRegisterId"
      AND b."companyId"::text = current_setting('app.tenant_id', true)));
