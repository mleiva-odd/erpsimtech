# Fase 20 · Discovery — Ventas enterprise (cotización → pedido → despacho → factura)

Fecha: 2026-05-11
Subagente: **sales/POS**
Modo: READ-ONLY (auditoría previa al plan de implementación).
Plan referenciado: `docs/audits/phase-13-erp-real-plan.md` § Fase 20.

## TL;DR

El módulo de ventas hoy es un **POS plano** con un único estado terminal
(`COMPLETED`) y un atajo `QUOTE` mínimo. No existe el ciclo
`QUOTE → ORDER → PARTIALLY_DELIVERED → DELIVERED → INVOICED → COMPLETED`;
no hay reserva de stock, ni descuento por línea efectivo, ni listas de
precios, ni promociones/cupones, ni comisiones, ni fulfillment
cross-branch. La anulación **no reversa** el ingreso original sino que
crea un asiento `EXPENSE` paralelo (gap recurrente del plan). La
generación de `DeliveryNote.noteNumber` está sujeta a colisión bajo
concurrencia. Fase 20 implica diseño nuevo + 6 modelos nuevos +
refactor profundo del POST `/api/sales`.

## 1. Estados de Sale actuales

Enum (`prisma/schema.prisma:596-601`):

```prisma
enum SaleStatus {
  COMPLETED
  PENDING
  CANCELLED
  QUOTE
}
```

Lo que falta para Fase 20: `ORDER`, `PARTIALLY_DELIVERED`, `DELIVERED`,
`INVOICED`. `PENDING` existe pero **no se usa en ningún code path** del
backend (`src/app/api/sales/route.ts`, `[id]/route.ts`,
`[id]/return/route.ts`, `pos/returns/route.ts`); el flujo real es:

- `POST /api/sales` con `status: 'COMPLETED'` → descuenta stock,
  registra Payment, crea BankTransaction, crea AccountingEntry
  (`INCOME`).
- `POST /api/sales` con `status: 'QUOTE'` → solo crea Sale + SaleItem
  sin payments, sin stock, sin asiento.
- `DELETE /api/sales/[id]` → solo permite borrar si status === `QUOTE`.
- `PATCH /api/sales/[id]` action `CANCEL` → permitido solo si status
  era `COMPLETED`.

**Cuándo descuenta stock:** al crear con `status === 'COMPLETED'`
(`src/app/api/sales/route.ts:338-395`). No hay separación entre
"factura emitida" y "mercadería entregada"; la venta POS hace todo en
un solo paso (lo cual es correcto para tienda, pero **rompe** el caso
enterprise de "factura hoy, despacho en 3 días" y el caso "reservo
stock con un pedido sin facturar todavía").

## 2. `SaleItem.discount` · presente en schema, sin uso

Columna definida (`prisma/schema.prisma:431`):

```prisma
discount  Decimal  @default(0) @db.Decimal(10, 2)
```

Búsqueda en todo `src/`: 0 escrituras y 0 lecturas. El POST
`/api/sales` solo escribe `Sale.discount` como **porcentaje global**
(`route.ts:28, 192, 250`) y calcula `discountAmount = subtotal *
discount/100`. El `cartStore` aplica un único porcentaje global a todo
el carrito (`src/stores/cartStore.ts:31, 65, 132`).

Implicaciones:

- No se puede dar 10% en una línea y 0% en otra (caso enterprise
  típico: descuento solo a categoría "Bebidas").
- El reporte por vendedor/producto no puede atribuir el descuento real
  por línea.
- La columna existe pero es **vestigial** desde un schema anterior; o
  bien se integra en Fase 20 o se elimina.

## 3. `DeliveryNote.noteNumber` · race condition

`src/app/api/delivery-notes/route.ts:88-99`:

```ts
const lastNote = await prisma.deliveryNote.findFirst({
  where: { companyId: tenant.companyId },
  orderBy: { createdAt: 'desc' },
  select: { noteNumber: true },
});
let nextNumber = 1;
if (lastNote?.noteNumber) {
  const match = lastNote.noteNumber.match(/\d+$/);
  if (match) nextNumber = parseInt(match[0]) + 1;
}
const noteNumber = `NE-${String(nextNumber).padStart(6, '0')}`;
```

Problemas:

- Read + compute + insert **sin transacción** y **sin `FOR UPDATE`**.
  Dos requests concurrentes calculan el mismo `nextNumber` y el segundo
  insert revienta contra `@@unique([companyId, noteNumber])`.
- El error que devuelve al usuario es "Error al crear nota de envío"
  (genérico), no hay retry.
- `orderBy: createdAt desc` no garantiza el correlativo máximo si dos
  notas se crean con el mismo `createdAt` o si alguna se anuló con un
  timestamp anterior.

Fix esperado en Fase 20: usar `INSERT ... RETURNING` con un
contador atómico por (companyId, year) tipo
`DocumentSequence(companyId, type, year, lastNumber)` con
`SELECT ... FOR UPDATE` o `nextval` de una secuencia Postgres por
tenant. El mismo patrón debe servir para `Sale.invoiceNumber` y la
serie FEL de Fase 16.

## 4. Anulación de venta · NO reversa el ingreso original

`src/app/api/sales/[id]/route.ts:182-194` (PATCH action CANCEL):

```ts
await createAccountingEntry(tx, {
  companyId: tenant.companyId,
  branchId: sale.branchId,
  type: 'EXPENSE',
  categoryName,
  description: `Anulación de Venta #${sale.id.split('-')[0]...}`,
  amount: Number(sale.total),
  referenceType: 'SALE_CANCEL',
  referenceId: sale.id,
  userId: tenant.userId,
});
```

Crea un `AccountingEntry` tipo `EXPENSE` con categoría "Devoluciones
POS"/"Devoluciones Remotas". El ingreso original (`type: INCOME`,
categoría "Ventas POS") sigue en la tabla. Resultado: el P&L muestra
ingresos inflados + gasto inflado del mismo monto.

El mismo patrón está en devoluciones POS (`pos/returns/route.ts:284-295`):
crea `AccountingEntry EXPENSE` "Devoluciones POS" en vez de revertir
el ingreso proporcionalmente.

Una vez ejecutada Fase 14 (JournalEntry/JournalLine doble partida), la
reversa correcta es:

```
Asiento original (venta):
  DR Caja / Bancos / CxC          1,000
    CR Ventas POS                    1,000

Asiento anulación (Fase 20):
  DR Ventas POS                   1,000
    CR Caja / Bancos / CxC           1,000
```

…misma cuenta, contrario, **no** "Devoluciones". "Devoluciones" se usa
solo para devoluciones reales con producto regresado (cuenta
contra-ingreso). El plan Fase 20 lo identifica como entregable
explícito (línea 239 del plan: "Anulación de venta reversa el ingreso
original… no crea un EXPENSE paralelo").

Issue extra: en `PATCH CANCEL`, cuando hay pago `CASH` con
`sale.cashRegisterId`, se crea una `CashRegisterTransaction` tipo
`EXPENSE`. Si la caja original ya está cerrada, esto genera un asiento
contra una caja cerrada — Fase 20 debe validar que la caja origen
sigue abierta o exigir que se haga un asiento manual.

## 5. Cotización · existe pero limitada

Modo actual:

- `POST /api/sales` con `status: 'QUOTE'` crea la venta sin payments y
  sin tocar stock. **No** hay `expiresAt`, ni reserva, ni numerador de
  cotización separado.
- `DELETE /api/sales/[id]` solo permite eliminar status === QUOTE.
- `QuotesModal.loadQuoteIntoCart` (`src/components/pos/QuotesModal.tsx:52-71`)
  **hardcodea `stock: 999`** al agregar items al carrito al reanudar:

```ts
addItem({
  id: item.product.id,
  variantId: item.variant?.id,
  name: ...,
  sku: item.variant?.sku || item.product.sku,
  price: Number(item.unitPrice),
  stock: 999  // ← ignora el stock real
});
```

Si el producto está sin stock cuando se reanuda la cotización el
cajero solo se da cuenta al darle "Cobrar" y el backend rechaza con
"Stock insuficiente". Fase 20 debe:

- Leer stock real al cargar la cotización (endpoint que devuelva la
  cotización con stock por sucursal).
- Mostrar warning si stock < qty cotizada.
- Permitir convertir QUOTE → ORDER (que aparta stock) o saltar a
  COMPLETED si hay stock.

Adicional: no hay campo `expiresAt` en Sale; tampoco se valida nada
sobre vigencia. Una cotización de hace 6 meses con precios viejos
puede convertirse a venta hoy sin alerta.

## 6. PriceList / CustomerPriceList / Promotion / Coupon · NO EXISTEN

Búsqueda en `prisma/schema.prisma`: 0 modelos `PriceList`,
`Promotion`, `Coupon`. Búsqueda en `src/`: el único `discounts.ts`
encontrado (`src/lib/discounts.ts`) es un catálogo de **descuentos del
SaaS SIMTECH** (planes anuales, referidos, cierre rápido) — no tiene
nada que ver con descuentos de productos en el POS del cliente.

Implicaciones Fase 20:

- `Product.price` es un único precio por producto (sin lista B2C vs
  B2B, sin precio mayoreo, sin precio por sucursal).
- No hay forma de configurar "este cliente paga 10% menos siempre".
- No hay 2x1, ni "compra 3 lleva 4", ni "$5 de descuento si compras
  más de Q500".
- Sin cupones; no hay forma de hacer campaña con código manual.

Diseño esperado:

```
PriceList(id, companyId, name, validFrom, validTo, priority, branchId?, segment?)
PriceListItem(priceListId, productId, variantId?, price, currency)
CustomerPriceList(customerId, priceListId)  // muchos a muchos
Promotion(id, companyId, type [BOGO|PCT|FIXED|TIERED], rules JSON, validFrom, validTo, branchId?, productIds[])
Coupon(id, code, promotionId, maxRedemptions, used, validUntil)
SaleCoupon(saleId, couponId, discountApplied)
```

## 7. StockReservation · NO EXISTE

Búsqueda: 0 modelos `StockReservation`. El stock se decrementa solo
en venta COMPLETED. No hay forma de "apartar" 5 unidades a un cliente
sin haber cobrado todavía.

Diseño esperado:

```
StockReservation(id, saleId/orderId, productId, variantId?, branchId,
                 quantity, expiresAt, status [ACTIVE|RELEASED|CONSUMED])
ProductStock.reserved (Int)  // o calcular vivo
disponible = ProductStock.quantity - sum(StockReservation.activa)
```

Cualquier consulta de stock (POS, ventas, kardex) debe restar las
reservas activas para mostrar disponibilidad real.

## 8. Comisiones · NO EXISTE

Búsqueda: 0 modelos `CommissionRule` / `Commission`. Existe el
endpoint `/api/reports/sales/by-user` (Fase 11) que muestra ventas
por vendedor con margen y ticket promedio, pero **no calcula
comisión**: es solo un reporte sumatorio.

Diseño esperado:

```
CommissionRule(id, companyId, userId?, productId?, categoryId?,
               type [PCT_OF_SALE|PCT_OF_MARGIN|FIXED_PER_UNIT],
               value, minTicket?, validFrom, validTo, active)
Commission(id, ruleId, userId, saleId, amount, status [PENDING|APPROVED|PAID],
           periodMonth, periodYear, calculatedAt, paidAt?)
```

Job de cierre mensual recorre Sales del período y aplica reglas
ordenadas por especificidad (producto > categoría > vendedor > global).
Pagable vía planilla (link a `Payroll` de Fase 18).

## 9. Bugs POS

### 9.1 Descuento sin permiso

`pos:discount` está definido en el catálogo
(`src/lib/permission-catalog.ts:13`, `src/lib/permissions.ts:19`) y se
asigna por defecto al rol de cajero en
`src/app/api/onboarding/route.ts:128` y
`src/app/api/admin/companies/route.ts:148`.

Pero en el front (`src/components/pos/Cart.tsx:84-97`) el input de
descuento NO está condicionado a ese permiso:

```tsx
<input
  type="number"
  min={0}
  max={100}
  value={discount}
  onChange={(e) => setDiscount(Number(e.target.value))}
  ...
/>
```

Y en backend, `POST /api/sales` valida `discount: z.number().min(0).max(100)`
pero **no** verifica que el caller tenga `pos:discount` ni que el
descuento esté dentro del límite del rol. Un cajero limitado puede dar
99% off y la API lo acepta.

Fix Fase 20: enforcement servidor-side de `pos:discount` + tope por
rol (e.g. cajero limitado a 5%, supervisor a 20%, gerente sin tope).

### 9.2 No hay "suspender venta" separado de cotización

`src/app/(dashboard)/pos/page.tsx` solo expone `handleCreateQuote`
(crea Sale `QUOTE` permanente). No hay forma de "guardo el carrito
mientras atiendo al siguiente cliente y vuelvo en 30s" — el cajero
tiene que cancelar o crear una cotización completa con cliente
obligatorio. El plan Fase 22 ya lo marca como entregable de UI.

### 9.3 Atajos no documentados

`src/app/(dashboard)/pos/page.tsx:85-107` define atajos F2, F8, F12
pero no hay UI que los muestre. Mejora menor.

### 9.4 Reanudar cotización ignora stock (ver §5)

## 10. Validación del plan Fase 20

| Entregable | Estado | Notas |
|---|---|---|
| Estados separados (QUOTE/ORDER/.../COMPLETED) | ❌ falta | Solo `COMPLETED/QUOTE/CANCELLED/PENDING` |
| `QUOTE` con `expiresAt` | ❌ falta | Columna no existe |
| `ORDER` aparta stock | ❌ falta | Estado y `StockReservation` no existen |
| `DELIVERY` + DeliveryNote parcial | ⚠ parcial | DeliveryNote existe pero no se enlaza al ciclo Sale |
| `INVOICED` dispara FEL | ❌ falta | Depende de Fase 16 (no hecha) |
| `SaleItem.discount` integrado | ❌ falta | Columna existe, no se usa |
| `PriceList` / `CustomerPriceList` | ❌ falta | No existen |
| Promociones (2x1, %, fijo) | ❌ falta | No existen |
| Cupones | ❌ falta | No existen |
| Comisiones de vendedor | ❌ falta | Reporte sí, modelo no |
| StockReservation al confirmar ORDER | ❌ falta | No existe |
| Cross-branch fulfillment con StockTransfer auto | ❌ falta | `StockTransfer` manual existe; no se invoca desde Sale |
| Reanudar cotización con stock real | ❌ falta | Hardcode `stock: 999` |
| `DeliveryNote.noteNumber` con lock | ❌ falta | Race condition activa |
| Anulación reversa ingreso original | ❌ falta | Crea EXPENSE paralelo |

**Subtotal: 14/15 entregables bloqueados o ausentes.**

Dependencia dura:

- Fase 14 (Plan de cuentas + partida doble) — necesaria para la
  reversa correcta. Hoy `createAccountingEntry` recibe un único
  `type: INCOME | EXPENSE` por categoría, sin cuentas debit/credit.
- Fase 15 (Costeo promedio) — necesaria para que `SaleItem.unitCost`
  reflejado en el snapshot sea el promedio real, no el último
  registrado.
- Fase 16 (FEL infra completa) — necesaria para que `INVOICED`
  dispare DTE certificado (vía MockProvider mientras no haya
  certificador).

Fase 20 **no puede comenzar** sin Fase 14 y Fase 16. Fase 15 es
deseable pero no bloqueante (puede mockear con el cost actual).

## 11. Issues nuevos detectados (no listados en plan)

### N-1 · `SaleItem.quantity` es `Int`

`prisma/schema.prisma:428` define `quantity Int`. Productos de granel
(carnicería, ferretería con kilos/metros) necesitan decimales. Mismo
gap reportado para `PurchaseOrderItem.quantity` en Fase 24 del plan.
Sugerencia: migrar a `Decimal(10,3)` aquí también, alineado con la
política de cantidades fraccionarias de Fase 24.

### N-2 · `Sale.tax` siempre = 0

`route.ts:251`: `tax: 0` hardcoded. No hay cálculo de IVA por línea ni
por venta. Plan Fase 24 lo identifica como "IVA en Sale no hardcoded"
pero hoy ni siquiera se intenta. Fase 20 + Fase 16 deben recalcular
IVA con base en régimen tributario del cliente y tasa por producto.

### N-3 · `Sale.invoiceNumber` es opcional y sin lock

`prisma/schema.prisma:370`: `invoiceNumber String?`. Hoy nunca se
asigna (no se llena en POST). Si Fase 16 lo activa, repetir el patrón
de `DocumentSequence` (ver §3) para evitar la race condition que ya
tiene `DeliveryNote.noteNumber`.

### N-4 · `DeliveryNote.quantity` también `Int`

`schema.prisma:722`. Mismo problema que N-1 + posibilidad de despachar
parcialmente kilos.

### N-5 · `DeliveryNote.saleId` opcional

`schema.prisma:691`: `saleId String?`. Permite despachos huérfanos
(sin venta asociada). En el modelo Fase 20 enterprise toda
`DeliveryNote` proviene de una `Sale` en estado ORDER/DELIVERED. O se
hace obligatorio o se documenta el caso "salida de mercadería sin
venta" (e.g. consignación) como flujo aparte con su propio asiento.

### N-6 · `SaleReturn` no enlaza con `DeliveryNote`

Hoy una devolución reincorpora stock directamente. Si la venta original
fue despachada parcialmente con varias `DeliveryNote`, no hay forma de
saber qué nota se devuelve ni de generar una contra-nota. Fase 20
debería agregar `SaleReturn.deliveryNoteId?` o
`SaleReturnItem.deliveryNoteItemId?`.

### N-7 · `CashRegisterTransaction` por anulación contra caja cerrada

Ver §4. La anulación crea una `CashRegisterTransaction` tipo `EXPENSE`
sin validar si `cashRegister.status === 'OPEN'`. Si la caja del día
de la venta ya cerró, se descuadra el cierre histórico. Fix: la
anulación de una venta de un turno cerrado debe ir contra caja chica
del día o requerir asiento manual + bloqueo del flujo automático.

### N-8 · Returns proporciona reembolso con `refundRatio` pero ignora descuento por línea

`src/app/api/pos/returns/route.ts:121-128`:

```ts
const refundRatio = saleSubtotal > 0 ? saleTotal / saleSubtotal : 1;
const refundAmount = roundMoney(grossSelectedSubtotal * refundRatio);
```

El ratio se calcula sobre el total con descuento global. Funciona
mientras el descuento sea global, pero cuando Fase 20 active
`SaleItem.discount`, el reembolso por línea debe usar el precio neto
de **esa** línea, no un ratio global. Refactor obligatorio al
implementar §2.

### N-9 · `Sale.channel` es enum cerrado

`POS | REMOTE | WEB`. Cuando Fase 20 active la venta enterprise con
cotización separada, conviene agregar `B2B` o `WHOLESALE` para
diferenciar el reporting (o renombrar `REMOTE` a algo más claro).

### N-10 · `legacyReturns` check bloquea operaciones

`src/app/api/pos/returns/route.ts:78-83`: si la venta tiene una
`SaleReturn` con `items.length === 0` y `amount > 0` (formato antiguo
pre-Fase ?), bloquea todas las nuevas devoluciones. Fase 20 debería
migrar estas devoluciones legacy a la nueva forma con items o
marcarlas explícitamente como `legacy: true`.

## 12. Plan de ejecución sugerido (alto nivel)

Ordenado para minimizar rework:

1. **Schema migrations** (todas en una sola migración Prisma):
   - Extender `SaleStatus` con `ORDER`, `PARTIALLY_DELIVERED`,
     `DELIVERED`, `INVOICED` (mantener `COMPLETED` como alias de
     `INVOICED + DELIVERED` para compat).
   - `Sale.expiresAt DateTime?` (para QUOTE).
   - `Sale.quoteNumber String?` y `Sale.orderNumber String?` con
     unique por `(companyId, *)` y `DocumentSequence`.
   - `Sale.tax Decimal` ahora calculado (no hardcoded).
   - `SaleItem.quantity Decimal(10,3)` (ver N-1).
   - Modelos nuevos: `StockReservation`, `PriceList`, `PriceListItem`,
     `CustomerPriceList`, `Promotion`, `PromotionRule`, `Coupon`,
     `SaleCoupon`, `CommissionRule`, `Commission`,
     `DocumentSequence`.
   - `DeliveryNote.saleId` obligatorio para nuevos despachos
     (documentar excepción).
   - `DeliveryNote.quantity Decimal(10,3)`.

2. **Sequence service** (`src/lib/sequences.ts`):
   - `getNextNumber(tx, companyId, kind: 'QUOTE'|'ORDER'|'INVOICE'|'DELIVERY_NOTE')`
     con `SELECT ... FOR UPDATE` o `INSERT ... ON CONFLICT UPDATE` y
     `RETURNING`.
   - Refactorizar `POST /api/delivery-notes` para usarlo.

3. **State machine de Sale** (`src/lib/sale-state.ts`):
   - Transiciones permitidas con tabla, igual al patrón de
     `DeliveryNote.status` en `[id]/route.ts:43-46`.
   - Hook por transición (reservar, despachar, facturar, anular).

4. **Reserve / consume stock**:
   - Refactor `productStock` queries para restar
     `StockReservation.activa` del disponible.
   - Endpoint `/api/products/[id]/availability?branchId=...&excludeReservation=...`.

5. **PriceList resolver** (`src/lib/pricing.ts`):
   - `resolvePrice(productId, variantId?, customerId?, branchId, date)`
     con prioridad: CustomerPriceList > PriceList por segmento >
     PriceList por sucursal > Product.price.

6. **Promotion engine** (`src/lib/promotions.ts`):
   - `applyPromotions(cart, customerId?, coupons[])` retorna lineItems
     con descuento aplicado + breakdown.

7. **Reversa correcta de anulación**:
   - Refactor `PATCH /api/sales/[id]` para emitir asiento contrario
     contra la misma cuenta del ingreso original (depende de Fase 14
     con JournalEntry/JournalLine).

8. **Cross-branch fulfillment**:
   - Al crear ORDER, si la sucursal origen no tiene stock pero otra
     sí, ofrecer crear `StockTransfer` automático
     (`fromBranch → toBranch`) y enlazar a la venta.

9. **Comisiones**:
   - Job mensual `/api/jobs/commissions/calculate` que recorre Sales
     `INVOICED` del período y aplica reglas.
   - Reporte `/api/reports/sales/commissions?period=YYYY-MM`.

10. **POS**:
    - Enforcement servidor de `pos:discount` con tope por rol.
    - "Suspender venta" en memoria (no en BD) separado de "Cotización
      formal".
    - QuotesModal: leer stock real al cargar (eliminar `stock: 999`).

## 13. Archivos clave para Fase 20

```
prisma/schema.prisma                                      (modelos nuevos + enum)
src/app/api/sales/route.ts                                (refactor POST completo)
src/app/api/sales/[id]/route.ts                           (state machine + reversa)
src/app/api/sales/[id]/return/route.ts                    (link a DeliveryNote)
src/app/api/sales/[id]/deliver/route.ts                   (nuevo: parcial)
src/app/api/sales/[id]/invoice/route.ts                   (nuevo: dispara FEL)
src/app/api/sales/[id]/cancel/route.ts                    (mover lógica CANCEL)
src/app/api/quotes/route.ts                               (nuevo: separar de sales)
src/app/api/delivery-notes/route.ts                       (lock noteNumber)
src/app/api/pos/returns/route.ts                          (refundRatio por línea)
src/app/api/price-lists/...                               (nuevo)
src/app/api/promotions/...                                (nuevo)
src/app/api/coupons/...                                   (nuevo)
src/app/api/commissions/...                               (nuevo)
src/app/api/reports/sales/commissions/route.ts            (nuevo)
src/lib/sequences.ts                                      (nuevo)
src/lib/sale-state.ts                                     (nuevo)
src/lib/pricing.ts                                        (nuevo)
src/lib/promotions.ts                                     (nuevo)
src/lib/commissions.ts                                    (nuevo)
src/lib/stock-reservations.ts                             (nuevo)
src/stores/cartStore.ts                                   (discount por línea)
src/components/pos/Cart.tsx                               (UI descuento por línea + gate permiso)
src/components/pos/QuotesModal.tsx                        (eliminar stock 999)
src/components/pos/CheckoutModal.tsx                      (cupón / promo aplicada)
```

## 14. Riesgos

1. **Data migration de ventas existentes**: con la transición a estados
   nuevos, las ventas `COMPLETED` actuales deben mapearse a `INVOICED +
   DELIVERED`. Las `QUOTE` antiguas pierden la expiración (asignar
   default 30 días o `null` con bandera "legacy").

2. **Stock reservation race**: dos pedidos concurrentes intentando
   reservar el último item — debe usar el mismo patrón
   `updateMany + count === 1` que ya tiene venta directa.

3. **Backward compat del POST `/api/sales` actual**: los clientes (UI
   POS, Remote Wizard) hoy mandan `status: 'COMPLETED' | 'QUOTE'`. El
   contrato debe permitir mandar también `'ORDER'` sin romper los dos
   anteriores. Probablemente conviene segmentar: POS sigue siendo
   "todo en un paso" pero el wizard nuevo (`/sales/new` enterprise) usa
   un POST distinto.

4. **Volumen de migraciones acumuladas**: este chunk es grande
   (10+ tablas nuevas, 3 modificaciones a tablas existentes). Conviene
   dividir en 2 migraciones: una solo schema (sin lógica), una con
   data backfill.

5. **Comisiones requieren fase 14**: si una `Sale` se anula después
   de calcular comisión, la comisión debe revertirse. Modelar
   `Commission.status` y el job de cierre con cuidado para evitar
   doble pago en planilla.

## 15. Resumen de hallazgos

| # | Hallazgo | Severidad | Plan Fase 20 lo cubre |
|---|---|---|---|
| 1 | Falta enum ORDER/PARTIALLY_DELIVERED/DELIVERED/INVOICED | Crítico | Sí |
| 2 | `SaleItem.discount` definido pero sin uso | Alto | Sí |
| 3 | `DeliveryNote.noteNumber` race condition | Alto | Sí |
| 4 | Anulación crea EXPENSE paralelo en vez de revertir | Crítico | Sí |
| 5 | Cotización sin `expiresAt` | Medio | Sí |
| 6 | Reanudar cotización hardcodea stock=999 | Medio | Sí |
| 7 | Sin PriceList / CustomerPriceList | Alto | Sí |
| 8 | Sin Promotion / Coupon | Alto | Sí |
| 9 | Sin StockReservation | Crítico | Sí |
| 10 | Sin CommissionRule / Commission | Alto | Sí |
| 11 | POS `pos:discount` sin enforcement servidor | Alto | Parcial (mencionado Fase 22) |
| 12 | No hay "suspender venta" separado de cotización | Bajo | Fase 22 (UI) |
| 13 | Cross-branch fulfillment no automatizado | Medio | Sí |
| N-1 | `SaleItem.quantity Int` (no granel) | Medio | No (sugerido en este discovery) |
| N-2 | `Sale.tax` hardcoded 0 | Alto | Parcial (Fase 24) |
| N-3 | `Sale.invoiceNumber` sin lock | Alto | Implícito (Fase 16) |
| N-4 | `DeliveryNoteItem.quantity Int` | Medio | No (sugerido) |
| N-5 | `DeliveryNote.saleId` opcional | Bajo | No (sugerido) |
| N-6 | `SaleReturn` no enlaza con `DeliveryNote` | Medio | No (sugerido) |
| N-7 | Anulación contra caja cerrada | Medio | No (sugerido) |
| N-8 | `refundRatio` global no soporta descuento por línea | Alto | Implícito (refactor obligado) |
| N-9 | `SaleChannel` sin valor B2B/WHOLESALE | Bajo | No (sugerido) |
| N-10 | `legacyReturns` bloquea operaciones | Bajo | No (sugerido) |

---

Fin del discovery. Listo para que el plan Fase 20 se ejecute con un
sprint de schema + sprint de lógica + sprint de UI POS, en ese orden.
