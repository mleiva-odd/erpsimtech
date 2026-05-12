# Phase 15 · Verification Report

Fecha: 2026-05-12
Verificador: subagente independiente (no participó en la implementación).
Alcance: validar la entrega de Fase 15 (Costeo Promedio Ponderado + `StockMovement` + asiento COGS) descrita en `docs/audits/phase-15-completion.md` contra el código en disco.

---

## Veredicto: APROBADO CON OBSERVACIONES

La fase está sustancialmente bien implementada. Las decisiones de diseño descritas en el completion están reflejadas con fidelidad en el código; los 13 call sites refactorizados realmente pasan por `recordStockMovement` / `logStockMovementInline`; el asiento COGS se emite dentro de la misma transacción y se reversa en CANCEL; el kardex se reescribió como una sola consulta sobre `StockMovement`. Hay observaciones reales pero ninguna bloquea el avance a Fase 16/17 si se documentan o se atacan en una mini-iteración.

---

## Resultados V1-V15

| # | Validación | Estado | Evidencia |
|---|---|---|---|
| V1 | `typecheck` / `lint` reportados verdes (no corridos en sandbox) | OBS | `docs/audits/phase-15-completion.md:121-137` declara 0 errors / 64 warnings idénticos a Fase 14. Sin red para validar localmente. |
| V2 | 4 archivos de test + assertions reales | OK | `src/lib/inventory/__tests__/{cost,bundle-cost,stock-movement,kardex}.test.ts` — 20 tests, ninguno con `expect(true).toBe(true)`. |
| V3 | Migración idempotente + RLS + backfill | OK | `prisma/migrations/20260513000000_stock_movement_and_wac/migration.sql`: `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object` (l. 22-34), `CREATE TABLE IF NOT EXISTS` (l. 40), `CREATE INDEX IF NOT EXISTS` (l. 65-70), `DROP POLICY IF EXISTS` + `CREATE POLICY` (l. 276-279), `NOT EXISTS` en el INSERT del backfill (l. 260-268). |
| V4 | Fórmula WAC y casos defensivos | OK | `src/lib/inventory/cost.ts:51-63`. Validado mentalmente: 10@5 + 10@10 → 7.5; 0,_+5@8 → 8; 5@10 + 0 → 10. Casos cubiertos en `cost.test.ts:5-58`. |
| V5 | `getCurrentCost` para bundles recursivo | OK | `src/lib/inventory/cost.ts:74-113`: recursión `for (bi of bundleItems) … total += getCurrentCost(...) * quantity`. Probado en `bundle-cost.test.ts:48-83` con bundle-de-bundle. |
| V6 | `recordStockMovement` actualiza ProductStock + persiste cost solo en entradas | OK | `cost.ts:278-353`: `isInbound` se evalúa con `INBOUND_TYPES` ∩ `qty > 0`. Cost se persiste sólo si `isInbound && costAfter !== costBefore` (l. 315). Variantes vs base discriminadas (l. 316-326). `balanceAfter = stockBefore + qty` (l. 330). |
| V7 | 13 call sites refactorizados | OK | Verificado por grep de `recordStockMovement|logStockMovementInline` en `src/app/api`. Todos los handlers listados en completion §1.3 importan el helper y lo invocan adentro del `$transaction`. |
| V8 | Asiento COGS al vender + skip si totalCost=0 + reversal en CANCEL | OK | `src/app/api/sales/route.ts:466-481` (skip si `totalCost <= 0`, dentro de `$transaction`). Reversa: `src/app/api/sales/[id]/route.ts:222-240` (`SALE_COGS` → `SALE_COGS_CANCEL`). |
| V9 | `SaleItem.unitCost` usa `getCurrentCost` (no `Product.cost` directo) | OK | `sales/route.ts:246-250`: `unitCostByItemIndex.push(await getCurrentCost(tx, …))`. Bundles devuelven Σ componentes. |
| V10 | Kardex sin ventana 90 días, lee `StockMovement`, balance precalculado | OK | `src/app/api/reports/inventory/kardex/route.ts:62-86`. Sin `subDays(90)`; `dateFilter.gte` opcional. `balance: Number(m.balanceAfter)` directo del modelo (l. 113). Filtros `productId` (obligatorio), `variantId`/`branchId`/`from`/`to` (opcionales). |
| V11 | Valuación con `Product.cost` (WAC) + bundles excluidos | OK | `valuation/route.ts:32-65`: filtro `product.isBundle: false` (l. 40). Suma `cost * quantity` por sucursal y categoría. |
| V12 | Backfill cronológico + advertencia documentada de aproximación | OBS | Migración l. 82-268: window function por `(companyId, productId, COALESCE(variantId,''))` calcula `balanceAfter` con `SUM OVER`. `costAfter` se aproxima como el `unitCost` del propio movimiento (l. 246-252) — documentado explícitamente en el SQL Y en `phase-15-completion.md §5 Riesgo #2`. |
| V13 | Concurrencia `updateMany … gte` preservada en ventas y traslados | OK | `sales/route.ts:351-359, 389-395` siguen usando `updateMany` con `quantity: { gte }` + `count !== 1` antes del `logStockMovementInline`. Mismo patrón en `stock-transfers/route.ts:149-156`. |
| V14 | Sin updates directos de `Product.cost` fuera del helper | OK con matiz | Únicos restos: `products/route.ts:225` y `products/[id]/route.ts:105` setean `Product.cost` desde el body del usuario (creación/edición manual del catálogo). Documentado como legítimo en completion §6.1. |
| V15 | Lint baseline 64 warnings sin nuevos | OBS | No verificable en sandbox; el implementador declara paridad con Fase 14. Helpers Phase 15 usan `eslint-disable @typescript-eslint/no-explicit-any` solo en `mock-tx.ts` (consistente con Fase 14). |

---

## Observaciones detalladas

### O-1 · MEDIA — Backfill no genera movimientos de componente para ventas históricas de bundles

`migration.sql:104-120` produce un movimiento `SALE` por cada `SaleItem`. Como `SaleItem.productId` es el ID del bundle (no de sus componentes), el backfill registra una salida contra el bundle, pero **no** registra las salidas contra los componentes, que es lo que físicamente decrementó stock en el legacy (`sales/route.ts:343-360` usa `bundleItem.componentId`).

Consecuencia: el kardex post-migración mostrará los componentes vendidos vía bundle como "ventas no registradas" — el `balanceAfter` que arme la window function por componente quedará desfasado del stock real.

**Severidad:** MEDIA. Sólo afecta empresas con historial significativo de ventas de combo. No corrompe contabilidad (eso es contabilidad nueva). Puede mitigarse con un script de re-emisión bundle-aware después de la migración (similar al `recompute-wac-history.ts` mencionado en completion §5 Riesgo #2).

**Recomendación:** documentar en release notes y, si hay clientes con ventas de bundle ≥ 5% del total, escribir un script complementario antes de aplicar la migración en producción.

### O-2 · MEDIA — `applyStockDelta` trunca cantidades fraccionadas

`src/lib/inventory/cost.ts:209, 224, 239, 254`: `Math.trunc(delta)` al actualizar/crear `ProductStock.quantity`. Es correcto porque `ProductStock.quantity` está declarado `Int` en `prisma/schema.prisma:235`. **PERO** la firma de `RecordStockMovementInput.quantity` es `number` (l. 131) y `StockMovement.quantity` es `Decimal(15,3)`. Si en una fase futura se permitiera vender 1.5 unidades de un producto vendido por peso, el movimiento se persistiría como 1.5 pero el stock físico se decrementaría sólo 1. Discrepancia silenciosa.

**Severidad:** MEDIA. Hoy todas las operaciones usan enteros (Zod en `sales/route.ts:14` valida `z.number().int().positive()`). Es un foot-gun latente para Fase 22 (productos por peso).

**Recomendación:** agregar un `assert Number.isInteger(input.quantity)` en `recordStockMovement` con un mensaje claro, o reemplazar `Math.trunc` por `Math.round` con un warning si difiere.

### O-3 · BAJA — `recordStockMovement` no usa `upsert` atómico al sumar delta en entradas

`applyStockDelta` (`cost.ts:188-260`) implementa el patrón `findUnique/findFirst → update | create`. Bajo concurrencia READ COMMITTED puede generar P2002 en la unique `(productId, branchId, variantId)`. El completion documenta esto explícitamente (§5 Riesgo #1) y lo limita a `purchases POST` (único caller que ejerce `recordStockMovement` con creación de fila). Los handlers en sales/transfers/etc. usan `logStockMovementInline` que es race-safe.

**Severidad:** BAJA. Apareció en discovery como H-8/H-9; el plan no lo cerró pero está documentado y los call sites más calientes (ventas) están protegidos.

**Recomendación:** convertir `applyStockDelta` a `productStock.upsert({where: {productId_branchId_variantId: …}, update: {quantity: {increment}}, create: {…}})` en una fase de hardening.

### O-4 · BAJA — `getTotalStock` para entradas inbound lee post-`applyStockDelta` cuando se calculan `balanceAfter` y se persiste cost

En `recordStockMovement`, el orden es:
1. `stockBefore = getTotalStock` (l. 289)
2. `costBefore = getPersistedCost` (l. 290)
3. Calcula `costAfter` con WAC sobre `stockBefore` (l. 297)
4. `applyStockDelta` (l. 306)
5. Persiste `costAfter` si cambió (l. 315)
6. `balanceAfter = stockBefore + input.quantity` (l. 330)

Está correcto. Pero nótese que `balanceAfter` NO se relee del DB post-delta; se calcula aritméticamente. Si por alguna razón otro proceso (impossible dentro de tx, pero ojo en MVCC entre transacciones) movió stock entre el `getTotalStock` y el delta, los números no coinciden. Dentro de una sola `$transaction` con READ COMMITTED, los lecturas son consistentes — pero la suposición es frágil.

**Severidad:** BAJA.

**Recomendación:** documentar la invariante en el comentario del helper, o releer `getTotalStock` después del delta.

### O-5 · BAJA — Backfill genera UUIDs con `gen_random_uuid()` que requiere `pgcrypto`

Migración l. 237. Si la extensión no está habilitada, falla. El proyecto sí usa `pgcrypto` desde fases previas (verificable con `prisma/migrations/*` de Fase 13/14), pero conviene documentarlo en el header de la migración como prerrequisito explícito.

**Severidad:** BAJA.

**Recomendación:** opcional `CREATE EXTENSION IF NOT EXISTS pgcrypto;` al inicio.

### O-6 · BAJA — `applyStockDelta` para producto sin variante usa `findFirst` con tres campos donde existe unique

`cost.ts:232-235`: `findFirst({ where: { productId, variantId: null, branchId } })`. Hay unique `@@unique([productId, branchId, variantId])` (`schema.prisma:243`). Funciona, pero `findFirst` con esos criterios incluye filtros más laxos. No es bug — pero `findFirst` no garantiza orden definido en empates si por alguna razón hubieran dos filas (que estarían en violación del unique). Tópico cosmético.

**Severidad:** BAJA.

### O-7 · BAJA — `recordStockMovement` no valida `companyId` contra el producto

`cost.ts:278-353` recibe `companyId` por input y lo usa al insertar el movimiento y al actualizar `Product.cost` (l. 322-326). No valida que el `productId` recibido pertenezca a esa `companyId`. Como todos los callers ya filtraron `companyId` antes de invocar el helper (vía Zod + tenant), el agujero es teórico. Pero es un riesgo de cross-tenant si futuros callers olvidaran filtrar.

**Severidad:** BAJA.

**Recomendación:** agregar un `findFirst` defensivo al inicio del helper que valide ownership.

### O-8 · INFORMATIVA — Mock-tx `productStock.findMany` no respeta filtro `companyId` (no aplica)

`mock-tx.ts:139-154` filtra por `productId`/`variantId`/`branchId` pero no `companyId`. Como `getTotalStock` no pasa `companyId`, no hay problema — sólo notar que el mock es lo suficientemente fiel.

### O-9 · INFORMATIVA — `productStock.update` con select pero el mock lo soporta

`mock-tx.ts:174-187` ya maneja `select` opcional. OK.

---

## Cross-checks adicionales

| Chequeo | Resultado |
|---|---|
| Modelo Prisma `StockMovement` declara las 5 relaciones inversas en `Company`, `Product`, `ProductVariant`, `Branch`, `User`. | OK — `schema.prisma:48, 77, 113, 199, 225`. |
| Enum `StockMovementType` tiene los 9 valores prometidos. | OK — `schema.prisma:1187-1197`. |
| Migración SQL coincide con el modelo Prisma (mismos campos, mismas FK actions). | OK — `migration.sql:40-63` ↔ `schema.prisma:1158-1185`. |
| RLS habilitada con `tenant_isolation_stock_movement` siguiendo el patrón de Fase 13/14. | OK — `migration.sql:274-279`. |
| Asiento COGS usa `ACCOUNTS.COGS` y `ACCOUNTS.INVENTORY` correctos. | OK — `src/lib/accounting/accounts.ts:20,44` (`1.2.01` y `5.1.01`). |
| Anulación de venta busca `referenceType: 'SALE_COGS'` con el mismo string que el insert usa. | OK — `sales/route.ts:473` ↔ `sales/[id]/route.ts:226`. |
| Bundles en venta loguean cada componente, no el bundle (consistente con stock físico). | OK — `sales/route.ts:348-384` itera `product.bundleItems` y emite `logStockMovementInline` por componente. |
| `recordStockMovement` y `logStockMovementInline` rechazan `quantity === 0`. | OK — `cost.ts:282-286, 374-379`. |
| Tests usan `tx as never` para esquivar el tipo `Prisma.TransactionClient` cuando se pasa el mock. | OK, consistente con Fase 14. |
| Backfill maneja `StockTransfer` en PENDING como TRANSFER_OUT y solo COMPLETED para TRANSFER_IN. | OK — `migration.sql:164,185`. Decisión correcta (PENDING ya decrementó el origen). |

---

## Conclusión

**APROBADO CON OBSERVACIONES — listo para Fase 16/17.**

La implementación cumple el contrato del plan: hay un helper centralizado, los 13 puntos de stock pasan por él, el kardex se redujo a una sola query, el asiento COGS se emite y se reversa con `referenceType='SALE_COGS'`, los bundles se costean por suma recursiva de componentes, y la migración es idempotente con RLS aplicada.

Las observaciones encontradas:

- **O-1** (backfill no expande bundles históricos) y **O-2** (`Math.trunc` de cantidades fraccionadas) son las más relevantes y conviene atacarlas antes de cualquier feature de "venta por peso" o de mostrar el kardex histórico a clientes con muchas ventas de combo.
- **O-3** a **O-7** son endurecimiento defensivo, no bloquean.
- **V1/V12/V15** quedaron como OBS por imposibilidad de correr typecheck/lint/migración en el sandbox del verificador; deben validarse en el entorno del dueño post-`prisma generate`.

**Acciones recomendadas antes de cerrar:**

1. Que el dueño corra `npm install && npx prisma generate && npx vitest run` y confirme 20/20 pasos verde + 0 lint errors.
2. Aplicar la migración en una BD de staging con datos reales y correr la query de reconciliación de `phase-15-completion.md §3.3` para detectar discrepancias de bundles (O-1) antes de prod.
3. Decidir si se requiere un script `recompute-wac-history.ts` o un patch al backfill para bundles antes de mostrar el kardex histórico a usuarios finales.

No hay bugs críticos. Se puede avanzar a Fase 16 (IVA y cálculo real de `Sale.tax`) o Fase 17 con confianza, dejando las observaciones como tickets de hardening menores.
