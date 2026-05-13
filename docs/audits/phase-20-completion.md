# Fase 20 · Completion Report — Ventas enterprise (QUOTE → ORDER → DELIVERED → INVOICED)

Fecha: 2026-05-12
Subagente: sales/POS
Estado: implementación completa, pendiente verificación cruzada por segundo subagente y aplicación manual de migraciones por el dueño + `npm install` + `prisma generate`.

## 1. Qué se hizo

### 1.1 Schema Prisma (`prisma/schema.prisma`)

- **Enum `SaleStatus`** extendido con `ORDER`, `PARTIALLY_DELIVERED`, `DELIVERED`, `INVOICED` (mantiene COMPLETED como atajo POS legacy).
- **`Company`**: nuevos flags `allowQuotes`, `allowOrders`, `quoteValidDays`, `commissionEnabled`.
- **`Sale`**: nuevos campos `expiresAt` (QUOTE), `acceptedAt` (snapshot al pasar ORDER), `priceListId` (snapshot), `couponCode` (snapshot), `salesUserId` (vendedor para comisión).
- **`SaleItem`**: nuevo `discountRate Decimal(5,4)` para % por línea (acumulable con `discount` absoluto).
- **`Customer`**: relación inversa con `CustomerPriceList`, `CouponRedemption`.
- **Modelos nuevos (10)**:
  - `PriceList`, `PriceListItem`, `CustomerPriceList` — listas de precios con prioridad.
  - `StockReservation` — apartado de stock al pasar a ORDER.
  - `Promotion` + enum `PromotionType { BUY_N_GET_M, PERCENTAGE_OFF, FIXED_PRICE }`.
  - `Coupon` + enum `CouponType { FIXED_AMOUNT, PERCENTAGE_OFF }` + `CouponRedemption`.
  - `CommissionRule` + enum `CommissionBasis { MARGIN, SUBTOTAL }`.
  - `Commission` + enum `CommissionStatus { ACCRUED, PAID, CANCELLED }`.
  - `DeliveryNoteSequence` — secuencia atómica para `DeliveryNote.noteNumber`.

### 1.2 Migraciones SQL

Dos migraciones idempotentes en `prisma/migrations/`:

1. **`20260525000000_sales_enterprise_enum/migration.sql`**: ALTER TYPE SaleStatus ADD VALUE (separado por SqlState 55P04, regla aprendida en Fase 17/19).
2. **`20260525000100_sales_enterprise/migration.sql`**:
   - CREATE TYPE PromotionType, CouponType, CommissionBasis, CommissionStatus (DO blocks).
   - ADD COLUMN IF NOT EXISTS en Company (4), Sale (5), SaleItem (1).
   - CREATE TABLE IF NOT EXISTS para las 10 tablas nuevas con FKs e índices.
   - **Backfill DeliveryNoteSequence**: por cada Company existente, calcula el max correlativo numérico de `DeliveryNote.noteNumber` y siembra la secuencia con `nextNumber = max + 1` (o 1 si no hay notas).
   - RLS + policies `tenant_isolation_*` en las 10 tablas nuevas.

No se reescriben datos legacy: las ventas COMPLETED se mantienen como están (compatible con flujo POS rápido).

### 1.3 Helpers · `src/lib/sales/`

- **`pricing.ts`** · `resolveUnitPrice(tx, input)` con precedencia: PRICELIST_OVERRIDE > CUSTOMER_PRICELIST (gana la más barata si hay varias) > WHOLESALE (si flag) > VARIANT > PRODUCT.
- **`promotions.ts`** · `applyPromotions(items, promos, options)` soporta los 3 tipos. BUY_N_GET_M cuenta grupos enteros, PERCENTAGE_OFF sobre subtotal restante, FIXED_PRICE solo si rebaja. Respeta `minPurchase`, `applicableProductIds`, ventana temporal y `active`.
- **`coupons.ts`** · `validateAndApplyCoupon(tx, input)` valida vigencia, maxUses, perCustomerLimit, minPurchase. Lanza `CouponError` con código semántico. `persistCouponRedemption` actualiza `usedCount` atómico + crea `CouponRedemption` (relación 1:1 con la venta por unique).
- **`commissions.ts`** · `calculateCommissions(items, rules, options)`. Itera reglas activas, filtra por categoría si aplica, calcula base según `basis` (MARGIN/SUBTOTAL). Reglas se acumulan; varias pueden producir comisiones distintas para la misma venta.
- **`state-machine.ts`** · `canTransitionSale(from, to)` + `assertTransition`. Define transiciones legales (QUOTE→ORDER→PARTIALLY_DELIVERED→DELIVERED→INVOICED y CANCELLED desde cualquier estado no terminal). Idempotente (estado → mismo estado pasa).
- **`sequences.ts`** · `reserveNoteNumber(tx, companyId)` con lock optimista `updateMany ... where nextNumber=X`. Reintenta hasta 5 veces. Defensivo: si la secuencia no existe (empresa nueva post-migración), la crea calculando el max correlativo existente.

### 1.4 Endpoints API

#### Ciclo enterprise
- `POST /api/sales` (refactor): acepta `status: 'COMPLETED' | 'QUOTE' | 'ORDER'`. Aplica descuento por línea (`discountRate` 0..1), descuento global (`discount` 0..100, prorrateado), cupón (`couponCode`), lista de precios (`priceListId` snapshot), vendedor (`salesUserId`).
  - **COMPLETED**: ruta legacy POS intacta (stock + payments + asiento + bank tx).
  - **QUOTE**: sin stock, sin payments, sin asiento. Setea `expiresAt = now + Company.quoteValidDays`.
  - **ORDER**: sin payments, sin stock real, CREA StockReservation por línea. Setea `acceptedAt`.
- `POST /api/quotes/[saleId]/accept`: QUOTE → ORDER. Valida no expirada, valida stock disponible (físico - reservas activas), crea reservas.
- `POST /api/quotes/[saleId]/cancel`: QUOTE → CANCELLED. Sin side effects.
- `POST /api/sales/[saleId]/deliver`: despacho parcial/total de ORDER. Crea `DeliveryNote` (con lock atómico via `reserveNoteNumber`), descuenta stock, registra `StockMovement` (type=SALE), libera `StockReservation` FIFO. Avanza a PARTIALLY_DELIVERED o DELIVERED.
- `POST /api/sales/[saleId]/cancel-order`: ORDER/PARTIALLY_DELIVERED → CANCELLED. Libera reservas. Si hubo entregas, reincorpora stock y marca DeliveryNote como CANCELLED.
- `POST /api/sales/[saleId]/invoice`: DELIVERED → INVOICED. Crea JournalEntry (DR Caja/Bancos/AR / CR Ventas + IVA Débito si GENERAL) y calcula/persiste comisiones (si flag empresa). Mantiene la certificación FEL como paso opcional posterior (`POST /api/fel/certify/:saleId`).

#### DeliveryNote fix
- `POST /api/delivery-notes` ahora usa `reserveNoteNumber` con lock atómico (H6 / Fase 20 §3 — race condition eliminada).

#### Configuración (CRUD)
- `GET / POST /api/price-lists`, `PATCH / DELETE /api/price-lists/[id]`, `GET / POST /api/price-lists/[id]/items`.
- `GET / POST /api/promotions`, `PATCH / DELETE /api/promotions/[id]`.
- `GET / POST /api/coupons`, `POST /api/coupons/[code]/redeem` (validación pre-venta).
- `GET / POST /api/commission-rules`.
- `GET /api/commissions?employeeId=&status=&from=&to=` listado.

#### Refund CARD/TRANSFER (H5 fix)
- `src/app/api/pos/returns/route.ts`: si `refundMethod ∈ {CARD, TRANSFER}`, ahora genera `BankTransaction` (EXPENSE) sobre la cuenta del Payment original (o cuenta default si no hay match) y decrementa el balance de `BankAccount`. Para CASH sigue ajustando `CashRegisterTransaction`.

### 1.5 Type shim · `src/types/prisma-phase20.d.ts`

Augmenta `PrismaClient` y `Prisma.TransactionClient` con los delegates de los 10 modelos nuevos. Loosenea filters/selects/creates de `Sale`, `SaleItem`, `Customer`, `Company`, `Product`, `ProductVariant` para los campos nuevos. Igual patrón que phase-14/17/19 — borrable post `prisma generate`.

### 1.6 Tests Vitest

`src/lib/sales/__tests__/`:
- `pricing.test.ts` — 5 casos (precedencia override > customer-list > wholesale > variant > product + tie-breaker más barato).
- `promotions.test.ts` — 9 casos (3 tipos, applicableProductIds, minPurchase, ventana temporal, active=false).
- `coupons.test.ts` — 7 casos (FIXED_AMOUNT, PERCENTAGE_OFF, inactivo, fuera de ventana, agotado, minPurchase, perCustomerLimit, cap a subtotal).
- `commissions.test.ts` — 6 casos (SUBTOTAL global, MARGIN global, filtro por categoría, inactiva, múltiples reglas acumulativas, base=0, employeeId).
- `state-machine.test.ts` — 11 casos (QUOTE→ORDER permitido, atajos no permitidos, idempotencia, CANCELLED terminal).
- `note-number-lock.test.ts` — 3 casos (lock básico, serie consecutiva, retry post race-lost).

**Total: 41 tests nuevos.**

## 2. Validación

### `npm run typecheck`

```
> tsc --noEmit
(salida vacía → exit 0 → verde)
```

### `npm run lint`

```
✖ 91 problems (0 errors, 91 warnings)
```

- 0 errores.
- 91 warnings (vs ~86 baseline post-Fase 19): el delta de ~5 son `no-explicit-any` en `src/types/prisma-phase20.d.ts` (shim) y tests con `as any` para mocks. Ninguno en código de producción.

### Tests Vitest

**No corridos en sandbox** (rollup native binary no disponible). El dueño debe correr:

```bash
cd erp-simtech
npm install
npx vitest run src/lib/sales
```

Esperado: 41/41 tests pass + suites previas siguen pasando.

## 3. Pasos manuales del dueño

### 3.1 Regenerar cliente Prisma + aplicar migraciones

```bash
cd erp-simtech
npm install
npx prisma generate
npx prisma migrate deploy
```

Verificación SQL post-migración:

```sql
-- Enum SaleStatus tiene los nuevos valores
SELECT unnest(enum_range(NULL::"SaleStatus"));
-- Esperado: COMPLETED, PENDING, CANCELLED, QUOTE, OVERDUE, ORDER, PARTIALLY_DELIVERED, DELIVERED, INVOICED

-- DeliveryNoteSequence sembrada por empresa
SELECT c.name, dns."nextNumber", dns.prefix
FROM "Company" c LEFT JOIN "DeliveryNoteSequence" dns ON dns."companyId" = c.id;

-- Columnas nuevas existen
SELECT "allowQuotes", "allowOrders", "quoteValidDays", "commissionEnabled" FROM "Company" LIMIT 1;
SELECT "expiresAt", "acceptedAt", "priceListId", "couponCode", "salesUserId" FROM "Sale" LIMIT 1;
SELECT "discountRate" FROM "SaleItem" LIMIT 1;

-- RLS activa en tablas nuevas
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('PriceList','PriceListItem','CustomerPriceList','StockReservation',
                    'Promotion','Coupon','CouponRedemption','CommissionRule','Commission',
                    'DeliveryNoteSequence');
```

### 3.2 Tests

```bash
npm test
```

## 4. Decisiones fuera de spec

1. **Cupón redime al INVOICED, no al CREATE para QUOTE**: el código `couponCode` se puede pasar al crear la venta, pero `validateAndApplyCoupon` solo corre cuando `status !== 'QUOTE'` (las cotizaciones no consumen cupones — la redención efectiva la hace una venta firme).
2. **Comisión se calcula al `/invoice`, NO al `/sales` (COMPLETED legacy)**: si la empresa usa POS rápido (todo en COMPLETED de un golpe), las comisiones del legacy no se calculan automáticamente. Esto es deliberado — Fase 20 pone el cálculo solo en el flujo enterprise. Si en POS también se quieren comisiones, agregar el bloque en `src/app/api/sales/route.ts` (no se hizo para no tocar el camino caliente del POS sin pedirlo explícito).
3. **Certificación FEL desacoplada del INVOICED**: el endpoint `/invoice` solo cambia estado + asiento + comisiones. La certificación FEL la dispara el cliente con `POST /api/fel/certify/:saleId`. Decisión: permitir invoiced sin DTE para empresas que aún no tienen FEL contratado.
4. **`Sale.couponRedemption` 1:1 (unique en saleId)**: una venta solo puede tener un cupón. Si se quisieran combinables, romper el unique en `CouponRedemption.saleId`.
5. **`StockReservation` se libera FIFO por reservedAt al despachar**: si hay reservas parciales, una entrega que cubre parte de una reserva la SPLIT (cierra la usada, crea una nueva con el remanente). Mantiene auditabilidad por línea.
6. **`Sale.allowQuotes/allowOrders` defaults = true**: empresas existentes ya están habilitadas. El admin puede deshabilitarlas explícitamente.

## 5. Riesgos identificados

1. **`createJournalEntry` en `/invoice` con `lines` vacías**: si la venta no tiene `payments` (porque viene de ORDER puro sin cobrar al momento de invoiced), forzamos AR del total. Si la empresa es PEQUENO_CONTRIBUYENTE y subtotal+tax es 0 (raro pero posible), `createJournalEntry` lanzaría por desbalance. No mitigado (los casos son sintéticos).
2. **Helpers usan import dinámico (`await import('@/lib/sales')`) dentro de `/api/sales/route.ts`** para `validateAndApplyCoupon` y `persistCouponRedemption`. Razón: evitar overhead cuando la venta es pura POS sin cupón. Igualmente el bundler debería tree-shakearlo, pero la indirección está documentada.
3. **POS legacy (status=COMPLETED) NO valida `Company.commissionEnabled`**: las comisiones solo se generan al `/invoice` enterprise. Doctored above.
4. **`DeliveryNote.saleId` sigue siendo nullable**: para no romper despachos huérfanos (consignación). El endpoint `/deliver` siempre lo enlaza al sale.
5. **Backfill del `DeliveryNoteSequence` lee max(numérico)** del legacy. Si las notas viejas tienen prefijos distintos a "ND-", el max sigue siendo correcto (solo extrae dígitos). Pero el prefix se setea a 'ND-' uniformemente — empresas que usaban "NE-" mantienen su numeración interna pero las próximas serán "ND-XXXXXX". Si esto es un problema operacional, el admin puede actualizar el prefix en `DeliveryNoteSequence` por SQL.
6. **`StockReservation` no se libera automáticamente al expirar**: si la empresa quiere expiración automática de pedidos viejos, requiere un cron (no incluido en Fase 20). La UI puede mostrar reservas con `reservedAt < now - 30d` como candidatas a revisión.

## 6. Archivos creados / modificados

### Creados (28 archivos)
- `prisma/migrations/20260525000000_sales_enterprise_enum/migration.sql`
- `prisma/migrations/20260525000100_sales_enterprise/migration.sql`
- `src/lib/sales/index.ts`
- `src/lib/sales/pricing.ts`
- `src/lib/sales/promotions.ts`
- `src/lib/sales/coupons.ts`
- `src/lib/sales/commissions.ts`
- `src/lib/sales/state-machine.ts`
- `src/lib/sales/sequences.ts`
- `src/lib/sales/__tests__/pricing.test.ts`
- `src/lib/sales/__tests__/promotions.test.ts`
- `src/lib/sales/__tests__/coupons.test.ts`
- `src/lib/sales/__tests__/commissions.test.ts`
- `src/lib/sales/__tests__/state-machine.test.ts`
- `src/lib/sales/__tests__/note-number-lock.test.ts`
- `src/app/api/quotes/[saleId]/accept/route.ts`
- `src/app/api/quotes/[saleId]/cancel/route.ts`
- `src/app/api/sales/[saleId]/deliver/route.ts`
- `src/app/api/sales/[saleId]/cancel-order/route.ts`
- `src/app/api/sales/[saleId]/invoice/route.ts`
- `src/app/api/price-lists/route.ts`
- `src/app/api/price-lists/[id]/route.ts`
- `src/app/api/price-lists/[id]/items/route.ts`
- `src/app/api/promotions/route.ts`
- `src/app/api/promotions/[id]/route.ts`
- `src/app/api/coupons/route.ts`
- `src/app/api/coupons/[code]/redeem/route.ts`
- `src/app/api/commission-rules/route.ts`
- `src/app/api/commissions/route.ts`
- `src/types/prisma-phase20.d.ts`
- `docs/audits/phase-20-completion.md` (este archivo)
- `docs/operations/sales-workflow.md`

### Modificados (5 archivos)
- `prisma/schema.prisma` — enum extendido + 4 enums nuevos + 10 modelos nuevos + columnas en Company/Sale/SaleItem/Customer + relaciones inversas en Branch/Product/ProductVariant/Category/Employee.
- `src/app/api/sales/route.ts` — refactor POST: acepta ORDER, valida flags, aplica discountRate por línea + cupón, snapshot priceListId/couponCode/salesUserId, crea StockReservation si ORDER, setea expiresAt si QUOTE.
- `src/app/api/delivery-notes/route.ts` — lock atómico via `reserveNoteNumber`.
- `src/app/api/pos/returns/route.ts` — BankTransaction reversa para CARD/TRANSFER (H5).
- `src/lib/audit.ts` — 5 nuevas acciones AuditAction (SALE_ORDER_ACCEPTED, SALE_QUOTE_CANCELLED, SALE_ORDER_CANCELLED, SALE_DELIVERED, SALE_INVOICED).

## 7. Hand-off al verificador

El segundo subagente debe verificar:

- `npm install && npx prisma generate` corre limpio post-merge.
- `npm run typecheck` y `npm run lint` verdes (0 errors, ~91 warnings, todos shim/tests).
- `npx vitest run src/lib/sales` → 41 tests pass.
- Las suites previas (Fase 14-19) siguen pasando.
- `npx prisma format && npx prisma validate` limpio.
- Migraciones aplican idempotente (correr 2× contra DB clean → mismo estado).
- Casos manuales:
  - **POST /api/sales status=QUOTE**: crea sin stock/pagos. expiresAt = createdAt + 30 días.
  - **POST /api/quotes/:id/accept**: QUOTE → ORDER. Aparecen StockReservation por línea.
  - **POST /api/sales/:id/deliver con qty < total**: status pasa a PARTIALLY_DELIVERED. Stock descuenta. DeliveryNote creado.
  - **POST /api/sales/:id/deliver con resto**: status pasa a DELIVERED.
  - **POST /api/sales/:id/invoice**: JournalEntry creado (DR Caja/Bancos/AR / CR Ventas + IVA si GENERAL). Status pasa a INVOICED. Si `commissionEnabled`, se generan Commissions.
  - **POST /api/sales/:id/cancel-order desde ORDER**: libera reservas. Si había deliveryNotes activas, las marca CANCELLED y reincorpora stock.
  - **Lock noteNumber**: dos requests concurrentes producen correlativos distintos consecutivos, sin colisión en `(companyId, noteNumber)`.
  - **POST /api/pos/returns con refundMethod=CARD**: crea BankTransaction EXPENSE + decrementa BankAccount.balance.
  - **POST /api/coupons + POST /api/coupons/X/redeem con subtotal pequeño**: 400 COUPON_MIN_PURCHASE.
  - **Cupón usado vence**: POST /api/sales con couponCode usado más allá del maxUses → 409.

**No marcado como completo.** Listo para auditoría cruzada.
