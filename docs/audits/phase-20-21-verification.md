# Phases 20 + 21 · Verification Report (combined)

Fecha: 2026-05-12
Verificador: segundo subagente (read-only)
Alcance: Fase 20 (Ventas enterprise) + Fase 21 (Multi-moneda + diferencia
cambiaria) tras CI verde. NO participó en la implementación.

## Veredicto

**APROBADO CON OBSERVACIONES.**

Ambas fases están sustancialmente completas y respetan las reglas legales
y de diseño documentadas. Cumplen los V1–V22 con dos hallazgos ALTA y
varios MEDIA/BAJA que no bloquean Fase 22 (UI) pero que conviene
arreglar en paralelo con la UI o en una mini-pre-fase 22a.

Las dos observaciones ALTA no son bugs de la lógica nueva: son omisiones
de paridad entre dos endpoints simétricos (`/api/pos/returns` vs
`/api/sales/[id]/return`) y entre el motor de cobro/pago FX y el motor
de devoluciones (no compensa FX). Ninguna impide arrancar la UI de
Fase 22, pero ambas deberían cerrarse antes de habilitar multi-moneda
operacionalmente en producción.

---

## Resultados V1–V22

| # | Validación | Estado | Evidencia |
|---|---|---|---|
| V1 | Compilación · typecheck verde / lint 0 errors | OK (heredado del completion) | completion 20 §2 + completion 21 §3. No re-ejecutado en este pase. |
| V2 | 3 migraciones idempotentes | OK | `prisma/migrations/20260525000000_sales_enterprise_enum/migration.sql` (ALTER TYPE separado), `20260525000100_sales_enterprise/migration.sql:23-37` (DO blocks), `20260527000000_multicurrency/migration.sql:24-26` (DO block). Todas usan `IF NOT EXISTS` y `ON CONFLICT DO NOTHING`. |
| V3 | SaleStatus extendido + state machine | OK | `prisma/schema.prisma:827-841` (9 valores). `src/lib/sales/state-machine.ts:28-38` con `ALLOWED` table y `assertTransition` defensivo. |
| V4 | POST /api/sales status=QUOTE | OK | `src/app/api/sales/route.ts:119-121` (sin payments), `467-473` (expiresAt = now + quoteValidDays), `288` (no descuenta stock si !COMPLETED), `732` (no asiento si !COMPLETED). |
| V5 | POST /api/quotes/[id]/accept | OK | `src/app/api/quotes/[id]/accept/route.ts:39-53` (valida QUOTE + no expirada), `:57-86` (stock disponible = físico − reservas), `:89-103` (crea reservations), `:107` (acceptedAt). |
| V6 | StockReservation modelo | OK | `prisma/schema.prisma:2133-2152` (saleId, productId, branchId, quantity Decimal 15,3, reservedAt, releasedAt). Liberado en `/deliver` FIFO. |
| V7 | Despacho parcial /deliver | OK | `src/app/api/sales/[id]/deliver/route.ts:74-85` (dispatchedMap), `:111-138` (DeliveryNote con lock atómico), `:146-152` (updateMany count===1 race-safe), `:168-219` (libera reservation con split si parcial), `:227-235` (PARTIALLY_DELIVERED vs DELIVERED). |
| V8 | /invoice DELIVERED → INVOICED | OK | `src/app/api/sales/[id]/invoice/route.ts:43-49` (valida DELIVERED), `:63-103` (JournalEntry con AR/CASH/BANKS + SALES + VAT_OUTPUT si GENERAL), `:106-148` (comisiones si flag). COGS heredado de Fase 15. |
| V9 | /cancel-order libera reservas | OK | `src/app/api/sales/[id]/cancel-order/route.ts:50-55` (libera reservations), `:66-95` (re-stock y CANCELL de DeliveryNotes), `:98` (status CANCELLED). |
| V10 | POS legacy COMPLETED | OK | `src/app/api/sales/route.ts:288-323` (stock check + decrement only if COMPLETED), `:732-800` (asiento + COGS). Sin comisiones por decisión documentada. |
| V11 | PriceList resolveUnitPrice | OK | `src/lib/sales/pricing.ts:48-131` con precedencia: OVERRIDE → CUSTOMER_PRICELIST (más barato) → WHOLESALE → VARIANT → PRODUCT. Modelos `prisma/schema.prisma:2087-2127`. |
| V12 | Promotion engine | OK | `src/lib/sales/promotions.ts` (3 tipos). Modelo `prisma/schema.prisma:2156-2181`. |
| V13 | Coupon redime al ORDER/COMPLETED no QUOTE | OK | `src/app/api/sales/route.ts:378` (`if couponCode && status !== 'QUOTE'`). `src/lib/sales/coupons.ts:57-128` (valida activo, ventana, maxUses, perCustomerLimit, minPurchase). Redención persistente: `:134-155`. Modelo unique `saleId` en `CouponRedemption`. |
| V14 | CommissionRule / calculateCommissions | OK | `src/lib/sales/commissions.ts:55-82` (MARGIN o SUBTOTAL, filtra por categoryId, acumulables). Generadas con `ACCRUED` en `/invoice` (`route.ts:144-147`). |
| V15 | DeliveryNote lock atómico | OK | `src/lib/sales/sequences.ts:72-96` (lock optimista `updateMany where nextNumber=X` + retry MAX_RETRIES=5). Backfill defensivo en `ensureSequence` (líneas 36-66). Migración 20260525000100 hace backfill por empresa (líneas 297-316). Test `note-number-lock.test.ts:58-83` cubre el retry. |
| V16 | Refund CARD/TRANSFER → BankTransaction | **OBS-ALTA** | `src/app/api/pos/returns/route.ts:317-348` cierra H5 para POS. Pero `src/app/api/sales/[id]/return/route.ts` (endpoint paralelo de remote/general) NO crea BankTransaction, NO genera JournalEntry y NO reversa pago bancario. Ver Obs. A-1. |
| V17 | ExchangeRate modelo | OK | `prisma/schema.prisma:2312-2330`: `companyId`, `currency` ISO-3, `date @db.Date`, `rate Decimal(18,8)`, `source ExchangeRateSource`, `@@unique([companyId, currency, date])` + 2 índices. RLS en `migration.sql:149-154`. |
| V18 | getExchangeRate | OK | `src/lib/currency/exchange-rate.ts:66-102`. GTQ → 1.0 sin DB (línea 73). `findFirst date<=input orderBy desc` (líneas 85-92). Throw `ExchangeRateError(422)` con mensaje accionable si falta (línea 94-99). |
| V19 | Snapshot en 7 tablas | OK | Migración `20260527000000_multicurrency/migration.sql:62-102` agrega `currency` (default GTQ NOT NULL), `exchangeRate` y `functionalAmount` nullable a Sale, PurchaseOrder, Payment, AccountPayment, SupplierPayment, SupplierInvoice y BankTransaction. Backfill en `:110-143`. POST sales: `src/app/api/sales/route.ts:479-486` lee rate + `:515-517` persiste snapshot + `:736-739` usa functional para asiento. POST purchases: `src/app/api/purchases/route.ts:258-264` y `:441-471` ídem. |
| V20 | Diferencia cambiaria al cobrar | OK con observación | `src/app/api/customers/[id]/payments/route.ts:118-169` (resuelve originalRate desde última Sale crédito misma currency), `:219-263` (asiento DR Caja/Bancos por paymentFunctional, CR AR por arOriginalAmount, DR/CR FX por delta). Side='COLLECTION', regla rate↑→GAIN / rate↓→LOSS. Ver Obs. A-2 (devoluciones no compensan FX). |
| V21 | Diferencia cambiaria al pagar | OK | `src/app/api/accounting/payables/[id]/payments/route.ts:71-186`. originalRate viene de `payable.purchase.exchangeRate`. Asiento DR AP por apOriginalAmount, CR BANKS por paymentFunctional, DR FX_LOSS o CR FX_GAIN según `calculateFxDifference(side='PAYMENT')`. Algebraicamente cuadra: rate↑→pagamos más GTQ→LOSS. |
| V22 | Transfer cross-currency rechazado | OK | `src/app/api/accounting/banks/transfer/route.ts:37-51` retorna 400 con `code: 'CURRENCY_MISMATCH'` (case-insensitive vía `(currency ?? 'GTQ').toUpperCase()`). |

---

## Observaciones detalladas

### OBS A-1 · `/api/sales/[id]/return` sigue sin BankTransaction ni JournalEntry de devolución · **Severidad ALTA**

`src/app/api/sales/[id]/return/route.ts` (líneas 82-159) procesa
devoluciones para ventas remote/general pero **NO genera**:

- `BankTransaction` reversa para devoluciones CARD/TRANSFER.
- `CashRegisterTransaction` para devoluciones CASH.
- `JournalEntry` con DR Devoluciones / CR Caja|Bancos.

Solo crea `SaleReturn`, re-stockea inventario y ajusta el balance del
cliente si había crédito. La fase 20 cerró H5 en `pos/returns/route.ts`
pero olvidó el otro endpoint. El completion 20 §1.4 lo menciona solo
para POS — no es un error de la spec V16 (la regla legal #5 sí está
cumplida si el flujo único es POS) pero rompe el principio del Master
Discovery H5 que pide "Devoluciones CARD/TRANSFER afectan saldo
bancario" en todos los caminos.

**Impacto:** una devolución por este endpoint deja inventario
re-incorporado y balance de cliente ajustado, pero saldo de Banco y
P&L corruptos (ingreso original sigue intacto, sin contra-asiento).

**Cómo cerrarlo:** portar el bloque H5 de `pos/returns/route.ts:317-368`
al endpoint general. Replicar también el JournalEntry de devolución
parcial (líneas 350-368) con `ACCOUNTS.SALES_RETURNS` y método de
refund.

Archivo afectado: `src/app/api/sales/[id]/return/route.ts:82-159`.

---

### OBS A-2 · Devoluciones de venta en moneda extranjera no compensan FX · **Severidad ALTA**

Tanto `pos/returns/route.ts:317-368` como `sales/[id]/return/route.ts`
NO recalculan FX cuando la venta original fue en moneda extranjera. La
reversa bancaria/contable usa `refundAmount` directo en GTQ del libro
sin volver a leer rate ni comparar con `Sale.exchangeRate`.

**Impacto:** si vendo USD 100 a 7.85 (Q785), devuelvo a 7.95, el refund
bancario va a salir por Q785 (snapshot del libro de la venta) cuando
el cliente debería recibir el equivalente actual y la diferencia
debería contabilizarse como FX_GAIN/LOSS. Hoy queda como gap.

**Cómo cerrarlo:** al refund, leer `sale.exchangeRate` (originalRate),
llamar `getExchangeRate(tx, companyId, sale.currency, new Date())`
(currentRate) y agregar línea FX usando `calculateFxDifference({
side: 'COLLECTION_REVERSE' /* o nuevo side */ })`. Requiere extender
el helper `fx-difference.ts` con un caso de reversa de cobro, o
simplemente invertir la convención de COLLECTION.

Archivos afectados: `src/app/api/pos/returns/route.ts`,
`src/app/api/sales/[id]/return/route.ts`.

---

### OBS M-1 · POS legacy NO captura comisiones · **Severidad MEDIA**

Decisión documentada en `phase-20-completion.md` §4.2 ("Comisión se
calcula al `/invoice`, NO al `/sales` COMPLETED legacy"). Es
intencional, pero crea asimetría: empresas con `commissionEnabled=true`
y flujo POS (todo en COMPLETED) no acreditan comisiones aunque hayan
configurado reglas. El operador puede confundirse.

**Recomendación:** agregar guard explícito en el cálculo (warning en
respuesta o reject 400 `COMMISSIONS_REQUIRE_INVOICE_FLOW`) o documentar
en runbook para que admin desactive `commissionEnabled` cuando opera
en POS puro. No bloquea Fase 22.

Archivo afectado: `src/app/api/sales/route.ts` modo COMPLETED.

---

### OBS M-2 · `originalRate` cae a `currentRate` cuando no se encuentra venta a crédito · **Severidad MEDIA**

`src/app/api/customers/[id]/payments/route.ts:220`:

```ts
const effectiveOriginalRate = originalRate ?? currentRate;
```

Esto enmascara silenciosamente el caso en que el caller pasa
`currency=USD` pero el cliente nunca tuvo venta USD a crédito.
Resultado: FX = 0 sin warning. Documentado como riesgo #4 en
`phase-21-completion.md` §4 pero no mitigado en el código.

**Recomendación:** si `bodyCurrency` es explícito y NO se encuentra
`originalRate` en venta del cliente, devolver 400
`NO_MATCHING_CREDIT_SALE` o al menos warning en log. Hoy se procesa
silenciosamente.

Archivo afectado: `src/app/api/customers/[id]/payments/route.ts:118-169`.

---

### OBS M-3 · `DELETE` de ExchangeRate solo valida dentro del día del rate · **Severidad MEDIA**

`src/app/api/accounting/exchange-rates/[id]/route.ts:108-160`: la
heurística para detectar consumo cuenta documentos con `currency` igual
y `createdAt` dentro del día (UTC) del rate. Como `getExchangeRate`
busca el rate `date <= input.date` más reciente, un documento posterior
al día podría haber consumido un rate viejo (caso "no hay rate del
viernes, uso el del jueves"). El DELETE no lo detectaría.

**Impacto:** borrar un rate consumido por documentos en días
posteriores que cayeron al fallback hacia atrás. Riesgo conocido
documentado en `phase-21-completion.md` §2.3.

**Recomendación:** además del check por día, validar que NO existe un
rate posterior para el par (companyId, currency) cuyo gap deje al
rate borrable como "el más cercano hacia atrás" para documentos del
rango intermedio. Es trabajo de Fase 25 (audit) según el completion.

Archivo afectado: `src/app/api/accounting/exchange-rates/[id]/route.ts:108-160`.

---

### OBS M-4 · `Payment.currency` hereda forzosamente de la Sale en POS · **Severidad MEDIA**

`src/app/api/sales/route.ts:587-602`: los Payments creados durante una
venta usan `normalizedCurrency` y `saleRate` de la venta directamente
sin permitir un override de currency por método de pago. Esto es
correcto para POS (el cliente paga en la misma currency cotizada) pero
imposibilita un caso operativo: "vendo en USD pero el cliente paga en
GTQ al rate del día". El completion lo asume; no es bug, pero conviene
documentarlo en el runbook de UI Fase 22.

Archivo afectado: `src/app/api/sales/route.ts:587-602`.

---

### OBS B-1 · `StockReservation` sin expiración automática · **Severidad BAJA**

Riesgo #6 del completion 20. Pedidos viejos mantienen stock reservado
indefinidamente. Necesita un cron (no incluido) o sweep manual desde UI
Fase 22. No es regresión.

---

### OBS B-2 · `Sale.couponCode` redundante con `CouponRedemption.couponId` · **Severidad BAJA**

`Sale.couponCode` (snapshot string) y `CouponRedemption.couponId`
(relación) coexisten. Es un snapshot defensivo pero invita a drift si
se renombran códigos. Aceptable. Solo cabe documentar.

---

### OBS B-3 · `DeliveryNoteSequence.prefix` uniforme post-migración · **Severidad BAJA**

Riesgo #5 del completion 20. Empresas con prefijo histórico distinto
("NE-") pasan a "ND-" tras la migración. El backfill (líneas 297-316)
solo preserva el correlativo numérico, no el prefix antiguo. Si para
alguna empresa esto es problema operativo, admin debe corregir manual.

---

### OBS B-4 · `tax: 0` ya no aplica (heredado Fase 16), pero el discovery 20 lo mantenía como N-2 · **Severidad BAJA**

Verificado: `src/app/api/sales/route.ts:362-370` calcula IVA por línea
con `calculateLineTax` régimen-aware. La nota N-2 del discovery 20 está
resuelta. Sin acción requerida.

---

### OBS B-5 · `withTenantContext` sigue dormido · **Severidad BAJA (no de fase 20-21)**

Heredado de CRIT-4 del master-discovery: 0 handlers de Fase 20-21 usan
`withTenantContext`. La policy `tenant_isolation_*` se crea para los
10+1 modelos nuevos pero el role activo en runtime sigue siendo
`postgres` (BYPASSRLS). No es regresión introducida por estas fases —
está marcado para Fase 24a.

---

## Verificación granular de reglas legales

| Regla legal | Estado | Evidencia |
|---|---|---|
| 20.1 · Anulación reversa JournalEntry original | OK | `src/app/api/sales/[id]/route.ts:203-220` usa `reverseJournalEntry` por la venta + `:223-240` reversa COGS también. No crea EXPENSE paralelo. |
| 20.2 · Snapshot FEL (NIT, régimen, taxRate línea) | OK | `Sale.customerNit`, `Sale.customerName`, `Sale.taxRegime` (schema:560-563), `SaleItem.taxRate Decimal(5,4)` (schema:656). POST sales line 505-507 + lineCalcs taxRate persisted. |
| 20.3 · TaxSeries lock atómico (heredado Fase 16) | OK (heredado, no re-validado) | Fuera de alcance directo de Fase 20. Mismo patrón replicado para DeliveryNoteSequence. |
| 20.4 · DeliveryNote.noteNumber lock atómico | OK | `src/lib/sales/sequences.ts:72-96` y prueba en `note-number-lock.test.ts`. |
| 20.5 · Refund CARD/TRANSFER → BankTransaction | PARCIAL | Cumplido en `pos/returns/route.ts`. NO cumplido en `sales/[id]/return/route.ts`. Ver OBS A-1. |
| 21.1 · Moneda funcional GTQ por default | OK | `src/lib/currency/types.ts` define `FUNCTIONAL_CURRENCY='GTQ'`. Default en schema 7 tablas. |
| 21.2 · Snapshot exchangeRate por documento | OK | Migración line 62-102 + persistencia en POST sales/purchases/payments. |
| 21.3 · FX_GAIN (4.2.01) / FX_LOSS (5.4.01) al cobrar/pagar | OK | `src/lib/accounting/accounts.ts:41,50` definen los códigos; `seed.ts:65,79` los siembran. Uso en customers/payments y payables/payments. |
| 21.4 · Transfer cross-currency rechazado 400 CURRENCY_MISMATCH | OK | `banks/transfer/route.ts:37-51`. |

---

## Verificación granular de tests Vitest declarados

No re-ejecutados en este pase (read-only). El completion 20 declara 41
tests nuevos en `src/lib/sales/__tests__/` y el completion 21 declara
19 tests en `src/lib/currency/__tests__/`. Archivos físicos confirmados:

- `pricing.test.ts`, `promotions.test.ts`, `coupons.test.ts`,
  `commissions.test.ts`, `state-machine.test.ts`,
  `note-number-lock.test.ts` (Fase 20).
- `exchange-rate.test.ts`, `fx-difference.test.ts` (Fase 21).

El test `note-number-lock.test.ts:58-83` se revisó manualmente y la
lógica del retry está bien modelada.

---

## Conclusión

**Listo para Fase 22 (UI) con caveats.** La implementación de Fase 20 y
21 es robusta, las migraciones son idempotentes y el código es
defensivo en los puntos sensibles (locks, snapshots, transacciones). El
veredicto APROBADO CON OBSERVACIONES se sostiene en que:

1. Las dos observaciones ALTA (A-1: devolución general sin BankTx ni
   JournalEntry; A-2: devolución no compensa FX en moneda extranjera)
   pueden cerrarse en una mini-fase pre-22 de 1-2 días. Ambas siguen
   el mismo patrón que ya está implementado en sus contrapartes y no
   requieren cambios de schema.

2. Las observaciones MEDIA son riesgos operativos documentados; la
   UI de Fase 22 puede evitar disparar los caminos problemáticos
   (M-2 controlando el dropdown de currency, M-3 confirmando el
   delete, M-1 mostrando commission-enabled como toggle solo en
   flujo enterprise).

3. Las observaciones BAJA son técnicas o de runbook; no bloquean
   nada.

**Recomendación al dueño:**
- Avanzar a Fase 22 inmediatamente para la UI de cotización/pedido/
  despacho/factura + administración de tipos de cambio.
- En paralelo (o en sprint 0 de Fase 22) cerrar OBS A-1 y A-2 antes
  de habilitar multi-moneda y devoluciones complejas en producción
  para clientes piloto.
- Documentar M-1, M-2, M-4 en `docs/operations/multicurrency.md` y
  `docs/operations/sales-workflow.md` para que los onboarders sepan
  qué flujos están y no están soportados.

No es necesario rechazar la fase ni desplegar correcciones obligatorias
antes de levantar UI. El backend es coherente y la contabilidad cuadra
en todos los caminos felices verificados.
