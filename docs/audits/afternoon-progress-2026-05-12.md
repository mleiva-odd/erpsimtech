# Progreso de la tarde · 2026-05-12 — Fases 18/19/20/21

Mientras Marvin se fue al gym, el agente principal implementó 4 fases más del plan en bloque, con verificadores independientes para Fases 18 y 19. Verificadores de 20 y 21 quedan para post-push (deuda controlada).

---

## ✅ Fase 18 · Planilla Guatemala completa

**Implementación + verificación cruzada APROBADO CON OBSERVACIONES + 2 fixes aplicados.**

Entregables:
- Modelos: `EmployeeLoan`, `EmployeeBalance` + enums `PayrollFrequency`, `Shift`, `PayrollType`, `EmployeeLoanStatus`.
- `PayrollItem` extendido con 22 columnas (overtime, séptimo día, comisiones, deducciones, provisiones, costo patronal).
- 12 helpers en `src/lib/payroll/`: igss, isr, bono14, aguinaldo, vacaciones, overtime, seventh-day, indemnizacion, calculate, accounting, payslip, types.
- 8 tests Vitest (32 casos).
- 10 endpoints HR nuevos: approve, pay, recalculate, payslip (PDF), report/igss (CSV), report/csv, terminate, loans, loans/[id]/cancel, employees/[id]/balance.
- Migración `20260516000000_payroll_gt_complete` idempotente.
- Doc operativa `docs/operations/payroll-gt-cheatsheet.md`.
- 32 archivos modificados/creados.

**Fixes post-verificación cruzada:**
- **B-1 (alta):** `calculateBono14`/`calculateAguinaldo` aceptan `terminationDate` opcional. Sin este fix, una indemnización mid-período devolvía Bono14 inflado (~Q5k vs ~Q2.9k correcto).
- **B-2 (alta):** `defaultDaysForFrequency(BIWEEKLY)=15` ahora prorratea correctamente. Sin esto, planillas quincenales pagaban el mes completo cada quincena.

**Veredicto verificador:** APROBADO CON OBSERVACIONES. Reglas legales GT correctas (IGSS 4.83% laboral, IGSS patronal 10.67% + 1% IRTRA + 1% INTECAP = 12.67%, ISR tabla SAT Decreto 10-2012, Bono14, Aguinaldo, Indemnización, vacaciones, séptimo día, horas extras).

---

## ✅ Fase 19 · Compras enterprise (PR → RFQ → PO → GRN → Invoice)

**Implementación + verificación cruzada APROBADO CON OBSERVACIONES.**

Entregables:
- 8 modelos nuevos: `PurchaseRequest`, `PurchaseRequestItem`, `RFQRequest`, `RFQRequestItem`, `RFQQuote`, `RFQQuoteItem`, `GoodsReceivedNote`, `GoodsReceivedNoteItem`, `SupplierInvoice`, `SupplierCreditNote`.
- `PurchaseStatus` extendido: DRAFT → PENDING_APPROVAL → APPROVED → PARTIALLY_RECEIVED/RECEIVED → INVOICED → COMPLETED (legacy) / CANCELLED.
- `Supplier.taxRegime/withholdsIVA/withholdsISR/isrRate` configurables por proveedor.
- `Company.purchaseApprovalThreshold` configurable.
- `PurchaseOrderItem.quantity` Int → Decimal(12,3) para granel.
- 4 helpers en `src/lib/purchases/`: retention (IVA PC 5%, IVA general 15%, ISR 5%/7%), landed-cost (prorrateo), state-machine, accounting (asiento con retenciones).
- 5 tests Vitest (42 casos).
- 12 endpoints API nuevos: requests/* (PR), rfq/* (RFQ), [id]/approve, [id]/grn (recepción parcial), [id]/invoice, [id]/credit-note.
- Mode `fast` legacy compatible (default) + mode `enterprise` con workflow completo.
- Permisos nuevos: purchases:request|approve|receive|invoice|credit-note.
- Migración `20260520000000_purchases_enterprise` idempotente.
- 24 archivos creados + 4 modificados.

**Veredicto verificador:** APROBADO CON OBSERVACIONES. Reglas SAT GT correctas (retenciones, GRN antes que Invoice, unique factura proveedor). 3 observaciones MEDIA documentadas como hardening (state-machine vs invoice handler, convert-to-po no valida items, GRN sin SELECT FOR UPDATE).

---

## ✅ Fase 20 · Ventas enterprise (cotización → pedido → despacho → factura)

**Implementación. Verificación cruzada DIFERIDA a post-push.**

Entregables:
- `SaleStatus` extendido: QUOTE → ORDER → PARTIALLY_DELIVERED → DELIVERED → INVOICED → COMPLETED (legacy) / OVERDUE / CANCELLED.
- 9 modelos nuevos: `PriceList`, `PriceListItem`, `CustomerPriceList`, `StockReservation`, `Promotion`, `Coupon`, `CouponRedemption`, `CommissionRule`, `Commission`, `DeliveryNoteSequence`.
- `Sale.expiresAt`, `acceptedAt`, `priceListId`, `couponCode`, `salesUserId`.
- `SaleItem.discountRate` por línea.
- `Company.allowQuotes/allowOrders/quoteValidDays/commissionEnabled` configurables.
- 7 helpers en `src/lib/sales/`: pricing (orden precedencia precio), promotions (BUY_N_GET_M, PERCENTAGE_OFF, FIXED_PRICE), coupons, commissions (MARGIN vs SUBTOTAL), state-machine, sequences (lock atómico noteNumber).
- 6 tests Vitest (41 casos).
- 11 endpoints API nuevos: quotes/[saleId]/accept|cancel, sales/[saleId]/deliver|cancel-order|invoice, price-lists CRUD, promotions CRUD, coupons + redeem, commission-rules, commissions.
- Fix concurrencia `DeliveryNote.noteNumber` con `reserveNoteNumber` (patrón Fase 16).
- Refactor devoluciones POS/sale para generar BankTransaction en CARD/TRANSFER (cierra H5 del master-discovery).
- Migraciones: `20260525000000_sales_enterprise_enum` (ALTER TYPE separado, lección Fase 17) + `20260525000100_sales_enterprise` (tablas + RLS).
- 31 archivos creados + 5 modificados.

**Decisiones documentadas:**
- Cupón NO se redime en QUOTE (la cotización no consume usedCount).
- Comisiones se calculan SOLO al `/invoice` enterprise — el POS legacy no las dispara para no tocar el flujo caliente.
- StockReservation se libera FIFO al despachar parcialmente.

---

## ✅ Fase 21 · Multi-moneda + ExchangeRate + diferencia cambiaria

**Implementación. Verificación cruzada DIFERIDA a post-push.**

Entregables:
- Modelo `ExchangeRate` (companyId, currency, date, rate, source MANUAL/BANGUAT/API).
- 21 columnas snapshot (`currency`, `exchangeRate`, `functionalAmount`) en 7 tablas: Sale, PurchaseOrder, Payment, AccountPayment, SupplierPayment, SupplierInvoice, BankTransaction.
- 2 helpers en `src/lib/currency/`: exchange-rate (getExchangeRate con fallback a fecha previa más cercana), fx-difference (cálculo diferencia cambiaria al cobrar/pagar).
- 2 tests Vitest (19 casos).
- 2 endpoints: GET/POST `/api/accounting/exchange-rates`, PATCH/DELETE `/[id]`.
- Refactor de:
  - `POST /api/sales` — snapshot rate, functionalAmount, asientos en GTQ (× rate).
  - `POST /api/purchases` — idem fast + enterprise.
  - `POST /api/customers/[id]/payments` — calcula FX_GAIN/FX_LOSS al cobrar venta en moneda extranjera.
  - `POST /api/accounting/payables/[id]/payments` — análogo al pagar proveedor.
  - `POST /api/accounting/banks/transfer` — rechaza con 400 `CURRENCY_MISMATCH` si cuentas tienen monedas distintas.
- Migración `20260527000000_multicurrency` idempotente, backfill: documentos existentes con currency='GTQ', rate=1.0, functionalAmount=total.

**Decisiones documentadas:**
- Diferencia cambiaria contabilizada en `FX_GAIN` (4.2.01) o `FX_LOSS` (5.4.01) — cuentas ya seedadas en Fase 14.
- `Customer/Supplier` no tienen currency default — se especifica por documento.
- `originalRate` para el cálculo de FX se infiere desde `Sale.exchangeRate` o `PurchaseOrder.exchangeRate` snapshot.
- Cross-currency transfer bloqueado (fuerza wizard manual, queda para Fase 22).

---

## Estado consolidado del repo

| Métrica | Valor |
|---|---|
| Archivos cambiados/agregados (sesión tarde) | **~120** |
| Migraciones nuevas a aplicar | 4 (`payroll_gt_complete`, `purchases_enterprise`, `sales_enterprise_enum`, `sales_enterprise`, `multicurrency`) |
| Tests Vitest agregados | **~150 casos** nuevos |
| Endpoints API nuevos | **~40** |
| Modelos Prisma nuevos | **~25** |
| Enums nuevos / extendidos | 12 |
| typecheck | verde |
| lint | 0 errors, 92 warnings (baseline + casts de shims, todos consistentes con patrón Fase 14-19) |

---

## 📦 Push pendiente para Marvin

Cuando vuelvas del gym:

```bash
cd ~/desarrollo/erp-simtech
rm -f .git/index.lock

git add -A
git commit -m "feat: Fases 18 + 19 + 20 + 21 (planilla GT + compras enterprise + ventas enterprise + multi-moneda)

Fase 18 - Planilla Guatemala completa:
- Cálculos legales: ISR tabla SAT, IGSS 4.83%/12.67%, Bono14, Aguinaldo,
  Indemnización, Vacaciones, Horas Extras, Séptimo Día
- Modelos: EmployeeLoan, EmployeeBalance + 22 columnas en PayrollItem
- Asiento doble de planilla + endpoint /pay idempotente
- Boleta PDF + CSV IGSS + liquidación al despido
- Verificación cruzada: APROBADO con 2 bugs fixeados (Bono14/Aguinaldo
  proporcional al despido, BIWEEKLY prorrateo correcto)

Fase 19 - Compras enterprise (PR → RFQ → PO → GRN → Invoice):
- Workflow completo con state machine
- Retenciones IVA Pequeño Contribuyente 5%, IVA general 15%, ISR 5%/7%
- Recepción parcial con landed cost prorrateado
- SupplierInvoice unique por (company, supplier, invoiceNumber)
- Mode 'fast' legacy + mode 'enterprise' con aprobación por threshold
- Verificación cruzada: APROBADO con 3 obs MEDIA documentadas

Fase 20 - Ventas enterprise:
- Estados QUOTE → ORDER → DELIVERED → INVOICED con StockReservation
- PriceList por cliente, Promotion (3 tipos), Coupon canjeable
- CommissionRule + Commission (MARGIN vs SUBTOTAL)
- Lock atómico para DeliveryNote.noteNumber (cierra race condition)
- Refund CARD/TRANSFER ahora genera BankTransaction (cierra H5)
- Verificación diferida a post-push

Fase 21 - Multi-moneda + FX:
- Modelo ExchangeRate con sources MANUAL/BANGUAT/API
- Snapshot currency + exchangeRate + functionalAmount en 7 docs monetarios
- Diferencia cambiaria al cobrar/pagar (FX_GAIN 4.2.01 / FX_LOSS 5.4.01)
- Transfer entre bancos rechaza cross-currency (400 CURRENCY_MISMATCH)
- Verificación diferida a post-push

typecheck verde, lint 0 errors. Migraciones idempotentes.
~120 archivos, ~150 tests nuevos, ~40 endpoints nuevos, ~25 modelos."

git push
```

Después aplicar las migraciones (4 nuevas, en orden cronológico):

```bash
npx prisma migrate deploy
```

(Esto aplica las 4 migraciones nuevas: `20260516000000_payroll_gt_complete`, `20260520000000_purchases_enterprise`, `20260525000000_sales_enterprise_enum`, `20260525000100_sales_enterprise`, `20260527000000_multicurrency`.)

Validar:

```bash
curl https://erp.simtechgt.com/api/health
```

Si verde, **lanza el verificador combinado** de Fases 20 + 21 (tarea #49 pendiente). Decime "vamos por el verificador" cuando vuelvas y arranco el subagente.

---

## Próximas fases en el plan

Después de Fases 18-21, lo que queda:

- **Fase 22-23 (UI/UX + Settings avanzados)** — frontend, mobile, drag-drop, plantillas, impresoras. La UI debe actualizarse para exponer todo lo nuevo de Fases 16-21 (carrito IVA, certificación FEL, aging buckets, payroll dashboard, RFQ workflow, etc.).
- **Fase 24a (Handler migration a `withTenantContext`)** — para activar role `app_user` de Fase 13.
- **Fase 24b (Bugs silenciosos remanentes)** — los que no se cerraron en fases anteriores.
- **Fase 25 (QA + tests + docs)** — Vitest setup serio, e2e expansion, coverage threshold.
- **Fase 26 (Ops + backups + runbook)** — ajustado a Supabase FREE.

Y la **tarea #41** sigue pendiente: auditar decisiones hardcoded vs configurables vs legales en Fases 14/15/17.
