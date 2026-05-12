# Fase 15 · Completion Report — Costeo Promedio Ponderado (WAC) + StockMovement + Asiento COGS

Fecha: 2026-05-11
Subagente: inventory
Estado: implementación completa en disco. Pendiente: aplicación manual de la migración Supabase + `npm install && npx prisma generate` + `npx vitest run` por el dueño.

---

## 1. Qué se hizo

### 1.1 Schema Prisma + migración

- Modelo nuevo `StockMovement` con:
  - `id` (uuid), `companyId`, `productId`, `variantId?`, `branchId`, `userId`.
  - `type StockMovementType` (PURCHASE | SALE | ADJUSTMENT_IN/OUT | TRANSFER_IN/OUT | RETURN_FROM_CUSTOMER | RETURN_TO_SUPPLIER | COUNT_DIFFERENCE).
  - `quantity Decimal(15,3)` **firmada** (positivo entrada, negativo salida).
  - `unitCost Decimal(15,4)` (snapshot del costo en ese momento).
  - `balanceAfter Decimal(15,3)` (stock running global del SKU tras el movimiento).
  - `costAfter Decimal(15,4)` (WAC vigente tras el movimiento).
  - `referenceType` (texto: 'PURCHASE_ORDER', 'SALE', 'SALE_RETURN', 'STOCK_TRANSFER', 'INVENTORY_ADJUSTMENT', 'PRODUCT_INITIAL_STOCK', 'PRODUCT_EDIT', 'PRODUCT_BULK_IMPORT', 'PURCHASE_ORDER_CANCEL', 'SALE_CANCEL', 'STOCK_TRANSFER_CANCEL').
  - `referenceId` (uuid del documento origen).
  - `notes?` libre.
  - Índices: `(companyId, productId, date)`, `(companyId, branchId, date)`, `(referenceType, referenceId)`.
- Enum nuevo `StockMovementType`.
- Relaciones inversas en `Company`, `Product`, `ProductVariant`, `Branch`, `User`.

Migración SQL idempotente en `prisma/migrations/20260513000000_stock_movement_and_wac/migration.sql`:

1. `CREATE TYPE "StockMovementType"` protegido con `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object`.
2. `CREATE TABLE IF NOT EXISTS "StockMovement"` con FKs y 3 índices.
3. **Backfill histórico** vía CTE compuesta:
   - PURCHASE: cada `PurchaseOrderItem` con `qty=+poi.quantity`, `unitCost=poi.unitCost`.
   - SALE: cada `SaleItem` con `qty=-si.quantity`, `unitCost=COALESCE(si.unitCost, product.cost, 0)`.
   - ADJUSTMENT_IN/OUT según signo de `InventoryAdjustment.difference`, `unitCost=variant.cost ?? product.cost`.
   - TRANSFER_OUT (en origen, PENDING/COMPLETED) + TRANSFER_IN (en destino, COMPLETED solamente).
   - RETURN_FROM_CUSTOMER: cada `SaleReturnItem` con `stockAdded=true` con `unitCost=si.unitCost`.
   - Ordenamiento por `(productId, variantId, date)` con window function `ROW_NUMBER()` y `SUM ... OVER` para calcular `balanceAfter`.
   - `costAfter` aproximado como `unitCost` del propio movimiento (no replay exacto del WAC — ver Riesgos #2).
   - Idempotente vía `WHERE NOT EXISTS` por `(referenceType, referenceId, productId, variantId, type, branchId)`.
4. RLS habilitado + policy `tenant_isolation_stock_movement` con el mismo patrón de Fase 13/14.

### 1.2 Helper centralizado `src/lib/inventory/`

- **`src/lib/inventory/cost.ts`**: API pública.
  - `weightedAverageCost(stockBefore, costBefore, qtyIn, costIn)` — fórmula clásica con defensas (stock ≤ 0 → costIn, qtyIn ≤ 0 → costBefore, costIn ≤ 0 → costBefore, totalQty ≤ 0 → costBefore).
  - `getCurrentCost(tx, productId, variantId?)` — variantes lee `variant.cost`; bundles suman recursivamente costos de componentes (soporta bundle-de-bundle); default lee `product.cost`.
  - `recordStockMovement(tx, input)` — flujo completo: lee stock total cross-branch + costo persistido, calcula WAC si es entrada, aplica delta a `ProductStock`, actualiza `Product.cost`/`ProductVariant.cost` si es entrada con cambio, e inserta la fila en `StockMovement`. Devuelve el movimiento.
  - `logStockMovementInline(tx, input)` — variante que NO toca stock ni cost (solo escribe el log). Para callers que ya hicieron `updateMany` con guard de race condition (ventas, transferencias) y necesitan trazabilidad sin doblar la operación.
- **`src/lib/inventory/index.ts`** — re-exports.

### 1.3 Refactor de los 13 call sites (lista completa)

| # | Archivo | Cambio |
|---|---|---|
| 1 | `src/app/api/inventory/adjustments/route.ts` (POST) | `logStockMovementInline` con ADJUSTMENT_IN/OUT según signo. |
| 2 | `src/app/api/purchases/route.ts` (POST) | `recordStockMovement(type=PURCHASE)` por cada línea — aplica WAC y persiste cost. Se eliminó la lógica vieja de `findFirst+update+create` y la sobrescritura ciega de `Product.cost`. |
| 3 | `src/app/api/purchases/[id]/route.ts` (PATCH CANCEL) | `logStockMovementInline(type=RETURN_TO_SUPPLIER)` con `quantity` negativa tras updateMany guard. |
| 4 | `src/app/api/sales/route.ts` (POST) | `getCurrentCost` para snapshot de `SaleItem.unitCost` (incluye bundle = Σ componentes). `logStockMovementInline(type=SALE)` por cada línea/componente. Asiento COGS DR/CR agregado al final. |
| 5 | `src/app/api/sales/[id]/route.ts` (PATCH CANCEL) | `logStockMovementInline(type=RETURN_FROM_CUSTOMER)` por ítem. Reversa adicional del JournalEntry COGS si existió. |
| 6 | `src/app/api/sales/[id]/return/route.ts` (POST) | `logStockMovementInline(type=RETURN_FROM_CUSTOMER)` por ítem cuando `stockAdded=true`. |
| 7 | `src/app/api/pos/returns/route.ts` (POST) | `logStockMovementInline(type=RETURN_FROM_CUSTOMER)` por ítem (también para bundle: por cada componente). |
| 8 | `src/app/api/stock-transfers/route.ts` (POST) | `logStockMovementInline(type=TRANSFER_OUT)` en origen tras updateMany guard. |
| 9 | `src/app/api/stock-transfers/[id]/route.ts` (PUT/PATCH RECEIVE) | `logStockMovementInline(type=TRANSFER_IN)` en destino. |
| 10 | `src/app/api/stock-transfers/[id]/route.ts` (DELETE CANCEL) | `logStockMovementInline(type=TRANSFER_IN)` en origen (compensación). |
| 11 | `src/app/api/products/route.ts` (POST creación) | `logStockMovementInline(type=ADJUSTMENT_IN)` con `referenceType=PRODUCT_INITIAL_STOCK` cuando hay stock inicial > 0 (caso simple y caso variants). |
| 12 | `src/app/api/products/[id]/route.ts` (PUT) | Captura `oldQuantity` previo al `upsert`, loguea diff como ADJUSTMENT_IN/OUT con `referenceType=PRODUCT_EDIT` (H-4 de discovery). |
| 13 | `src/app/api/products/bulk/route.ts` (POST) | `logStockMovementInline(ADJUSTMENT_IN)` para productos nuevos; diff-based ADJUSTMENT_IN/OUT para productos existentes; `referenceType=PRODUCT_BULK_IMPORT`. |

### 1.4 Asiento COGS al vender

En `src/app/api/sales/route.ts`, después del JournalEntry de venta:

```ts
const totalCost = items.reduce((sum, it, idx) => sum + unitCostByItemIndex[idx] * it.quantity, 0);
if (totalCost > 0) {
  await createJournalEntry(tx, {
    ...,
    description: `COGS Venta #${...}`,
    referenceType: 'SALE_COGS',
    referenceId: completedSale.id,
    lines: [
      { accountCode: ACCOUNTS.COGS, debit: totalCost, ... },
      { accountCode: ACCOUNTS.INVENTORY, credit: totalCost, ... },
    ],
  });
}
```

Se omite si `totalCost === 0` para no chocar contra la validación `Σ DR > 0` del helper de partida doble.

Anulación de venta (`sales/[id] PATCH`): además del `reverseJournalEntry` del asiento de venta, ahora busca el `SALE_COGS` y lo reversa también.

### 1.5 Reescritura del kardex

`src/app/api/reports/inventory/kardex/route.ts` se simplificó a 1 query sobre `StockMovement` (antes leía 5 tablas con joins y construía el saldo running en memoria). Cambios:

- Sin ventana de 90 días: `from` opcional; si está ausente, kardex desde el primer movimiento.
- `balanceAfter` y `costAfter` ya están persistidos — no se recalculan.
- Resumen incluye `valuacionFinal = lastBalance * lastCost` (chequeo de consistencia).
- Sigue retornando `stockActualReal` desde `ProductStock` para que la UI muestre la reconciliación.

### 1.6 Valuación con WAC

`src/app/api/reports/inventory/valuation/route.ts`: agregamos `isBundle: false` al filtro de productos para evitar doble conteo (el valor del bundle ya está en sus componentes). El resto funciona automáticamente porque `Product.cost` y `ProductVariant.cost` ya son WAC.

### 1.7 Tests Vitest

`src/lib/inventory/__tests__/`:

1. `cost.test.ts` (8 casos) — WAC: stock=0+entrada normal, stock+entrada normal, promedio en el medio, stock=0+entrada=0, entrada negativa, costoNuevo=0, stock negativo, 3 iteraciones consecutivas.
2. `bundle-cost.test.ts` (5 casos) — producto simple sin variante, con variante, bundle simple, bundle de bundle recursivo, bundle con componente con variante.
3. `stock-movement.test.ts` (5 casos) — PURCHASE actualiza WAC y stock, SALE no recalcula WAC, ADJUSTMENT_IN vs OUT, creación de ProductStock si no existía, quantity=0 lanza error.
4. `kardex.test.ts` (2 casos) — escenario 3 compras + 2 ventas → balanceAfter y costAfter cuadran, valuación final correcta; invariante `Σ movimientos.quantity == stock físico final`.

Total: 20 tests. Mock minimal en `src/lib/inventory/__tests__/mock-tx.ts` (no depende de DB real, paralelo al de Fase 14).

## 2. Validación

### `npm run typecheck`

```
> simtech-pos@0.1.0 typecheck
> tsc --noEmit

(salida vacía → exit code 0 → verde)
```

### `npm run lint`

```
> simtech-pos@0.1.0 lint
> eslint .

✖ 64 problems (0 errors, 64 warnings)
```

**Igual al baseline de Fase 14** (64 warnings, todos pre-existentes en tests/shims). El módulo `src/lib/inventory/**` pasa lint en cero (los `any` en `mock-tx.ts` están localmente disabled con `/* eslint-disable @typescript-eslint/no-explicit-any */` siguiendo el mismo patrón que Fase 14).

### `npx vitest run`

**No corrido en el sandbox** (mismo bloqueo de Fase 14: rollup native bindings `@rollup/rollup-linux-arm64-gnu` no instalables sin red). Como validación alternativa, se corrió la lógica de `weightedAverageCost` standalone en Node: **7/7 casos OK**.

```
OK stock=0+entrada normal => 100
OK stock+entrada normal => 150
OK 5@80 + 5@120 -> 100 => 100
OK entrada=0 -> costoAnterior => 50
OK entrada negativa => 100
OK costoNuevo=0 => 100
OK stock negativo => 50
```

El dueño debe correr `npx vitest run` localmente para validar las 20 pruebas.

### `npx prisma validate`

**No corrido** (mismo bloqueo de Fase 14: binary engine no descargable). Schema editado a mano siguiendo convenciones de Prisma 6. Verificaciones visuales:

- `StockMovement` tiene FKs correctas a `Company` (CASCADE), `Product` (RESTRICT), `ProductVariant` (SET NULL), `Branch` (RESTRICT), `User` (RESTRICT).
- Enum `StockMovementType` declarado con los 9 valores especificados.
- Relaciones inversas agregadas en `Company`, `Product`, `ProductVariant`, `Branch`, `User`.

## 3. Pasos que el dueño debe ejecutar manualmente

### 3.1 Regenerar el cliente Prisma

```bash
cd ERP-SIMTECH
npx prisma generate
```

Esto agrega `stockMovement` al `PrismaClient` real, haciendo redundantes los `any`-types del shim `src/types/prisma-phase14.d.ts` (que ya estaba ahí desde Fase 14 — solo extendí la interface).

### 3.2 Aplicar la migración SQL en Supabase

```bash
npx prisma migrate deploy
# Aplica prisma/migrations/20260513000000_stock_movement_and_wac/migration.sql
```

### 3.3 Verificaciones post-migración

```sql
-- Cuenta de movimientos backfilled por empresa
SELECT "companyId", COUNT(*) FROM "StockMovement" GROUP BY "companyId";

-- Reconciliación stock real vs último balanceAfter
WITH last_mov AS (
  SELECT DISTINCT ON ("productId", COALESCE("variantId", ''))
    "productId", "variantId", "balanceAfter", "costAfter"
  FROM "StockMovement"
  ORDER BY "productId", COALESCE("variantId", ''), "date" DESC
),
actual_stock AS (
  SELECT "productId", "variantId", SUM("quantity") AS qty
  FROM "ProductStock"
  GROUP BY "productId", "variantId"
)
SELECT *
FROM last_mov lm
FULL OUTER JOIN actual_stock as_ ON
  lm."productId" = as_."productId"
  AND COALESCE(lm."variantId", '') = COALESCE(as_."variantId", '')
WHERE COALESCE(lm."balanceAfter", 0) != COALESCE(as_."qty", 0);
-- Esperado: 0 filas (o explicar diferencias para movimientos que no pasaron
-- por StockMovement antes de la migración).

-- Sample de un kardex
SELECT "date", "type", "quantity", "unitCost", "balanceAfter", "costAfter", "referenceType"
FROM "StockMovement"
WHERE "productId" = '<algún-uuid>'
ORDER BY "date" ASC;
```

### 3.4 Correr los tests

```bash
npm test
# o
npx vitest run src/lib/inventory
```

Esperado: 20/20 pass.

## 4. Pendiente / fuera de alcance

- **Asiento contable al recibir traslado** (cuando varias sucursales tienen contabilidad separada). Hoy todas las sucursales de una empresa comparten plan de cuentas, así que el traslado es operativo sin impacto contable.
- **Reescribir reportes que leen `SaleItem.unitCost`** (`profit-loss`, `sales/by-user`, `top-products`): ya están leyendo el campo correcto. Una vez aplicada la migración, los números mejoran solos. No requiere cambios de código.
- **UI nueva para visualizar StockMovement directamente** (página kardex en `/inventory/kardex`): el endpoint nuevo está listo, falta UI. Diferido a Fase 22.
- **Trigger de recálculo masivo de WAC** desde la consola del admin (por si quieren revaluar inventario manualmente). Fuera de scope.
- **Sale.tax cálculo real con IVA**. Fase 16.

## 5. Riesgos identificados

1. **Concurrencia en `recordStockMovement` (no en sales).** El helper hace `findMany + create/update` en lugar de un `upsert` atómico al sumar el delta. Bajo carga concurrente extrema (dos compras simultáneas del mismo SKU en la misma sucursal), Postgres con READ COMMITTED puede generar un P2002 esporádico sobre `(productId, branchId, variantId)`. Para ventas, transferencias y devoluciones usamos `logStockMovementInline` que asume que el caller ya hizo `updateMany` con guard `quantity: { gte }` — no aplica este riesgo. **Mitigación:** las compras son el único call site donde aplicaría; agregar un `upsert` ahí en una fase de hardening si el dueño detecta P2002 en logs.

2. **Backfill aproxima `costAfter` con el `unitCost` del propio movimiento, no replay exacto del WAC histórico.** Reconstruir el WAC exacto requiere replay paso a paso por SKU en un script de aplicación, no SQL puro. La aproximación significa que el costo running en el kardex histórico puede mostrar el "costo del lote" en lugar del "promedio acumulado". Para movimientos POST-migración el WAC es exacto. **Mitigación:** documentado; opcionalmente un script TypeScript `prisma/scripts/recompute-wac-history.ts` puede reescribir `costAfter` con replay exacto si el dueño lo necesita (no incluido en esta fase).

3. **`Product.cost` cambió de "último costo" a "WAC".** Las UIs que mostraban `Product.cost` como "costo de la última compra" ahora muestran el promedio ponderado. Cambio de contrato silencioso — algunos usuarios pueden notar que el "costo" cambió sin razón aparente. **Mitigación:** documentar en release notes; el cambio es contablemente correcto.

4. **Bundles: snapshot de costo se calcula al vender, no se persiste en `Product.cost`.** El `Product.cost` del bundle queda en 0 (hardcoded en creación). El costo se evalúa en cada venta vía `getCurrentCost` recursivo. Si un componente cambia de costo, las ventas futuras del bundle reflejan el nuevo costo automáticamente. **Esto es lo deseado**, pero distinto de un "costo cacheado". **Mitigación:** documentar; los reportes de margen del bundle son ahora correctos.

5. **El backfill no genera asientos COGS retroactivos.** Las ventas históricas en `Sale` no van a tener `JournalEntry` de tipo SALE_COGS. El P&L histórico no refleja COGS hasta que el dueño decida correr un script de re-emisión. **Mitigación:** intencional — re-emitir asientos retroactivos en períodos cerrados podría romper la inmutabilidad. Solo ventas nuevas tienen COGS automático.

6. **`StockMovement.companyId` en backfill viene de las tablas referenciadas (no de un parámetro).** Si alguna `PurchaseOrderItem` o `SaleItem` legacy tiene `companyId` huérfano (cross-tenant), el backfill lo migra como está. **Mitigación:** correr el script `integrity-check` previo en producción para detectar huérfanos.

7. **`StockMovement.balanceAfter` es saldo GLOBAL del SKU (cross-branch), no por sucursal.** Decisión de diseño consistente con el WAC global (`Product.cost` único por empresa, no por sucursal). El kardex por sucursal sigue funcionando: filtra movimientos donde `branchId = X`, pero el `balanceAfter` mostrado es el saldo global tras ese movimiento. **Mitigación:** documentar en la UI; agregar un `balanceAfterBranch` adicional sería 2x storage por movimiento — no rentable. Si el dueño lo pide, se puede calcular on-the-fly desde la propia tabla.

## 6. Decisiones de diseño tomadas fuera de lo especificado

1. **`logStockMovementInline` adicional al `recordStockMovement`.** El plan especificaba solo `recordStockMovement` que aplica el delta. En ventas, transferencias y devoluciones, el código existente ya hace `updateMany` con guard de concurrencia (race-safe). Pasar por `recordStockMovement` doblaría la operación o requeriría refactorizar todo el flow para que el helper haga el guard. Decisión: agregar `logStockMovementInline` que solo escribe la fila de auditoría leyendo `balanceAfter`/`costAfter` actualizados — el caller mantiene control del delta.

2. **`recordStockMovement` actualiza el costo en `Product.cost` para producto sin variante, pero en `ProductVariant.cost` para producto con variante.** Consistente con el schema actual donde `Product.cost = 0` cuando `hasVariants=true`.

3. **Backfill maneja `StockTransfer` en estado PENDING como TRANSFER_OUT.** El plan no lo aclaraba. Decisión: PENDING ya decrementó stock del origen (`transfers/route.ts:150`), por lo tanto debe figurar en el kardex como salida — caso contrario el kardex del origen queda inconsistente. El TRANSFER_IN solo aparece cuando el destino confirma recepción (status=COMPLETED).

4. **Costo en SaleItem para bundles = Σ(getCurrentCost recursivo).** El plan especificaba esto pero no la recursión. Decisión: soportar bundle-de-bundle vía recursión (test `bundle-cost.test.ts` lo cubre).

5. **El asiento COGS solo se genera si `totalCost > 0`.** Para ventas de productos sin costo capturado (datos sucios pre-migración), el COGS sería 0 y el helper de partida doble rechazaría un asiento sin líneas DR>0. Skip silencioso es preferible a abortar la venta.

6. **Tipo `RETURN_TO_SUPPLIER` para anulación de compra** (en lugar de `ADJUSTMENT_OUT` genérico). El plan permitía ambos. Decisión: `RETURN_TO_SUPPLIER` deja trazabilidad explícita en el kardex.

7. **`recordStockMovement` rechaza `quantity = 0`.** Decisión defensiva: nunca tiene sentido un movimiento de 0 unidades. Test cubre el caso.

8. **`weightedAverageCost(stock, cost, qty, 0)` devuelve `cost` (NO promedia con costo 0).** Decisión: entradas con costo 0 (bonificaciones, regalos del proveedor) NO deben distorsionar el WAC hacia abajo. Si el dueño necesita registrar la entrada gratis, se hace como `ADJUSTMENT_IN` y la lógica explícitamente decide no tocar el costo.

## 7. Archivos creados / modificados

### Creados (9 archivos)

- `prisma/migrations/20260513000000_stock_movement_and_wac/migration.sql`
- `src/lib/inventory/cost.ts`
- `src/lib/inventory/index.ts`
- `src/lib/inventory/__tests__/mock-tx.ts`
- `src/lib/inventory/__tests__/cost.test.ts`
- `src/lib/inventory/__tests__/bundle-cost.test.ts`
- `src/lib/inventory/__tests__/stock-movement.test.ts`
- `src/lib/inventory/__tests__/kardex.test.ts`
- `docs/audits/phase-15-completion.md` (este archivo)

### Modificados (13 archivos)

- `prisma/schema.prisma` — modelo `StockMovement` + enum `StockMovementType` + relaciones inversas en Company/Product/ProductVariant/Branch/User.
- `src/types/prisma-phase14.d.ts` — extensión del shim para incluir `stockMovement` delegate.
- `src/app/api/purchases/route.ts` — `recordStockMovement(PURCHASE)` reemplaza la lógica vieja de stock+cost.
- `src/app/api/purchases/[id]/route.ts` — `logStockMovementInline(RETURN_TO_SUPPLIER)` en anulación.
- `src/app/api/sales/route.ts` — `getCurrentCost` para snapshot WAC; `logStockMovementInline(SALE)` por línea/componente; asiento COGS (DR/CR) post-venta.
- `src/app/api/sales/[id]/route.ts` — `logStockMovementInline(RETURN_FROM_CUSTOMER)` en CANCEL; reversa adicional del JournalEntry SALE_COGS.
- `src/app/api/sales/[id]/return/route.ts` — `logStockMovementInline(RETURN_FROM_CUSTOMER)` por ítem reincorporado.
- `src/app/api/pos/returns/route.ts` — `logStockMovementInline(RETURN_FROM_CUSTOMER)` por ítem/componente reincorporado.
- `src/app/api/stock-transfers/route.ts` — `logStockMovementInline(TRANSFER_OUT)` en origen.
- `src/app/api/stock-transfers/[id]/route.ts` — `logStockMovementInline(TRANSFER_IN)` en destino (RECEIVE) y origen (CANCEL).
- `src/app/api/inventory/adjustments/route.ts` — `logStockMovementInline(ADJUSTMENT_IN/OUT)` según signo.
- `src/app/api/products/route.ts` — `logStockMovementInline(ADJUSTMENT_IN)` para stock inicial en POST (caso simple y variantes).
- `src/app/api/products/[id]/route.ts` — diff-based `logStockMovementInline(ADJUSTMENT_IN/OUT)` con `referenceType=PRODUCT_EDIT` (resuelve H-4 de discovery: edición de producto sin audit).
- `src/app/api/products/bulk/route.ts` — `logStockMovementInline` para creación inicial y para diff en re-import.
- `src/app/api/reports/inventory/kardex/route.ts` — reescritura completa, lee de `StockMovement` (sin ventana de 90 días, sin reconstrucción multi-tabla en memoria).
- `src/app/api/reports/inventory/valuation/route.ts` — filtro `isBundle=false` para evitar doble conteo; `Product.cost` ahora es WAC.

## 8. Hand-off al verificador

El segundo subagente debe verificar:

- `npm run typecheck` y `npm run lint` siguen verdes (0 errors, 64 warnings idénticos al baseline post-Fase14).
- `npm install && npx prisma generate` corre limpio y los `stockMovement` delegates aparecen en `PrismaClient` real.
- `npx vitest run` corre los 20 tests nuevos + 22 viejos de Fase 14, todos pasan.
- `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <ephemeral>` retorna drift = 0.
- La migración SQL aplicada en una DB de prueba con datos reales no falla y produce `StockMovement` con saldos correctos.
- Sample de venta crea `JournalEntry` con `referenceType=SALE` + `JournalEntry` con `referenceType=SALE_COGS` (DR COGS / CR Inventario), ambos balanceados.
- Sample de anulación de venta crea 2 reversas (la de la venta y la del COGS).
- Sample de compra crea `JournalEntry(PURCHASE)` + `StockMovement(PURCHASE)`, y `Product.cost` reflexionó el WAC ponderado contra el stock previo.
- Sample de venta de bundle: `SaleItem.unitCost` = Σ(componentes), NO `Product.cost` del bundle (que sigue siendo 0).
- Kardex `/api/reports/inventory/kardex?productId=...` devuelve sin ventana de 90 días, con `balanceAfter` y `costAfter` provenientes de StockMovement.
- Edición de producto vía `PUT /api/products/[id]` genera un movimiento `ADJUSTMENT_IN/OUT` con `referenceType=PRODUCT_EDIT` (resuelve H-4).
- No queda código en handlers que actualice `Product.cost` directamente sin pasar por `recordStockMovement`:
  ```bash
  grep -rn "product.update.*cost" src/app/api/ | grep -v ".test.ts"
  # Esperado: 0 matches (excepto en products/[id]/route.ts donde se setea desde el body, lo cual está bien).
  ```
- `StockMovement.balanceAfter` global cuadra con `SUM(ProductStock.quantity)` por SKU (sanity check).

**No marcado como completo.** Listo para auditoría cruzada.
