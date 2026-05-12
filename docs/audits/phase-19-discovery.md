# Fase 19 · Discovery: Compras enterprise (PR → RFQ → PO → GRN → Invoice + retenciones)

Fecha: 2026-05-11
Especialista: purchasing / procurement
Modo: read-only. Esta nota documenta el estado actual del módulo de
compras del ERP SIMTECH antes de planear el refactor completo de
Fase 19.

## TL;DR

- El módulo de compras de SIMTECH **no es una orden de compra**: es un
  formulario de **recepción de inventario** que en un solo `POST`
  hace simultáneamente la PO, la GRN, el alta del payable y el asiento
  contable de gasto. No hay separación PR → RFQ → PO → GRN → Invoice.
- Estado actual del `enum PurchaseStatus`: solo `DRAFT`,
  `COMPLETED` (default), `CANCELLED`. El estado `DRAFT` está declarado
  pero **no se usa en ningún handler** (`grep` sobre `'DRAFT'` en
  `src/app/api/purchases/**` da cero hits; toda PO se crea con
  `status: 'COMPLETED'`).
- **Stock se incrementa al crear la PO**, no al recibirla. Esto rompe
  la regla básica de procurement enterprise (PO comprometida ≠ stock
  físico).
- No existe modelo `GoodsReceivedNote`, ni `SupplierInvoice`, ni
  `RFQRequest`, ni `SupplierCreditNote`, ni concepto de retención, ni
  workflow de aprobación, ni landed cost. Confirmado con `grep -ri`
  sobre el repo: las únicas menciones a "GRN", "RFQ", "retención",
  "landed cost" están en docs/plan, **no en código**.
- `PurchaseOrderItem.quantity` es `Int`. No soporta kg/litros como
  exige el plan.
- `PurchaseOrder.reference` es `String?` **sin unique constraint**.
  Un usuario puede registrar la misma factura proveedor varias veces.
- El costo de producto se sobrescribe con el **último costo de compra**
  (`Product.cost = item.unitCost`), no con promedio ponderado. La
  Fase 15 ya tiene en su scope corregir esto, pero el handler de
  compras actual lo hará obsoleto y deberá adaptarse a la lógica de
  Fase 19 (recalcular solo al hacer GRN).

## Inventario de artefactos relevantes

### Modelos en `prisma/schema.prisma`

| Modelo | Líneas | Observación |
|---|---|---|
| `Supplier` | 273-292 | OK como master data. Falta: `taxRegime` (PEQUEÑO_CONTRIBUYENTE/GENERAL), `withholdsIVA`/`withholdsISR`, `creditDaysDefault`. |
| `PurchaseOrder` | 294-311 | `total: Decimal(10,2)`, `status: PurchaseStatus @default(COMPLETED)`, `reference: String?` sin unique. No tiene `subtotal`, `tax`, `withheldIVA`, `withheldISR`, `landedCost`, `approvedById`, `approvedAt`, `receivedAt`, `invoiceNumber`, `taxRegime`. |
| `PurchaseOrderItem` | 313-324 | `quantity: Int`. No tiene `quantityReceived` ni `quantityInvoiced` ni `taxRate`. |
| `SupplierPayable` | 781-803 | Modelo bueno pero acoplado 1:1 a `PurchaseOrder` (`purchaseId String? @unique`). Si se separa `SupplierInvoice`, este `@unique` se rompe. |
| `SupplierPayment` | 806-821 | OK. |
| `enum PurchaseStatus` | 633-637 | Solo `DRAFT / COMPLETED / CANCELLED`. **No hay** `REQUESTED / ORDERED / PARTIALLY_RECEIVED / RECEIVED / INVOICED`. |

### Endpoints REST

| Endpoint | Archivo | Líneas |
|---|---|---|
| `GET /api/purchases` (listado) | `src/app/api/purchases/route.ts` | 23-44 |
| `POST /api/purchases` (alta + recepción + payable + asiento, todo en uno) | `src/app/api/purchases/route.ts` | 46-221 |
| `GET /api/purchases/[id]` | `src/app/api/purchases/[id]/route.ts` | 13-50 |
| `PATCH /api/purchases/[id]` (anular) | `src/app/api/purchases/[id]/route.ts` | 68-175 |
| `GET /api/suppliers` | `src/app/api/suppliers/route.ts` | 6-16 |
| `POST /api/suppliers` | `src/app/api/suppliers/route.ts` | 18-44 |
| `PUT /api/suppliers/[id]` | `src/app/api/suppliers/[id]/route.ts` | 17-53 |
| `DELETE /api/suppliers/[id]` (soft) | `src/app/api/suppliers/[id]/route.ts` | 55-83 |
| `GET /api/accounting/payables` | `src/app/api/accounting/payables/route.ts` | 5-55 |
| `POST /api/accounting/payables` | `src/app/api/accounting/payables/route.ts` | 57-87 |
| `POST /api/accounting/payables/[id]/payments` | `src/app/api/accounting/payables/[id]/payments/route.ts` | 6-111 |
| `POST /api/accounting/payables/payments/[paymentId]/reverse` | `…/reverse/route.ts` | 5-78 |

### UI

- `src/app/(dashboard)/purchases/page.tsx` — solo dos vistas: lista
  (history) y formulario nuevo. Maneja un carrito local en estado y
  hace un `POST /api/purchases` único. No hay UI para aprobar, ni para
  recibir parcial, ni para facturar después, ni para ver retenciones.

## Auditoría por requisito de Fase 19

### 1. Estados actuales de PO

`enum PurchaseStatus` declara `DRAFT / COMPLETED / CANCELLED`.

- El default del campo es `COMPLETED` (línea 302 del schema).
- `DRAFT` no se usa nunca: en `POST /api/purchases` el código persiste
  literal `status: 'COMPLETED'` (`src/app/api/purchases/route.ts:129`).
- `PATCH` solo permite la transición `COMPLETED → CANCELLED`. No hay
  estado intermedio.

**Gap vs Fase 19:** faltan `REQUESTED`, `ORDERED`,
`PARTIALLY_RECEIVED`, `RECEIVED`, `INVOICED`. La migración deberá
preservar las PO históricas con `COMPLETED` → equivalente a `RECEIVED`
o `INVOICED` según haya factura o no.

### 2. ¿El stock se incrementa al crear la PO o al recibir?

**Al crear.** El handler `POST /api/purchases` hace todo en un solo
`$transaction`:

1. Crea `PurchaseOrder` con status COMPLETED.
2. Incrementa `productStock.quantity` por cada ítem (líneas 137-165
   de `src/app/api/purchases/route.ts`).
3. Sobrescribe `Product.cost` con `item.unitCost` (último costo, no
   promedio ponderado) (líneas 167-181).
4. Crea `SupplierPayable` con `dueDate = now + 30 días` hardcoded.

No existe modelo `GoodsReceivedNote`. El paso 2 cumple "físicamente"
el rol de GRN pero se ejecuta sí o sí en el alta. No se puede crear
una PO sin que el stock se mueva.

**Gap vs Fase 19:** stock debe moverse **solo al GRN**, no al alta de
la PO. Se requiere:
- Crear modelo `GoodsReceivedNote` + `GoodsReceivedNoteItem` con
  `quantityReceived` por ítem.
- `POST /api/purchases` queda como creación de orden (sin movimiento
  de stock).
- Nuevo `POST /api/purchases/[id]/grn` recibe parcial o total.

### 3. Anulación de PO

`PATCH /api/purchases/[id]` con `{ action: 'CANCEL' }`:

- Solo permite anular si `status === 'COMPLETED'`.
- Rechaza si existe algún `SupplierPayment` con `status: 'COMPLETED'`
  asociado al payable de la PO (línea 104-109).
- Reversa stock con un `updateMany` defensivo que solo decrementa si
  `quantity >= item.quantity` (línea 116-124). Aborta con HTTP 409 si
  generaría stock negativo. **Correcto.**
- Elimina el `SupplierPayable` con `tx.supplierPayable.delete` (línea
  137). **OK porque ya validó que no haya pagos.** Pero borra duro,
  no marca VOID — pierde la traza del payable original.
- Crea un asiento contable **INCOME** "Reversa de Compras"
  (línea 149-159). Esto es lo que la Fase 14 quiere eliminar: en lugar
  de generar un INCOME paralelo, debería generar el asiento doble
  contrario (CR Inventario / DR Cuentas por Pagar) con las cuentas
  reales del plan contable.
- Registra audit log `PURCHASE_CANCELLED` (línea 162-169).

**Gap vs Fase 19:**
- La anulación debe propagarse a GRN, SupplierInvoice, retenciones y
  StockMovement (Fase 15) cuando esos modelos existan.
- No se puede anular una compra parcialmente recibida o ya facturada;
  faltan reglas por estado.

### 4. `PurchaseOrderItem.quantity` — `Int` o `Decimal`

**`Int`** (`prisma/schema.prisma:317`). El handler `POST` también lo
trata como entero (`Number(item.quantity)` sin decimales).

**Gap vs Fase 19:** migrar a `Decimal(12,3)` para soportar kg, libras,
litros, galones. La Fase 11/24 ya marcó este punto como bug silencioso
pendiente. Confirmado: sigue siendo `Int`.

### 5. `PurchaseOrder.reference` unique

`reference String?` **sin** `@unique`. No hay constraint compuesto
`(companyId, supplierId, reference)`. Se puede registrar dos veces la
misma factura proveedor "F-123" del mismo proveedor sin que la DB lo
bloquee. El handler tampoco verifica duplicado a nivel aplicación.

**Gap vs Fase 19:** agregar índice único parcial
`(companyId, supplierId, reference) WHERE reference IS NOT NULL`. La
Fase 11 ya menciona este punto como "PurchaseOrder.reference unique
opcional"; sigue sin implementarse.

### 6. Retenciones (IVA pequeño contribuyente 5%, ISR 5-7%)

**No existen.** `grep -ri "retenc\|withhold"` en `src/` arroja cero
hits. No hay:

- Campos en `Supplier` para clasificar régimen tributario.
- Campos en `PurchaseOrder` para guardar IVA o ISR retenido.
- Asiento contable de retención (DR IVA por pagar / CR Caja).
- Reporte de retenciones para SAT.

**Gap vs Fase 19:** implementación completa desde cero. Depende además
de Fase 16 (plan de cuentas con IVA crédito / IVA débito / ISR
retenido por pagar) y Fase 14 (asientos dobles).

### 7. GRN / SupplierInvoice / SupplierCreditNote / RFQ

Ninguno existe.

```
grep -ri "GoodsReceivedNote\|SupplierInvoice\|SupplierCreditNote\|RFQ"
  prisma/ src/ -> sin resultados (excepto docs/audits/*.md)
```

**Gap vs Fase 19:** crear 4 modelos nuevos + endpoints + UI.

- `GoodsReceivedNote` (cabecera) + `GoodsReceivedNoteItem` (detalle
  con `quantityReceived`).
- `SupplierInvoice` (cabecera, `purchaseOrderId` opcional, número de
  factura del proveedor) + `SupplierInvoiceItem`.
- `SupplierCreditNote` (devolución a proveedor, reversa parcial de
  GRN + ajuste de payable).
- `RFQRequest` + `RFQQuote` (cotizaciones por proveedor).

### 8. Costo promedio al recibir

**No se calcula.** El handler actual hace
`tx.product.update({ data: { cost: item.unitCost } })` — sobrescribe
con el último costo. No lee stock anterior, no calcula
`(stockOld*costOld + qty*cost) / (stockOld+qty)`.

La Fase 15 (Costeo promedio ponderado + StockMovement) ya tiene esto
en su scope; Fase 19 debe **anclar** ese cálculo al momento del GRN,
no al momento del alta. **El refactor debe coordinarse con Fase 15:**
si Fase 15 entra primero, su lógica de promedio quedará viviendo en
el handler de purchases y se moverá al de GRN cuando entre Fase 19.

### 9. Aprobación por monto

**No hay workflow.** `requireOperationalPermission(['purchases:create',
'settings:manage'])` es el único gate. Quien puede crear, crea sin
límite. No hay:

- Estado `REQUESTED` / `APPROVED`.
- Campo `approvalThreshold` en `Company` o `CompanySettings`.
- Tabla `PurchaseApproval` con `approverId`, `approvedAt`, `reason`.
- Endpoint `POST /api/purchases/[id]/approve`.

**Gap vs Fase 19:** implementación completa. Decisiones de diseño que
deja abiertas el plan:
- ¿Umbral por sucursal o por empresa?
- ¿Multi-nivel (manager < Q5K, gerencia < Q25K, dueño > Q25K)?
- ¿Auto-aprobado para `DRAFT → ORDERED` o requiere transición
  explícita?

### 10. Scope de refactor (cuántos endpoints/handlers)

Cambios obligatorios:

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | + 5 modelos (GRN, GRNItem, SupplierInvoice, SupplierInvoiceItem, SupplierCreditNote/Item, RFQRequest/Quote/Item, PurchaseApproval), + 6 valores al enum PurchaseStatus, migración data legacy. |
| `src/app/api/purchases/route.ts` | Reescribir POST: ya no toca stock ni cost ni payable. Solo crea PO en estado DRAFT/REQUESTED. |
| `src/app/api/purchases/[id]/route.ts` | Reescribir PATCH (estado más rico, no solo cancel). |
| `src/app/api/purchases/[id]/approve` | **NUEVO** — transición REQUESTED → ORDERED. |
| `src/app/api/purchases/[id]/grn` | **NUEVO** — POST crea GRN (parcial o total), mueve stock, recalcula costo. |
| `src/app/api/purchases/[id]/invoice` | **NUEVO** — POST registra factura proveedor + retenciones + payable + asiento. |
| `src/app/api/purchases/[id]/credit-note` | **NUEVO** — devolución a proveedor. |
| `src/app/api/rfq/*` | **NUEVO** — endpoints de RFQ. |
| `src/app/api/suppliers/[id]/route.ts` | Agregar campos: `taxRegime`, `withholdsIVA`, `withholdsISR`. |
| `src/app/(dashboard)/purchases/page.tsx` | Reescritura completa: lista por estado, vista de PO con tabs PO/GRNs/Invoices/CreditNotes. |
| Reportes nuevos | Libro de Compras SAT con NIT proveedor (depende Fase 16), aging payables ya existe parcialmente. |

**Estimación:** ~12 endpoints nuevos, 3 endpoints refactorizados, 1
página de UI rehecha, ~5 modelos nuevos, 1 migración pesada con
backfill de datos legacy.

### 11. Validación del plan de Fase 19

El plan en `docs/audits/phase-13-erp-real-plan.md:195-217` es
**correcto en cobertura funcional** y consistente con la auditoría.
Notas para el especialista que ejecute la fase:

- **Dependencia con Fase 14 es real**: las retenciones requieren las
  cuentas "IVA retenido por pagar" e "ISR retenido por pagar" del
  plan contable. No se puede entregar Fase 19 si Fase 14 no está
  cerrada.
- **Dependencia con Fase 15 es real**: el costo promedio que el plan
  pide recalcular en cada GRN no existe todavía. Si Fase 15 ya entró,
  la integración es solo "mover la llamada al hook de costo promedio
  del momento de la creación al momento del GRN".
- **Dependencia con Fase 16 es parcial**: las retenciones afectan el
  libro de compras y el IVA crédito. Si Fase 16 aún no certifica DTE
  real, esto no bloquea (el libro de compras se llena con datos del
  modelo `SupplierInvoice` directamente).
- **Falta en el plan** explicitar:
  - Qué pasa con las PO legacy en `COMPLETED`: ¿migrar a `INVOICED` o
    a `RECEIVED`? Propuesta: a `INVOICED` si tienen `SupplierPayable`
    no nulo, a `RECEIVED` si no.
  - Qué pasa con las PO `CANCELLED` previas — quedan tal cual.
  - Política de borrado vs. soft-delete del `SupplierPayable` al
    anular (hoy es delete duro, propuesta: marcar VOID).
  - Workflow de aprobación multi-nivel vs. single-threshold.
  - Numeración de PO, GRN, SupplierInvoice (¿serie por sucursal?
    ¿lock para concurrencia? — alinear con Fase 23).

### 12. Issues que Fase 11 marcó arregladas y siguen así

Fase 11 cerró: validación Zod en `POST /api/purchases`, endpoint
`GET /api/purchases/[id]`, `PATCH` con anulación + reversa de stock,
audit log `PURCHASE_CANCELLED`. **Confirmado: siguen arregladas.**

Fase 11 dejó fuera (y siguen sin tocarse):
- `PurchaseOrder.reference` unique opcional. **Sigue sin constraint.**
- `PurchaseOrderItem.quantity` Decimal. **Sigue siendo Int.**
- `createAccountingEntry` adentro de la `$transaction` en
  `POST /api/purchases`. **Sigue afuera** (línea 205 del handler:
  `await createAccountingEntryAsync(prisma, …)` se llama
  **después** del `$transaction`). Si el asiento falla, la compra ya
  se guardó. La Fase 19 debe mover esta llamada **dentro** del
  `$transaction`, usando `createAccountingEntry(tx, …)` que ya existe
  (`src/lib/accounting.ts:24`). En `PATCH` ya está adentro
  (línea 149), o sea solo falta arreglar `POST`.

## Issues nuevos detectados en este pasaje

1. **Stock se mueve antes de validar duplicado de factura proveedor.**
   El handler `POST` no valida unicidad de `reference`. Si el operador
   carga la misma factura dos veces, mueve stock dos veces y duplica
   el payable.
2. **`dueDate` del payable es hardcoded a `now + 30 días`** en
   `POST /api/purchases:185-186`. No respeta términos del proveedor.
   La Fase 17 introduce `Supplier.creditDaysDefault` pero el handler
   de compras no lo lee. Tras Fase 19, el `dueDate` debe venir del
   `SupplierInvoice` (no de la PO) y respetar
   `Supplier.creditDaysDefault`.
3. **`POST /api/accounting/payables` no usa Zod** (líneas 62-66 de
   `…/payables/route.ts`: validación manual con `if (!supplierId …)`).
   Inconsistente con el resto del módulo. Cae fuera del scope estricto
   de Fase 19 pero conviene tocarlo cuando se reescriba la creación
   de payables desde `SupplierInvoice`.
4. **`POST /api/accounting/payables/[id]/payments` permite saldo
   bancario negativo** (comentario explícito en línea 41-42:
   "We will allow it for now, but deduct it in BankTransaction"). La
   Fase 24 (hardening) ya marcó este punto. Sigue activo.
5. **Reverse de payment a proveedor no genera asiento contable
   contrario** (`…/reverse/route.ts:30-71`). Solo mueve el banco y
   marca VOID. Pierde simetría contable. La Fase 14 lo arregla a
   nivel general (todo reverse debe generar asiento contrario), pero
   Fase 19 lo hereda.
6. **`SupplierPayment.bankAccountId` es opcional** (schema línea 815)
   pero el handler de creación exige que venga (línea 21-23 de
   `…/payments/route.ts`). El reverse handler asume que puede no
   venir (línea 54). Inconsistencia; tras Fase 19 el campo debería
   ser obligatorio o validado por estado.
7. **UI no permite editar una PO ni reabrirla.** Cuando Fase 19
   introduzca el estado `DRAFT`, hay que agregar `PUT
   /api/purchases/[id]` para editar borradores.
8. **No hay endpoint para listar items con su unidad de medida en el
   detalle del payable.** `GET /api/accounting/payables` solo trae
   `purchase: { id, reference }`, no los items. Para auditar una
   factura proveedor hay que ir a `GET /api/purchases/[id]`. Tras
   Fase 19 debería listar items del `SupplierInvoice` directamente.

## Riesgos del refactor

1. **Migración de datos legacy.** Empresas que ya tienen PO en
   producción esperan que el saldo de stock y los payables sigan
   cuadrando. La migración debe:
   - Crear un `GoodsReceivedNote` "histórico" por cada PO en
     `COMPLETED` actual, con `quantityReceived = quantity` para cada
     ítem.
   - Crear un `SupplierInvoice` histórico por cada PO con `reference`
     no nulo y `SupplierPayable` existente.
   - Migrar `PurchaseStatus.COMPLETED` → nuevo estado `INVOICED` (si
     tenía payable) o `RECEIVED` (si no).
   - Validar antes y después de migrar: suma de stock por producto se
     mantiene, suma de payables pendientes se mantiene.
2. **Concurrencia.** Si dos usuarios reciben la misma PO al mismo
   tiempo (GRN parcial concurrente), pueden sobre-recibir. Hay que
   usar `SELECT … FOR UPDATE` o validación pesimista en el monto
   acumulado por ítem.
3. **Compatibilidad con la UI actual.** La página
   `purchases/page.tsx` está pensada para crear+recibir+pagar en un
   solo paso. Una empresa que opere así no acepta de un día para
   otro el flujo enterprise. Plan: mantener un modo "fast" que en un
   solo POST cree PO+GRN+Invoice (ejecuta los 3 endpoints internos en
   secuencia), y un modo "enterprise" con los pasos separados. Esto
   debe definirse en el kickoff de la fase.
4. **Permisos.** Hoy solo existe `purchases:create` y
   `purchases:view`. Hay que dividir en:
   `purchases:request` (crear PR),
   `purchases:approve` (aprobar PO > threshold),
   `purchases:receive` (hacer GRN),
   `purchases:invoice` (registrar factura proveedor),
   `purchases:credit-note` (devolución a proveedor).
   Esto toca `src/lib/permission-catalog.ts` y el sidebar.

## Checklist de entregables sugerida para Fase 19

- [ ] `enum PurchaseStatus` extendido y migrado.
- [ ] Modelo `GoodsReceivedNote` + items.
- [ ] Modelo `SupplierInvoice` + items + retenciones.
- [ ] Modelo `SupplierCreditNote` + items.
- [ ] Modelo `RFQRequest` + `RFQQuote` + comparativa.
- [ ] Modelo `PurchaseApproval` con threshold configurable.
- [ ] `PurchaseOrderItem.quantity` migrado a `Decimal(12,3)`.
- [ ] Unique compuesto `(companyId, supplierId, reference)` parcial.
- [ ] Endpoints: `purchases POST` (sin stock), `[id]/approve`,
      `[id]/grn`, `[id]/invoice`, `[id]/credit-note`, `[id]/cancel`
      revisado por estado, `rfq/*`.
- [ ] `createAccountingEntry` dentro del `$transaction` del POST.
- [ ] `dueDate` de payable leído desde `Supplier.creditDaysDefault`.
- [ ] Costo promedio ponderado recalculado en GRN (delegado a
      Fase 15 si ya está).
- [ ] Landed cost: campos en GRN + prorrateo proporcional al valor.
- [ ] Retención IVA pequeño contribuyente (5%) y ISR (5%-7%)
      configurables por proveedor.
- [ ] UI rehecha con tabs PR/PO/GRN/Invoice/CreditNote.
- [ ] Permisos divididos en sub-acciones.
- [ ] Migración de datos legacy con validación pre/post.
- [ ] Tests e2e: PO 100 unidades → GRN parcial 60 → segundo GRN 40 →
      RECEIVED → factura con retención → payable → pago.

## Cierre

El módulo actual de compras es funcional para una PYME muy pequeña
(menos de 20 compras al mes, sin necesidad de aprobación, sin
retenciones declaradas) pero **no califica como ERP enterprise**. La
Fase 19 es probablemente la fase más grande del plan después de
Fase 14: cinco modelos nuevos, una docena de endpoints, una migración
de datos no trivial y una reescritura de UI. Recomiendo asignarle al
especialista de Fase 19 un sprint dedicado y no encadenarla con otras
fases en paralelo. La validación cruzada al cierre debe incluir un
test e2e con el escenario clásico de procurement guatemalteco (PO de
materia prima en kg, retención IVA 5% por proveedor pequeño
contribuyente, GRN parcial, landed cost por flete).
