# Fase 15 · Discovery — Costeo, Stock y Movimientos (pre-implementación)

Fecha: 2026-05-11
Autor: subagente **inventory**
Estado: discovery, sin cambios en código.
Alcance: auditar el módulo de inventario (productos, compras, ventas, POS,
transferencias, devoluciones, ajustes y reportes) para confirmar/refinar
el plan de Fase 15 (Costeo promedio ponderado + StockMovement + COGS).

---

## 1. Resumen ejecutivo

Después de leer todos los handlers que tocan stock o `Product.cost`, las
suposiciones del plan de Fase 15 se sostienen **en lo esencial pero el plan
subestima la magnitud del refactor**. Principales conclusiones:

1. **El método de costeo actual es "último costo" (LIFO degenerado a 1
   lote).** No hay promedio ponderado en ningún lado. Cada recepción de
   compra sobrescribe `Product.cost` con el `unitCost` de la última PO,
   sin pesar contra stock previo (`src/app/api/purchases/route.ts:174-180`).
   Igual sucede con `ProductVariant.cost`.
2. **`SaleItem.unitCost` sí se persiste por línea**, pero lee
   `Product.cost` (o `ProductVariant.cost`) en el momento de la venta
   (`src/app/api/sales/route.ts:258-265`). Como `Product.cost` ya es
   "último costo", el snapshot capturado tampoco refleja un costo real
   por capas. Para bundles el snapshot es **incorrecto**: usa
   `product.cost` del bundle (que está hardcodeado a 0 al crearlo,
   `src/app/api/products/route.ts:224`) en lugar de la suma de
   componentes.
3. **No existe un log unificado de movimientos.** El kardex reconstruye
   en memoria desde 5 tablas distintas (`PurchaseOrderItem`, `SaleItem`,
   `InventoryAdjustment`, `StockTransferItem`, `SaleReturnItem`) y filtra
   con ventana de 90 días por defecto
   (`src/app/api/reports/inventory/kardex/route.ts:75-77`), por lo que
   el saldo running **no es el saldo real** del producto sino el saldo
   relativo del rango. Eso ya genera incongruencias entre el "stock
   actual real" (que sí lee de `ProductStock`) y el saldo del kardex.
4. **No hay asiento COGS al vender.** El único asiento contable que se
   genera al vender es `INCOME → Ventas POS` por el `total` de la venta
   (`src/app/api/sales/route.ts:401-414`). El costo de mercadería vendida
   nunca toca contabilidad — el P&L lo calcula a posteriori sumando
   `SaleItem.unitCost`, sin partida doble (`src/app/api/reports/accounting/profit-loss/route.ts:116-126`).
5. **Hay puntos donde el stock se mueve sin trazabilidad alguna:** las
   devoluciones POS y SALE return aumentan stock con `updateMany increment`
   pero no escriben en `InventoryAdjustment`, así que ese inventario
   reaparece y *no figura en el kardex como entrada de tipo RETURN si la
   devolución tiene `stockAdded=false`*. Los traslados sólo aparecen
   cuando `status === 'COMPLETED'` (kardex filtra así, línea 153). Hay
   también un agujero: traslados con stock en tránsito (PENDING) están
   restados del origen pero **no aparecen en ningún reporte** — el plan
   debe normalizarlos.

**Recomendación general:** validar el plan, pero ampliar entregables
(detalle en sección 8). Estimación: 5-7 días de un subagente especialista
con tests, no los "1 sprint" que sugiere el plan.

---

## 2. Estado actual por dimensión

### 2.1 Método de costeo

| Pregunta | Realidad |
|---|---|
| ¿Promedio ponderado? | **No.** |
| ¿Último costo? | **Sí.** Sobrescritura ciega en cada compra. |
| ¿FIFO? | No, ni capas ni lotes. |
| ¿Se actualiza al recibir? | Sí, en `purchases POST` (ver `src/app/api/purchases/route.ts:171-181`). |
| ¿Editable manual? | Sí, vía `PUT /api/products/[id]` (`src/app/api/products/[id]/route.ts:104`) — sin auditoría del cambio de costo, sólo del producto. |
| ¿`Cost` cuando `hasVariants`? | **Se fuerza a 0** en parent (`src/app/api/products/route.ts:224`). El costo real vive en `ProductVariant.cost`. |
| ¿`Cost` cuando `isBundle`? | Lo crea en 0 y nunca se recalcula. **Bug latente.** |
| ¿`Cost` en bulk import? | Se setea sólo en la creación del producto, no actualiza si ya existe (`src/app/api/products/bulk/route.ts:135-145, 155`). |

### 2.2 Snapshot del costo al vender

`src/app/api/sales/route.ts:256-275`:

```ts
const product = products.find((p) => p.id === item.productId);
let unitCost = Number(product?.cost || 0);

if (item.variantId) {
  const variant = product?.variants.find((v) => v.id === item.variantId);
  if (variant) {
    unitCost = Number(variant.cost || 0);
  }
}

return {
  productId: item.productId,
  variantId: item.variantId || null,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  unitCost, // Persistencia de costo histórico
  subtotal: item.unitPrice * item.quantity,
};
```

- ✅ `SaleItem.unitCost` se **persiste** por línea (snapshot real).
- ❌ Pero el valor leído es `Product.cost` (= último costo de compra).
- ❌ Para bundles toma `product.cost` del bundle (=0). El costo correcto
  sería Σ componentes; no se calcula. **Toda venta de combo tiene
  `unitCost=0` y margen 100% ficticio.**
- ❌ Para `hasVariants` lee `variant.cost`. Si la variante no tiene
  costo seteado, queda en 0.

### 2.3 Kardex actual

`src/app/api/reports/inventory/kardex/route.ts`:

- Reconstruye desde 5 tablas en memoria (líneas 91-186).
- Filtra `status === 'COMPLETED'` para compras, ventas y transferencias
  (líneas 98, 124, 153) → no captura ventas anuladas que sí movieron
  stock (anulación reincorpora pero queda fuera del kardex porque la
  Sale ya está `CANCELLED`).
- Default range = 90 días hacia atrás (líneas 75-77). El saldo running
  empieza desde 0 en `startDate`, por lo que no coincide con stock real
  salvo que el rango cubra todo el historial.
- Devuelve también `stockActualReal` desde `ProductStock.findMany` para
  que el frontend pueda mostrar la discrepancia, pero esa discrepancia
  es estructural mientras el kardex no abarque "desde el primer
  movimiento".
- Devoluciones con `stockAdded=false` no figuran porque hay un filtro
  explícito `saleReturn.stockAdded: true` (línea 178). Eso es correcto
  para reflejar el flujo físico, pero las devoluciones contables sin
  reingreso no se ven en ningún reporte.

### 2.4 Bundles

- Modelo `ProductBundleItem` existe (`prisma/schema.prisma:260-271`) y se
  popla al crear el producto bundle.
- En venta (POS), el handler descuenta correctamente el stock de los
  componentes (`src/app/api/sales/route.ts:343-360`) y lo verifica
  antes (líneas 158-168). ✅
- Pero el snapshot de costo en `SaleItem.unitCost` toma `product.cost`
  del bundle (= 0). No se calcula la suma de costos de componentes.
- Devoluciones de bundle re-incorporan stock por componente
  (`src/app/api/pos/returns/route.ts:251-258`). ✅ Eso parece correcto
  estructuralmente, pero por la misma razón que arriba el monto
  devuelto contablemente no es proporcional al costo real.

### 2.5 Trazabilidad de movimientos

No existe `StockMovement` ni un log unificado. Stock se modifica
directamente en `ProductStock.quantity` desde estos lugares:

| # | Archivo | Operación | Crea registro auxiliar |
|---|---|---|---|
| 1 | `src/app/api/inventory/adjustments/route.ts:191` | Ajuste manual (set absoluto) | Sí: `InventoryAdjustment` |
| 2 | `src/app/api/purchases/route.ts:150-165` | Recepción de PO | No (solo PO + items) |
| 3 | `src/app/api/purchases/[id]/route.ts:116-124` | Reversa por anulación de PO | No (rollback silencioso) |
| 4 | `src/app/api/sales/route.ts:346-392` | Venta (decremento) | No (solo Sale + SaleItem) |
| 5 | `src/app/api/sales/[id]/route.ts:122-131` | Anulación de venta (reincremento) | No |
| 6 | `src/app/api/sales/[id]/return/route.ts:108-115` | Devolución de venta (reincremento) | Sólo `SaleReturn` |
| 7 | `src/app/api/pos/returns/route.ts:181-230` | Devolución POS (con upsert) | Sólo `SaleReturn` |
| 8 | `src/app/api/stock-transfers/route.ts:146-156` | Transferencia OUT (PENDING) | Sólo `StockTransfer` |
| 9 | `src/app/api/stock-transfers/[id]/route.ts:85-92` | Transferencia IN (al recibir) | No |
| 10 | `src/app/api/stock-transfers/[id]/route.ts:199-217` | Anulación de transferencia (rollback origen) | No |
| 11 | `src/app/api/products/route.ts:234-241, 255-275` | Creación de producto con stock inicial | No |
| 12 | `src/app/api/products/[id]/route.ts:163-194` | Edición de producto (set absoluto, sin auditoría) | **No** ← bug oculto |
| 13 | `src/app/api/products/bulk/route.ts:137-228` | Importación masiva (upsert) | No |

⇒ **13 puntos en código** tocan stock; sólo uno (ajuste manual) genera
audit trail estructurado. El refactor a `StockMovement` debe cubrir
los 13.

### 2.6 Asientos contables

El único asiento ligado a una venta es:

`src/app/api/sales/route.ts:401-414`

```ts
await createAccountingEntry(tx, {
  type: 'INCOME',
  categoryName,                                  // "Ventas POS" o "Ventas Remotas"
  description: `Venta #${...}`,
  amount: Number(completedSale.total),
  referenceType: 'SALE',
  ...
});
```

No se genera DR COGS / CR Inventario. El P&L lo calcula a posteriori
leyendo `SaleItem.unitCost`. Esto es lo que el plan corrige en la Fase 15
con el asiento doble — depende de Fase 14 ya estar terminada.

---

## 3. Hallazgos numerados

### H-1 · Severidad **alta** — Costeo "último" no "promedio"
`src/app/api/purchases/route.ts:171-181`

Cada recepción de PO hace:
```ts
await tx.product.update({ where: { id: item.productId, companyId }, data: { cost: item.unitCost } });
```
Sin pesar contra stock existente. Una compra de 1 unidad a Q100 puede
cambiar el costo de 1,000 unidades en stock que estaban a Q10. Distorsiona
margen y valuación a partir de la próxima venta.

### H-2 · Severidad **alta** — Bundle con `unitCost=0`
`src/app/api/products/route.ts:224` (creación) y
`src/app/api/sales/route.ts:258` (snapshot).

`Product.cost` del bundle se fuerza a 0 al crear, y la venta hace
`unitCost = Number(product?.cost || 0)`. Resultado: COGS reportado para
ventas de bundle siempre es 0, margen siempre 100%. Crítico porque los
combos son comunes en PYMES (ofertas combo).

### H-3 · Severidad **alta** — Kardex con ventana de 90 días corrupta el saldo
`src/app/api/reports/inventory/kardex/route.ts:75-77, 264-269`

El plan menciona esto. Confirmado: `running` empieza en 0 en `startDate`.
La UI ya muestra simultáneamente `balance` (running) y `stockActualReal`
para que el usuario "vea la diferencia", lo que delata el bug. Plan de
Fase 15 lo arregla.

### H-4 · Severidad **alta** — Edición de producto reescribe stock absoluto sin audit
`src/app/api/products/[id]/route.ts:163-194`

`PUT /api/products/[id]` actualiza `ProductStock.quantity` con un set
absoluto (no increment) usando `body.stock`. No registra
`InventoryAdjustment`. Cualquier dueño/admin que edite un producto desde
el panel modifica stock sin dejar rastro. Es un agujero de control
interno. Debe transformarse en ajuste registrado en Fase 15 (o
deprecarse y exigir adjustments endpoint).

### H-5 · Severidad **alta** — Ventas anuladas y traslados PENDING no figuran en kardex
`src/app/api/reports/inventory/kardex/route.ts:122-124, 152-153`

- Ventas: filtro `status: 'COMPLETED'`. Cuando una venta se anula la
  fila queda con `status: 'CANCELLED'` y el handler ya reincorporó
  stock (`src/app/api/sales/[id]/route.ts:122-131`). El kardex no ve
  ni la salida original ni el regreso → discrepancia silenciosa.
- Traslados: filtro `status: 'COMPLETED'`. Un traslado PENDING **ya
  decrementó el origen** (`stock-transfers/route.ts:146-156`). El
  kardex no lo refleja → el origen "perdió" stock fantasma.

### H-6 · Severidad **media** — No hay asiento DR COGS / CR Inventario al vender
`src/app/api/sales/route.ts:401-414`. Plan ya lo cubre.

### H-7 · Severidad **media** — Stock negativo previene parcialmente, pero no en todos los caminos
- Ventas: usa `updateMany` con `quantity: { gte: ... }` + `count===1`
  (`sales/route.ts:346-392`). ✅
- Transferencia OUT: igual, usa `updateMany` con guard (`stock-transfers/route.ts:146-156`). ✅
- Ajustes: usa `set absoluto`, valida `newQuantity >= 0` en Zod. ✅
- Anulación de PO: tiene guard (`purchases/[id]/route.ts:116-132`). ✅
- **Anulación de venta**: NO tiene guard.
  `sales/[id]/route.ts:122-131` hace `increment` sin condición de
  destino, lo que está bien para sumar, pero **no valida si hubo
  ventas posteriores que ya consumieron stock que esa anulación está
  reincorporando**. Bug menor: stock final correcto pero permite
  reincorporar producto inactivo/borrado lógicamente.
- **Devolución de venta**: igual,
  `pos/returns/route.ts:181-230` y `sales/[id]/return/route.ts:108-115`
  hacen increment sin verificar producto activo.
- **Anulación de traslado**: si el destino ya recibió, el traslado
  estaría en `COMPLETED`, no `PENDING`, así que el DELETE retorna 400
  (`stock-transfers/[id]/route.ts:182`). ✅. Pero si la sucursal destino
  ya vendió parte del recibido y el traslado vuelve a `PENDING`
  manualmente vía DB, hay un agujero teórico — fuera de scope.

### H-8 · Severidad **media** — Race condition en upserts de stock con `findFirst` + `update`
Varios handlers tienen el patrón:
```ts
const existing = await tx.productStock.findFirst({...});
if (existing) await tx.productStock.update({...}); else await tx.productStock.create({...});
```
(ver `inventory/adjustments/route.ts:48-73`, `products/[id]/route.ts`,
`products/bulk/route.ts:29-58`, `stock-transfers/[id]/route.ts:35-60`).
En transacciones serializables esto sería OK; Postgres por default es
READ COMMITTED. La constraint `@@unique([productId, branchId, variantId])`
salva de duplicados pero genera P2002 esporádico bajo concurrencia.
Migrar a `upsert` con la unique key resuelve la mayoría.

### H-9 · Severidad **media** — Recepción de PO no usa `updateMany` con guard
`src/app/api/purchases/route.ts:137-165` hace `findFirst` + `update` +
`increment`. Bajo carga, una recepción concurrente puede generar 2
filas si el findFirst y el create se solapan (mismo bug del H-8). El
incremento por sí mismo es atómico, pero la rama "no existe → create"
no está protegida.

### H-10 · Severidad **baja** — `Product.cost` se actualiza fuera del `$transaction` que crea PO
En realidad sí está adentro (líneas 119-203). ✅. Pero el asiento
contable se llama después del transaction
(`createAccountingEntryAsync(prisma, ...)`, línea 205). Si el asiento
falla la PO queda sin contabilidad. Plan ya lo identifica para Fase 19.

### H-11 · Severidad **baja** — Bulk import no recalcula costo si el producto ya existe
`src/app/api/products/bulk/route.ts:131-146`. Si el SKU existe sólo
hace `upsertBaseStock`. No actualiza `Product.cost`. En un mundo de
último costo, importar un Excel con costos nuevos no actualiza nada.
Documentar y/o respetar deliberadamente.

### H-12 · Severidad **baja** — `InventoryAdjustment` no tiene tipo (IN/OUT) ni unitCost
`prisma/schema.prisma:238-258`. Solo guarda `oldQuantity`, `newQuantity`,
`difference`, `reason`. No persiste el costo del ajuste, por lo que
los ajustes por merma/rotura no impactan el costo promedio.
**Importante para Fase 15:** los `StockMovement` de tipo ADJUSTMENT_IN
deberían capturar `unitCost` (el costo promedio vigente al momento).

### H-13 · Severidad **baja** — `wholesalePrice` en variantes no tiene un cost paralelo
`prisma/schema.prisma:197-218`. Variantes tienen `wholesalePrice` pero
no hay análogo para diferentes proveedores o ubicaciones. Está OK por
ahora, sólo apuntar.

### H-14 · Severidad **media** — Cancelación de venta y devolución NO tocan `Product.cost`
Si la Fase 15 implementa promedio ponderado correcto, **el regreso de
stock por devolución también debería reajustar el costo promedio**
(o, más simple, registrarse como movimiento RETURN con unitCost =
unitCost original del SaleItem). De lo contrario el costo promedio se
distorsiona porque vuelven unidades al stock sin componente de costo.

### H-15 · Severidad **baja** — Reportes acumulados de COGS leen `SaleItem.unitCost` directamente
- `reports/accounting/profit-loss/route.ts:120-123`
- `reports/sales/by-user/route.ts:79-83`
- `reports/sales/route.ts:71`
Todos suman `unitCost * quantity`. Con los bugs H-1 y H-2 esos números
están sistemáticamente bajos. Una vez Fase 15 corrija el snapshot,
estos reportes empiezan a dar números reales sin tocarlos. ✅

---

## 4. Volumen del refactor

Lugares que **tocan stock** y deben pasar a generar `StockMovement`:

```
1.  src/app/api/inventory/adjustments/route.ts (POST)          → ADJUSTMENT_IN/OUT
2.  src/app/api/purchases/route.ts (POST)                      → PURCHASE
3.  src/app/api/purchases/[id]/route.ts (PATCH cancel)         → PURCHASE_REVERSAL
4.  src/app/api/sales/route.ts (POST)                          → SALE (con cost snapshot)
5.  src/app/api/sales/[id]/route.ts (PATCH cancel)             → SALE_CANCEL
6.  src/app/api/sales/[id]/return/route.ts (POST)              → RETURN
7.  src/app/api/pos/returns/route.ts (POST)                    → RETURN
8.  src/app/api/stock-transfers/route.ts (POST)                → TRANSFER_OUT
9.  src/app/api/stock-transfers/[id]/route.ts (PUT/PATCH)      → TRANSFER_IN
10. src/app/api/stock-transfers/[id]/route.ts (DELETE)         → TRANSFER_CANCEL (rollback)
11. src/app/api/products/route.ts (POST con stock inicial)     → INITIAL/ADJUSTMENT_IN
12. src/app/api/products/[id]/route.ts (PUT)                   → ADJUSTMENT_IN/OUT (o deprecar)
13. src/app/api/products/bulk/route.ts (POST)                  → ADJUSTMENT_IN
```

Lugares que **leen costo** y se beneficiarán del refactor (no requieren
cambio, sólo que el dato sea correcto):

```
- src/app/api/reports/accounting/profit-loss/route.ts (COGS)
- src/app/api/reports/inventory/valuation/route.ts (valuación)
- src/app/api/reports/inventory/slow-movers/route.ts (capital at risk)
- src/app/api/reports/sales/by-user/route.ts (margen por vendedor)
- src/app/api/reports/sales/route.ts (margen)
- src/app/api/reports/products/top/route.ts
- src/app/api/dashboard/route.ts (si saca margen)
```

Lugar que **se reescribe completo**:
- `src/app/api/reports/inventory/kardex/route.ts` — pasar de
  multi-tabla in-memory a `SELECT * FROM StockMovement` ordenado.

Helper nuevo recomendado:
- `src/lib/inventory.ts` con `recordStockMovement(tx, ...)`,
  `computeWeightedAverageCost(tx, productId, variantId, qty, unitCost)`,
  `getCurrentCost(tx, productId, variantId)` y
  `computeBundleCost(tx, bundleProductId)`. Centralizado, testeable.

Migración Prisma:
- Crear `model StockMovement` con FKs a `Product`, `ProductVariant`,
  `Branch`, `User`. Index por `(productId, variantId, branchId, date)`.
- **Backfill histórico**: script que recorra `PurchaseOrderItem`,
  `SaleItem`, `InventoryAdjustment`, `StockTransferItem`,
  `SaleReturnItem` y genere las filas correspondientes en orden
  cronológico, calculando `balanceAfter` y `unitCost` (promedio
  ponderado reconstruido). Sin esto, el kardex post-Fase15 no muestra
  histórico.

---

## 5. Preguntas abiertas

1. **¿Granularidad del costo: por empresa o por sucursal?** El esquema
   actual de `Product.cost` es global por empresa, pero `ProductStock`
   vive en sucursal. Si una sucursal compra Q100 y otra Q150, ¿el
   promedio ponderado es global o se mantienen costos paralelos por
   sucursal? Recomendación: global (más simple, alineado con el
   esquema actual). El plan no lo aclara.
2. **¿Backfill histórico hasta dónde?** Hay clientes con datos desde
   2024. ¿Reconstruimos el kardex completo o cortamos en una fecha
   "inicio Fase 15"? El plan dice "desde el primer movimiento histórico"
   — implica backfill completo. Validar con dueño porque puede ser
   pesado (10k+ movimientos por cliente activo).
3. **Manejo de devoluciones en el promedio ponderado.** Cuando vuelve
   stock por devolución, ¿reingresamos con `unitCost = SaleItem.unitCost`
   (su costo de venta) o con el costo promedio vigente? Recomendación:
   con el unitCost histórico para no contaminar el promedio.
4. **¿Tipo `PURCHASE_REVERSAL` o solo `ADJUSTMENT_OUT`?** Cuando se
   anula una PO ya recibida, se decrementa stock por el mismo monto. El
   plan no lista este tipo. Recomendación: agregarlo explícitamente para
   poder distinguirlo en kardex.
5. **Producto bundle vs. componentes en `StockMovement`.** Al vender un
   bundle, ¿registramos 1 movimiento `SALE` del bundle (con qty 1 y
   unitCost = Σ componentes) o N movimientos `SALE` de cada componente
   (con qty * bundleQty cada uno)? El stock físico que se decrementa son
   los componentes. Recomendación: un movimiento SALE para el bundle
   (visible en su kardex) **más** N movimientos `BUNDLE_CONSUMPTION` por
   cada componente (visibles en kardex de componentes). Doble registro
   pero consistente.
6. **Stock de productos con `hasVariants=true` pero sin variantes
   capturadas.** Hay casos en la BD (verificar) donde el parent existe
   con `hasVariants=true` pero sin filas en `ProductVariant`. ¿Esos
   productos tienen costo? Hoy `Product.cost=0` forzado. Definir antes
   de migrar.
7. **¿Recalculamos `Product.cost` o introducimos `Product.averageCost`
   nueva?** El plan dice "persistir Product.cost con el promedio
   recalculado", pero `cost` actualmente es el "último costo" para UI
   (ej: en `inventory/page.tsx` se muestra). Cambiar el significado es
   un cambio de contrato. Recomendación: renombrar a `currentAverageCost`
   en una migración con back-compat o documentar el cambio.

---

## 6. Recomendaciones

### 6.1 Sobre el plan tal como está

✅ El plan está **bien orientado** en general:
- Crear `StockMovement` es la decisión correcta.
- Promedio ponderado al recibir compra es el algoritmo industrial estándar.
- Snapshot de `SaleItem.unitCost` ya existe — sólo hay que leer el valor correcto.
- Kardex desde `StockMovement` es la simplificación necesaria.
- Asiento COGS depende de Fase 14, correcto orden.

### 6.2 Ampliar el alcance del plan

Agregar al deliverable de Fase 15:

a) **Helper `src/lib/inventory.ts`** centralizado. Sin esto, los 13
   call sites quedarían duplicando lógica.
b) **Backfill script** (`prisma/scripts/backfill-stock-movements.ts`)
   versionado y reproducible. Probado en stage antes de prod.
c) **Tipo `BUNDLE_CONSUMPTION` en el enum** para distinguir
   movimientos de descomposición de combos.
d) **Tipo `PURCHASE_REVERSAL`, `SALE_CANCEL`, `TRANSFER_CANCEL`** para
   las anulaciones — el plan los engloba en ADJUSTMENT_IN/OUT y pierde
   trazabilidad.
e) **Refactor de `PUT /api/products/[id]`** (H-4): o bien forzar paso
   por `inventory/adjustments`, o bien generar un movement automático
   con razón "Edición manual del producto". El plan no lo menciona.
f) **Costeo correcto de bundles** explícito en código (H-2). No basta
   "costo del bundle = suma de componentes en ese momento"; hay que
   decidir si lo calculamos en cada venta o si persistimos
   `Product.cost` del bundle como cache (con riesgo de quedar stale).
g) **Migrar `findFirst+create/update` a `upsert`** en todos los puntos
   de stock (H-8, H-9) para reducir P2002 esporádicos.
h) **Tests unitarios** del helper de promedio ponderado: 3 compras a
   precios distintos, devolución, ajuste, transferencia. La validación
   del plan ("escenario de 3 compras + 2 ventas") es buena pero queda
   corta.
i) **Tests de integración del kardex**: que `Σ movimientos.quantity ==
   ProductStock.quantity` para cualquier producto.
j) **Documentación de cambio de contrato** de `Product.cost` (de
   "último costo" a "promedio ponderado").

### 6.3 Decidir explícitamente antes de empezar

- Granularidad del costo (empresa vs. sucursal).
- Manejo del costo en devoluciones.
- Profundidad del backfill.
- Bundle: doble registro o solo en componentes.

---

## 7. Validación cruzada del plan de Fase 15

| Item del plan | Estado en código | Veredicto |
|---|---|---|
| "Modelo `StockMovement` con type/quantity/unitCost/balanceAfter" | No existe | OK, crear. |
| "Trigger automático en cada operación" | 13 puntos diferentes en código | OK pero centralizar en helper. |
| "Promedio ponderado en cada recepción" | Hoy es último costo | OK, reemplazar. |
| "Persistir Product.cost con promedio" | Hoy se persiste último | OK, semántica cambia (avisar). |
| "SaleItem.unitCost = costo al vender" | Ya se persiste; valor incorrecto | OK, refactor de lectura, no de schema. |
| "Costeo correcto de bundles" | Hoy unitCost=0 en bundle | OK, agregar `computeBundleCost`. |
| "Kardex desde StockMovement" | Hoy reconstruye desde 5 tablas | OK, reescribir. |
| "Eliminar ventana de 90 días" | Confirmado, default 90d | OK. |
| "Valuación con costo promedio" | Hoy lee Product.cost (=último) | Funciona automáticamente si cambia la semántica. |
| "Asiento COGS al vender (DR COGS / CR Inventario)" | No existe | Requiere Fase 14 cerrada con plan de cuentas + JournalLine. |

**Conclusión:** el plan está alineado. Los gaps que falta agregar son
los listados en 6.2 (helper, backfill, types extras, bundles, edición
de producto, tests, decisiones).

---

## 8. Estimación de esfuerzo

Asumiendo un subagente especialista (perfil inventory) con buen
contexto:

| Bloque | Horas | Notas |
|---|---|---|
| Schema `StockMovement` + migración Prisma | 2 | Modelo + índices + enum. |
| Helper `src/lib/inventory.ts` con WAC + getCurrentCost + computeBundleCost | 4 | Con types y tests unitarios. |
| Refactor 13 call sites para usar el helper | 8 | El más laborioso. |
| Recálculo de `Product.cost` (WAC) en recepción de PO | 1 | Inline al helper. |
| Snapshot de `SaleItem.unitCost` con bundles correctos | 2 | Inline en `sales/route.ts`. |
| Reescritura del kardex | 3 | Reemplazo total del handler. |
| Reescritura/ajuste de valuation report | 1 | Mínimo, sólo limpieza. |
| Asiento COGS al vender (DR/CR — requiere Fase 14 lista) | 3 | Integración con JournalEntry. |
| Backfill script + dry-run | 4 | Crítico, probar en stage. |
| Tests unit (WAC + bundle cost + kardex consistency) | 4 | Cobertura objetivo: ≥80% del nuevo helper. |
| Tests e2e (3 compras + 2 ventas + devolución + ajuste) | 3 | Como pide el plan. |
| Refactor `PUT /api/products/[id]` para audit (H-4) | 2 | O deprecar. |
| Docs en `docs/audits/phase-15-completion.md` | 2 | Como el resto de fases. |
| QA, regresiones, hot-fix margin | 5 | Buffer. |
| **Total** | **~44h** | ≈ 5-6 días concentrados. |

Si la Fase 14 (plan de cuentas) no está completamente cerrada cuando
arranca Fase 15, agregar 4-6 horas para acoplar el asiento COGS.

**Recomendación final:** ejecutar la fase con el alcance ampliado en
sección 6.2; no comprometerla en menos de una semana de trabajo
dedicado del subagente con verificación cruzada al final.

---

## Archivos referenciados en la auditoría

```
prisma/schema.prisma                                              (modelos)
src/app/api/products/route.ts                                     (creación, cost en bundles)
src/app/api/products/[id]/route.ts                                (edición sin audit)
src/app/api/products/bulk/route.ts                                (import)
src/app/api/purchases/route.ts                                    (último costo)
src/app/api/purchases/[id]/route.ts                               (reversa)
src/app/api/sales/route.ts                                        (snapshot, asiento)
src/app/api/sales/[id]/route.ts                                   (anulación)
src/app/api/sales/[id]/return/route.ts                            (return)
src/app/api/pos/returns/route.ts                                  (return POS)
src/app/api/stock-transfers/route.ts                              (OUT)
src/app/api/stock-transfers/[id]/route.ts                         (IN/cancel)
src/app/api/inventory/adjustments/route.ts                        (único con audit)
src/app/api/reports/inventory/kardex/route.ts                     (a reescribir)
src/app/api/reports/inventory/valuation/route.ts                  (lee cost)
src/app/api/reports/inventory/slow-movers/route.ts                (lee cost)
src/app/api/reports/accounting/profit-loss/route.ts               (COGS desde SaleItem)
src/app/api/reports/sales/by-user/route.ts                        (margen por vendedor)
src/lib/accounting.ts                                             (no toca costo)
```
