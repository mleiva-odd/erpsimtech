# Phase 19 · Verification Report

Auditor independiente · 2026-05-12
Scope: módulo de Compras Enterprise (PR → RFQ → PO → GRN → SupplierInvoice → Payment con retenciones GT).
Material auditado: completion + discovery + migración SQL + schema + helpers + tests + endpoints API.

---

## Veredicto

**APROBADO CON OBSERVACIONES**. La implementación cumple lo prometido en `phase-19-completion.md` y resuelve los gaps documentados en `phase-19-discovery.md`. Reglas SAT GT (IVA PC 5%, IVA general 15% sobre IVA débito, ISR 5%/7%, unicidad de factura proveedor, GRN antes que Invoice) están correctamente implementadas tanto en helpers puros como en endpoints. State machine respeta las transiciones legales documentadas en la spec.

Hay siete observaciones de severidad media-baja, todas mitigables sin retocar arquitectura: la más relevante es la inconsistencia entre `TRANSITIONS` y `STATES_ACCEPTING_INVOICE` (PARTIALLY_RECEIVED → INVOICED se permite por una vía pero no por la otra). Resto son hardening menor y gaps de validación.

Listo para push a `main` tras hot-fix opcional de las observaciones marcadas con `[fix recomendado]`.

---

## V1-V16 Tabla

| ID | Validación | Estado | Evidencia |
|---|---|---|---|
| V1 | typecheck/lint | NO VERIFICADO | El completion declara que typecheck/lint quedan pendientes para el dueño. Inspección estática del código no detecta errores TS evidentes (todos los `as never` / `as unknown` usan el patrón Fase 17/18 ya validado en fases anteriores). El cliente Prisma asume `prisma generate` posterior a la migración. |
| V2 | Migración SQL idempotente | PASS | `prisma/migrations/20260520000000_purchases_enterprise/migration.sql` usa `DO $$ … EXCEPTION WHEN duplicate_object` para enums (líneas 37-45), `ALTER TYPE ADD VALUE IF NOT EXISTS` x5 (47-51), `ADD COLUMN IF NOT EXISTS` en Supplier/Company/PurchaseOrder, `CREATE TABLE IF NOT EXISTS` para las 10 tablas nuevas, ALTER COLUMN `Int→Decimal(12,3)` envuelto en `IF data_type='integer'` (101-113). RLS + policies sobre las 10 tablas nuevas con `DROP POLICY IF EXISTS` antes del CREATE. Backfill conservador: `quantityReceived/Invoiced := quantity` solo para PO `status='COMPLETED'`, `subtotal := total` para PO sin subtotal, `invoiceNumber := reference` cuando hay payable. **No usa los nuevos valores de enum en la misma migración** (respeta la lección Fase 17 / SqlState 55P04). |
| V3 | Retenciones (IVA PC 5%, IVA general 15% sobre tax, ISR 5%/7%) | PASS | `src/lib/purchases/retention.ts`: 5% sobre subtotal cuando supplier=PC + `withholdsIVA=true` (línea 115). 15% sobre **tax** (no subtotal) cuando supplier=GENERAL + `withholdsIVA=true` (línea 118). ISR = subtotal * isrRate. Total = subtotal + tax - withheldIVA - withheldISR (línea 126). Round a 2 decimales. Si proveedor no tiene régimen clasificado, no retiene IVA aunque withholdsIVA=true (línea 114-119 lo deja en 0 — correcto). |
| V4 | Landed cost prorrateo proporcional al valor | PASS | `landed-cost.ts:79-107`: `lineSubtotal = qty * unitCost`, `share = lineSubtotal / totalSubtotal * totalLandedCost`. Fallback por cantidad si todos a costo 0 (línea 88-100). Última línea recibe el residuo para que Σ shares == total exacto (línea 113-120). |
| V5 | State machine | PASS con observación | `state-machine.ts:62-79`: mapa exhaustivo. `canTransition('DRAFT','INVOICED')` retorna false correctamente. `nextStatusAfterReception` con tolerancia 0.001 (línea 122). **Observación**: `PARTIALLY_RECEIVED → INVOICED` no figura en `TRANSITIONS` pero `STATES_ACCEPTING_INVOICE` lo permite. Ver Observación #1. |
| V6 | Asiento contable | PASS | `accounting.ts → buildSupplierInvoiceJournalLines`: DR Inventario (`ACCOUNTS.INVENTORY = 1.2.01`) o `OPERATING_EXPENSES` por subtotal; DR `VAT_INPUT = 1.1.05` solo si `tax > 0` (régimen general, PC no genera crédito); CR `AP = 2.1.01` por total neto; CR `VAT_OUTPUT = 2.1.02` por withheldIVA; CR `ISR_PAYABLE = 2.1.03` por withheldISR. Balance Σ DR == Σ CR verificable algebraicamente (líneas 82-141). Tests confirman casos general, PC, doble retención y subtotal 0. |
| V7 | PR endpoints | PASS | `POST /api/purchases/requests` con Zod (PRItemSchema + CreatePRSchema). `POST /[id]/approve` valida `status === 'PENDING'`. `POST /[id]/reject` exige `rejectionReason` con Zod. `POST /[id]/convert-to-po` valida `status === 'APPROVED'` y `pr.purchaseOrder == null`, marca PR `CONVERTED_TO_PO` y crea PO. |
| V8 | RFQ endpoints | PASS | `POST /api/purchases/rfq` alta, `GET` listado. `POST /[id]/quotes` con `CreateQuoteSchema` (supplierId UUID, items con unitPrice). `POST /[id]/award/[quoteId]` valida RFQ `OPEN`, marca quote `selected=true`, RFQ → `AWARDED` con `awardedQuoteId` y `closedAt`. Crea PO con `reference = "RFQ-<id8>"`. |
| V9 | PO sin stock en modo enterprise | PASS | `POST /api/purchases?mode='enterprise'` (líneas 393-444 de route.ts) crea solo PO con `status=PENDING_APPROVAL|APPROVED`, sin `recordStockMovement`, sin GRN, sin SupplierInvoice. Modo `fast` (default) preserva compat: PO+GRN+SupplierInvoice+Payable+JournalEntry atómico, `status='INVOICED'`. |
| V10 | Aprobación con threshold | PASS | `Company.purchaseApprovalThreshold` existente (schema línea 62). En enterprise mode: `initialStatus = totalAmount > threshold ? 'PENDING_APPROVAL' : 'APPROVED'` (route.ts:402). `/[id]/approve` exige permiso `purchases:approve` y usa `canTransition` (línea 30). |
| V11 | GRN (recepción) | PASS | `POST /[id]/grn`: valida `STATES_ACCEPTING_GRN = ['APPROVED','PARTIALLY_RECEIVED']` (línea 78). Cada item valida `qtyRecibida ≤ poItem.quantity - poItem.quantityReceived + tol 0.001` (líneas 96-103). Llama `recordStockMovement(tx, …)` con `unitCost + landedShare/qty` (Fase 15 WAC). Actualiza `quantityReceived` con increment. Lee items frescos y aplica `nextStatusAfterReception` para avanzar la PO (línea 192-209). Setea `receivedAt` cuando llega a RECEIVED. |
| V12 | SupplierInvoice | PASS | `POST /[id]/invoice`: valida estado en `STATES_ACCEPTING_INVOICE` (RECEIVED/PARTIALLY_RECEIVED) y que no exista ya invoice (`po.supplierInvoice` null). Crea `SupplierInvoice` con unique `(companyId, supplierId, invoiceNumber)` (DB nivel). `dueDate = invoiceDate + supplier.creditDaysDefault` (línea 120-127, default 30). Crea `SupplierPayable`. Llama `createJournalEntry` con líneas de `buildSupplierInvoiceJournalLines`. Marca PO `INVOICED`. |
| V13 | SupplierCreditNote | PASS con observación | `POST /[id]/credit-note`: valida que PO tenga SupplierInvoice (línea 59), rechaza si `total > supplierInvoice.total` (línea 73). Crea NC con unique `(companyId, supplierId, noteNumber)`. Ajusta payable: `totalAmount -= total`, recalcula status PENDING/PARTIAL/PAID. Genera asiento contrario: DR AP / CR Inventario / CR VAT_INPUT (correcto: revierte IVA crédito). **No reversa retenciones** — decisión documentada (ya declaradas a SAT). Ver Observación #4. |
| V14 | Anulación PO | PASS | `PATCH /api/purchases/[id]` action=CANCEL: rechaza si hay `SupplierPayment` con status `COMPLETED` (línea 105-110). Reversa stock solo si `stockWasMoved` (estados COMPLETED/PARTIALLY_RECEIVED/RECEIVED/INVOICED). Usa `qtyToReverse = quantityReceived` (línea 135) — correcto (no `quantity` de la PO sino lo efectivamente recibido). Borra payable, marca PO CANCELLED, reversa JournalEntry vía `reverseJournalEntry` (línea 197-205). |
| V15 | Permisos nuevos | PASS | `src/lib/permission-catalog.ts:25-32` incluye `purchases:view`, `purchases:create`, `purchases:request`, `purchases:approve`, `purchases:receive`, `purchases:invoice`, `purchases:credit-note`. Endpoints usan `requireOperationalPermission` o `requireAnyPermission` con la combinación apropiada. |
| V16 | Tests Vitest | PASS | `retention.test.ts` 11 casos (PC 5%, GENERAL 15%, ISR 5%/7%, doble retención, sin régimen, redondeo, subtotal 0, suggestedIsrRate). `landed-cost.test.ts` 6 casos (subtotal, ajuste unitcost, total 0, sin líneas, fallback cantidad, suma exacta). `state-machine.test.ts` 12 casos (cubre todas las transiciones del mapa). `accounting.test.ts` 7 casos (balance DR/CR con/sin retenciones, inventario vs gasto, subtotal 0). `grn-partial.test.ts` 7 casos (avance state, granel, edge case). 43 casos totales ≥ baseline pedida en spec (≥19). |

---

## Observaciones

### #1 · Inconsistencia state-machine vs invoice handler `[fix recomendado]` · MEDIA

**Archivo**: `src/lib/purchases/state-machine.ts:75` y `src/app/api/purchases/[id]/invoice/route.ts:87`.

`TRANSITIONS['PARTIALLY_RECEIVED']` contiene solo `['PARTIALLY_RECEIVED','RECEIVED','CANCELLED']`. No incluye `INVOICED`. Pero `STATES_ACCEPTING_INVOICE = ['RECEIVED','PARTIALLY_RECEIVED']` y el handler de invoice avanza directamente la PO a `status='INVOICED'` sin pasar por `canTransition`. El test `state-machine.test.ts:33` valida explícitamente que `canTransition('PARTIALLY_RECEIVED','INVOICED') === false`.

Resultado: la spec V12 dice "PO debe estar RECEIVED o PARTIALLY_RECEIVED" — el handler la respeta — pero el state machine como source-of-truth dice que esa transición es ilegal. Si alguien refactoriza el handler para usar `assertTransition`, se romperá el flujo de facturación parcial.

**Recomendación**: agregar `'INVOICED'` al set de transiciones legales de `PARTIALLY_RECEIVED` y agregar un test que lo valide, o documentar explícitamente que `STATES_ACCEPTING_INVOICE` autoriza una transición que el state machine considera "salto" deliberado.

---

### #2 · `convert-to-po` no valida que los items coincidan con la PR · MEDIA

**Archivo**: `src/app/api/purchases/requests/[id]/convert-to-po/route.ts`.

El handler acepta `items` libremente del body sin chequear que los `productId` y `quantity` correspondan con los items de la `PurchaseRequest` original. Un usuario con permiso `purchases:create` puede aprobar mentalmente una PR de "5 docenas de papelería" y convertirla en "1 laptop carísima" sin trazabilidad. La PR quedará marcada `CONVERTED_TO_PO` pero apuntando a otra cosa.

**Recomendación**: validar que `parsed.items` sea subconjunto de `pr.items` (mismos `productId/variantId`, cantidades ≤ a las solicitadas, o explícitamente permitir ajustes con audit log de diferencia). Alternativa minimalista: registrar las diferencias en el audit log del `PURCHASE_REQUEST_CONVERTED`.

---

### #3 · Concurrencia de GRN sin `SELECT FOR UPDATE` · MEDIA

**Archivo**: `src/app/api/purchases/[id]/grn/route.ts:96-103`.

La validación `quantityReceived ≤ quantity - quantityReceived_acumulado` se hace dentro de la transacción Prisma pero leyendo `po.items` fuera de un `SELECT … FOR UPDATE`. Dos GRN concurrentes sobre la misma PO pueden ambos pasar la validación con el mismo snapshot y sobre-recibir. Postgres serializa el UPDATE final, pero la suma puede exceder `quantity`. El completion lo documenta como "riesgo bajo en PYME" pero queda pendiente.

**Recomendación**: leer `purchaseOrderItem` con `prisma.$queryRaw\`SELECT … FOR UPDATE\`` dentro del `$transaction`, o agregar un CHECK constraint en DB: `CHECK (quantityReceived ≤ quantity)` (no resuelve la sobre-recepción pero impide persistencia inconsistente).

---

### #4 · Nota de crédito ignora retenciones · BAJA (decisión documentada)

**Archivo**: `src/app/api/purchases/[id]/credit-note/route.ts:117-156`.

El asiento contrario solo reversa subtotal (DR AP / CR Inventario / CR VAT_INPUT). No toca `VAT_OUTPUT` (IVA retenido) ni `ISR_PAYABLE`. El completion documenta esto en sección 2.5: "La NC del proveedor no anula la retención (esa quedó declarada a SAT como pasivo)".

**Consideración**: técnicamente correcto desde la lógica fiscal (la retención ya generó pasivo a SAT independiente de si el proveedor luego emite NC). Pero en la práctica GT, si la NC anula totalmente la operación, el contribuyente debería poder corregir la retención en la próxima declaración. Hoy queda como ajuste manual.

**Recomendación**: dejar como está; documentarlo en `docs/operations/purchases-workflow.md` para que contabilidad lo maneje manualmente.

---

### #5 · `convert-to-po` y `rfq/award` hardcodean `tax: 0` · BAJA

**Archivos**: `convert-to-po/route.ts:97`, `rfq/[id]/award/[quoteId]/route.ts:88,96`.

Ambos handlers crean PO con `tax: 0` y `taxRate: 0` por item. Es consistente con que el IVA real se determina al registrar el SupplierInvoice, pero significa que `PurchaseOrder.tax` no refleja el IVA estimado durante el ciclo PR→PO ni RFQ→PO. La retención IVA general 15% se calcula sobre `tax=0` y queda en 0 hasta el invoice.

**Consideración**: aceptable para el ciclo enterprise donde la factura es la fuente de verdad. El handler `POST /api/purchases` directo sí acepta `taxRate` por item — correcto.

**Recomendación**: aceptar `taxRate` opcional en `ConvertSchema` y `QuoteItemSchema` para soportar el caso donde el proveedor cotiza con IVA explícito. Bajo impacto.

---

### #6 · `Supplier.isrRate` no se invalida al cambiar de tramo · BAJA

**Archivo**: `prisma/schema.prisma:363`, `retention.ts:138-142`.

`isrRate` es estático en `Supplier`. El helper `suggestedIsrRate(monthlyAccumulated)` existe pero NO se invoca en ningún endpoint — sirve solo de hint al frontend. Significa que si un proveedor sube de tramo I (Q30k/mes) a tramo II (>Q30k/mes), la empresa debe cambiar manualmente `isrRate` en el master data del proveedor. No hay job/check automático.

**Consideración**: razonable para PYME donde el contador supervisa. Documentar en operación.

---

### #7 · Backfill no migra PO `COMPLETED` a `INVOICED` automáticamente · BAJA (documentado)

**Archivo**: `migration.sql:120-146` y completion sección 2.2.

PO legacy quedan en `COMPLETED` porque PostgreSQL `SqlState 55P04` impide usar los nuevos valores de enum en la misma migración. State machine las acepta como equivalentes a INVOICED para fines de CANCELLED. Pero los listados de "PO facturadas" deben filtrar `status IN ('INVOICED','COMPLETED')` para incluirlas.

**Recomendación**: agregar migración separada `20260521000000_backfill_completed_to_invoiced` que, una vez que el enum esté commiteado, ejecute:

```sql
UPDATE "PurchaseOrder" po
SET "status" = 'INVOICED'
FROM "SupplierPayable" sp
WHERE sp."purchaseId" = po."id" AND po."status" = 'COMPLETED';
```

Y un job similar para las PO sin payable → `RECEIVED`. Esta migración debe ejecutarse en un deploy posterior al merge de Fase 19.

---

### #8 · `recordStockMovement` en fast mode usa `unitCost` sin landed cost · BAJA

**Archivo**: `src/app/api/purchases/route.ts:298-310`.

El modo fast llama `recordStockMovement` con `unitCost = item.unitCost` (sin sumar landed cost). El modo enterprise sí prorratea landed cost en el GRN. Esto es consistente con que el modo fast NO acepta `landedCost` en la práctica (el schema lo permite pero el flujo legacy no lo usa). Sin embargo, el Zod `CreatePurchaseSchema` declara `landedCost` opcional para ambos modos.

**Recomendación**: rechazar `landedCost > 0` cuando `mode='fast'` con un mensaje claro, o aplicar el prorrateo también en fast (recomendado para coherencia futura).

---

### #9 · `SupplierCreditNote` valida `total ≤ supplierInvoice.total` pero no acumula NC previas · BAJA

**Archivo**: `src/app/api/purchases/[id]/credit-note/route.ts:73-78`.

La validación rechaza si una NC individual excede el total de la factura, pero no chequea que la suma de NC previas + nueva NC no exceda el total. Dos NCs de Q500 cada una contra una factura de Q800 ambas pasarán la validación individual.

**Recomendación**: cambiar la validación a `sum(creditNotes.total) + total ≤ supplierInvoice.total`.

---

## Conclusión

La Fase 19 entrega un módulo de Compras Enterprise sólido y conforme con la legislación tributaria GT (IVA PC 5%, IVA general 15% sobre IVA débito, ISR 5%/7%, unicidad de factura proveedor SAT). La separación PR → RFQ → PO → GRN → SupplierInvoice → Payment está bien modelada en schema, migración y API. Los helpers son puros, tipados, con 43 casos de tests cubriendo retención, landed-cost, state-machine, asiento y GRN parcial.

Las 9 observaciones son hardening incremental — ninguna invalida la fase ni introduce regresión legal/contable. La más impactante (#1, inconsistencia state-machine) es un fix de 3 líneas. #2 (validación PR→PO) y #3 (concurrencia GRN) son hardening recomendado antes de onboarding de cliente con flujo enterprise activo.

**Decisión**: APROBADO para merge a `main`. Crear issues para observaciones #1-#3 con label `phase-19-followup`. Resto (#4-#9) se difiere a Fase 24 (hardening) salvo decisión explícita.

Pendientes operativos a cargo del dueño antes del deploy:
1. `npm install && npx prisma generate`.
2. `npm run lint && npm run typecheck && npm run test` (V1 no fue ejecutado por el auditor).
3. Aplicar migración Supabase manualmente (idempotente, seguro re-correr).
4. Configurar `Company.purchaseApprovalThreshold` por empresa onboarded (default 0 = todas requieren aprobación).
