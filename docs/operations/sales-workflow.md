# Workflow de Ventas — POS rápido vs Ciclo Enterprise (Fase 20)

## Resumen

A partir de Fase 20 el ERP SIMTECH soporta dos flujos de venta paralelos:

- **POS rápido (legacy)** · todo en un paso · estado terminal `COMPLETED`.
- **Ciclo enterprise** · separa cotización → pedido → despacho → factura · estados `QUOTE → ORDER → PARTIALLY_DELIVERED → DELIVERED → INVOICED`.

Ambos viven en la misma tabla `Sale` y comparten la lógica de cálculo de IVA (Fase 16), retenciones (no aplica en ventas), descuentos por línea (Fase 20) y comisiones (opcional Fase 20).

## Diagrama de estados

```
                              ┌──────────────────────────────────────────┐
                              ↓                                          │
                    ┌─────────────────────┐                              │
                    │       QUOTE         │ ──cancel→ CANCELLED          │
                    │  expiresAt = +30d   │                              │
                    └──────────┬──────────┘                              │
                               │ accept                                   │
                               ↓                                          │
                    ┌─────────────────────┐                              │
                    │       ORDER         │ ──cancel-order→ CANCELLED    │
                    │  StockReservation   │   (libera reservas)          │
                    └──────────┬──────────┘                              │
                               │ deliver (parcial)                       │
                               ↓                                          │
                    ┌──────────────────────────┐                         │
                    │ PARTIALLY_DELIVERED      │ ──cancel-order→ ───────→
                    │ DeliveryNote por entrega │   (reincorpora stock)
                    └──────────┬───────────────┘
                               │ deliver (resto)
                               ↓
                    ┌─────────────────────┐
                    │     DELIVERED       │
                    │  Stock descontado   │
                    │  Reservas liberadas │
                    └──────────┬──────────┘
                               │ invoice
                               ↓
                    ┌─────────────────────┐
                    │     INVOICED        │ ──fel/certify→ TaxDocument
                    │ JournalEntry creado │
                    │ Commissions ACCRUED │
                    └─────────────────────┘
```

POS rápido legacy:

```
                    ┌─────────────────────┐
                    │     COMPLETED       │ ──cancel→ CANCELLED
                    │ stock + pago + JE   │   (reversa JE original + reintegra stock)
                    │ todo en un paso     │
                    └─────────────────────┘
```

## Cuándo usar uno vs el otro

| Caso | Flujo recomendado | Endpoint |
|---|---|---|
| Tienda física, cobro en el momento, entrega inmediata | POS rápido | `POST /api/sales` con `status: 'COMPLETED'` |
| Cliente pide cotización para revisar internamente | Enterprise · QUOTE | `POST /api/sales` con `status: 'QUOTE'` |
| Pedido B2B con entrega programada en 3-7 días | Enterprise · ORDER | `POST /api/sales` con `status: 'ORDER'` |
| Pedido grande con entrega en partidas (semanal/quincenal) | Enterprise · ORDER + deliver parcial | `POST /api/sales/:id/deliver` por cada partida |
| Cliente paga después de recibir mercadería (60 días) | Enterprise (ORDER → DELIVERED → INVOICED con pago CREDIT) | `/invoice` deja AR; `/api/customers/:id/payments` cobra |
| Promociones 2x1, cupón %, descuento por categoría | Cualquier flujo · resuelto en `/api/sales` POST | Body con `couponCode`, `discount`, `items[].discountRate` |

## Configuración por empresa

`Company.allowQuotes` / `Company.allowOrders`: si la empresa no usa cotizaciones o pedidos, deshabilitar para evitar errores de UI. Default = `true`.

`Company.quoteValidDays`: número de días default que vive una cotización antes de expirar. Default = 30.

`Company.commissionEnabled`: si `true`, al pasar una venta a INVOICED se calculan comisiones según `CommissionRule` activas. Default = `false`.

## Listas de precios (`PriceList`)

Una empresa puede tener N listas (ej. "Mayoreo", "Cliente VIP", "Promo Q3"). A cada cliente se le pueden asignar M listas vía `CustomerPriceList`. El motor (`resolveUnitPrice`) elige el precio según esta precedencia:

1. Lista de precios pasada explícitamente en `priceListId` del body de `/api/sales`.
2. Listas asignadas al cliente — si varias, gana la más barata para ese producto.
3. `Product.wholesalePrice` (si el flag `useWholesale` está activo).
4. `ProductVariant.price` (si hay variante).
5. `Product.price`.

La lista usada queda snapshot en `Sale.priceListId` para auditoría.

## Promociones (`Promotion`)

Tres tipos:

- **BUY_N_GET_M** — "Compra N, lleva N+M" (ej. 2x1: N=2, M=1).
- **PERCENTAGE_OFF** — descuento % sobre el subtotal restante.
- **FIXED_PRICE** — precio fijo por unidad (solo si rebaja el precio).

Filtros opcionales: `applicableProductIds` (vacío = global), `minPurchase`, ventana temporal `startsAt..endsAt`. El motor (`applyPromotions`) las evalúa al construir cada SaleItem.

## Cupones (`Coupon`)

Códigos canjeables: `FIXED_AMOUNT` o `PERCENTAGE_OFF`. Constraints opcionales: `maxUses`, `perCustomerLimit`, `minPurchase`, ventana de vigencia.

- **Validación pre-venta**: `POST /api/coupons/:code/redeem` con `subtotal` y `customerId` opcional. Devuelve `valid: true/false` y `amount`. No redime.
- **Aplicación en la venta**: pasar `couponCode` en el body de `POST /api/sales`. El handler ejecuta `validateAndApplyCoupon` + `persistCouponRedemption` dentro de la $transaction. Si falla cualquier check, la venta se rollbackea entera.
- **No aplica a QUOTE**: las cotizaciones no consumen cupones. La redención efectiva ocurre cuando la venta es firme (ORDER o COMPLETED).

## Comisiones (`CommissionRule` + `Commission`)

Reglas configurables por categoría o globales. Dos bases:

- `SUBTOTAL` — comisión = `rate * Σ subtotal` de líneas elegibles.
- `MARGIN` — comisión = `rate * Σ (subtotal - unitCost * qty)` de líneas elegibles.

Múltiples reglas se acumulan. Al pasar la venta a INVOICED (`POST /api/sales/:id/invoice`), si `Company.commissionEnabled` está activo:

1. Se leen reglas activas para la empresa.
2. Se calcula la comisión por regla.
3. Se crea un `Commission` con `status='ACCRUED'`, vinculado a `saleId` y al `Employee` asociado al `salesUserId` de la venta.
4. Al procesar la siguiente planilla del empleado, las comisiones ACCRUED se pueden incluir como concepto y pasan a `PAID`.

## Stock reservado (`StockReservation`)

Al pasar una venta a `ORDER` (sea por `POST /api/sales status=ORDER` o por `POST /api/quotes/:id/accept`), se crea una reserva por línea con `releasedAt=null`. Mientras la reserva esté activa:

- El stock disponible reportado = `ProductStock.quantity - Σ(StockReservation.quantity WHERE releasedAt IS NULL)`.
- Otra venta en ORDER que intente reservar más que el disponible recibirá 409.

Las reservas se liberan automáticamente:

- Al despachar (`/deliver`) → FIFO por `reservedAt`, con split si el despacho cubre parcialmente una reserva.
- Al cancelar (`/cancel-order`) → todas en bloque.

## Lock atómico de `DeliveryNote.noteNumber` (H6 fix)

A partir de Fase 20 el correlativo de nota de envío usa el modelo `DeliveryNoteSequence` con lock optimista `updateMany ... where nextNumber=X`. Esto elimina la race condition documentada en `phase-20-discovery.md` §3: dos despachos concurrentes ahora reciben correlativos distintos consecutivos sin colisión.

La migración hace backfill: cada empresa existente arranca con `nextNumber = max(correlativo numérico actual) + 1`. El prefix por default es `'ND-'` — el admin puede cambiarlo por SQL si necesita continuidad con un prefijo legacy distinto.

## Devoluciones con CARD/TRANSFER (H5 fix)

`POST /api/pos/returns` y `POST /api/sales/:id/return` ahora:

- Si `refundMethod=CASH`: ajusta `CashRegisterTransaction` (como antes).
- Si `refundMethod=CARD` o `TRANSFER`: además de crear el `JournalEntry` de devolución, genera `BankTransaction` (type=EXPENSE) sobre la cuenta del Payment original (o cuenta default si no se encuentra) y decrementa `BankAccount.balance`.

## Anulación de venta (Fase 14 + 20 combinadas)

`PATCH /api/sales/:id` action=CANCEL en una venta COMPLETED/INVOICED:

1. Reincorpora stock.
2. Si tenía pagos: reversa CashRegisterTransaction (CASH) / BankTransaction (CARD/TRANSFER) / Customer.balance (CREDIT).
3. Reversa el `JournalEntry` original (mismas cuentas, signos invertidos — NO crea EXPENSE paralelo). Fix Fase 14 CRIT-2.
4. Reversa el `JournalEntry` de COGS si existía (Fase 15).
5. Marca la venta como CANCELLED.

Para ORDER/PARTIALLY_DELIVERED se usa `/cancel-order` que sigue la misma lógica sin la parte de pagos (no había cobro todavía).

## Casos especiales

- **QUOTE expirada**: el handler `/accept` retorna 409 `QUOTE_EXPIRED`. El usuario debe crear una cotización nueva (o el admin extender manualmente `expiresAt` por SQL).
- **Cliente solo con NIT CF (consumidor final)**: igual que en POS — `customerNit='CF'`, `customerName='Consumidor Final'`. Para QUOTE/ORDER también soportado.
- **Empresa Pequeño Contribuyente**: el IVA 5% se imputa íntegro a Ventas (no separa débito fiscal). Mismo patrón que Fase 16 — no se duplica al INVOICED.
- **Venta sin pagos en ORDER**: si se llega a INVOICED sin payments, el handler asume todo CREDIT y genera DR AR del total. Cobro posterior vía `POST /api/customers/:id/payments`.
