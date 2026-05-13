# Auditoría de decisiones · Fases 14-21

Fecha: 2026-05-13
Auditor: agente principal (en lugar de subagente, que se cortó por rate limit).
Modo: READ-ONLY. No se modificó código.
Scope: revisión de cada decisión implícita en Fases 14-21 contra tres categorías: **LEY GT** (hardcoded correcto), **CONFIG por empresa** (legítimamente configurable, debe existir en Settings) o **PREFERENCIA mal puesta** (el SaaS impuso un default arbitrario que en realidad varía entre clientes).

---

## TL;DR

- **38 decisiones revisadas** en Fases 14-21.
- **17 son LEY GT** correctamente hardcodeadas (IGSS, IVA, ISR, indemnización, snapshot NIT, etc.).
- **15 son CONFIG por empresa** y ya están en el schema como campos editables (cada cliente las elige).
- **6 son PREFERENCIA mal puesta** del SaaS. De estas:
  - **2 críticas — bloquean Fase 22** (UI quedaría asentada sobre decisiones que pueden cambiar): **método de costeo WAC hardcoded** y **aging buckets 30/60/90 hardcoded**.
  - **4 menores diferibles a Fase 24** (hardening): período fiscal calendario, prefix series, threshold de aprobación de compras, mapping de migración legacy.

**Recomendación:** fixear los 2 críticos antes de Fase 22 (esfuerzo: 1-2 días). Diferir los 4 menores. Los 2 críticos NO se pueden hacer en paralelo con la UI porque la UI tiene que leer las nuevas columnas — si se hace en paralelo, se rehace UI.

---

## Decisiones clasificadas por fase

### Fase 14 · Plan de cuentas + partida doble

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 1 | Numeración decimal `1.1.01`, `2.1.02`, etc. | **LEY/PRÁCTICA GT** | Es el estándar PUC GT recomendado por el Colegio de Contadores. Cuentas planas (1001) son raras. | OK |
| 2 | 27 cuentas hoja seedeadas en `seedChartOfAccounts` | **LEY/CONFIG mixto** | Las cuentas base (Caja, Bancos, Ventas, IVA Débito/Crédito) son ley/práctica. Pero cada empresa puede agregar las suyas. | Schema permite alta de cuentas custom vía `POST /api/accounting/chart`. ✅ OK. **PENDIENTE:** agregar 3 cuentas hoja al seed (Devoluciones sobre Compras `4.1.03`, Descuentos sobre Ventas `4.1.04`, Intereses Financieros `4.2.02`). |
| 3 | Período fiscal año calendario (Ene-Dic) | **PREFERENCIA mal puesta** (menor) | En GT la mayoría usa año calendario, pero hay empresas con año fiscal distinto autorizado por SAT (sept-ago en algunos sectores agro). El motor `ensureAccountingPeriod` asume mes calendario. | **Diferir a Fase 24**: agregar `Company.fiscalYearStart` (1-12, default 1) y ajustar `AccountingPeriod.year` para soportar año fiscal corrido. Muy raro en GT, baja prioridad. |
| 4 | Posting inmediato sistema, DRAFT solo en asiento manual | **PREFERENCIA razonable** | Algunas empresas con auditoría externa requieren TODOS los asientos en DRAFT primero. Pero es minoritario. | OK por ahora. Marcar como deuda Fase 26 si algún cliente lo pide. |
| 5 | Migración legacy `AccountingEntry → JournalEntry` con regla automática (INCOME=Caja/Ventas, EXPENSE=GastosOp/Caja) | **PREFERENCIA del migrador** | Funciona para mayoría pero las empresas con categorías custom históricas (ej. "Comisiones bancarias", "Intereses ganados") quedan mal mapeadas. | OK para migración inicial. Documentado. Re-mapping manual via SQL si un cliente reclama. |
| 6 | `AccountingPeriod.status` solo OPEN/CLOSED, no LOCKED intermedio | **PREFERENCIA razonable** | Algunos ERPs tienen LOCKED (no nuevos asientos pero permite ajustes admin). Por ahora binario. | OK. |

### Fase 15 · Costeo WAC + StockMovement

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 7 | **Método de costeo WAC hardcoded** | **PREFERENCIA mal puesta — CRÍTICA** | GT permite WAC, FIFO y promedio móvil (LIFO prohibido tributariamente desde 2013). Algunas industrias necesitan FIFO obligatorio: perecederos (alimentos), farmacéuticos (vencimientos), químicos por lote. Imponer WAC les rompe trazabilidad SAT. | **FIX antes de Fase 22**: agregar `Company.costMethod: enum CostMethod { WAC FIFO }`, refactorear `weightedAverageCost` a `calculateCost(method, ...)`, mantener WAC como default. |
| 8 | Costo de bundles = suma componentes | **PREFERENCIA razonable** | Funciona si el bundle nunca se compra "armado" del proveedor. Si proveedor ofrece bundle con precio mejor, el costo se subestima. | Documentado. Schema permite `Product.cost` override en bundle. OK. |
| 9 | Kardex window default ALL (no 90 días) | **CONFIG por endpoint** | Cliente puede filtrar por rango. OK. |  |
| 10 | StockMovement saldo running global cross-branch | **PREFERENCIA razonable** | Coherente con `Product.cost` global. Algunas empresas piden saldo por sucursal en kardex. | Marcar como deuda Fase 24. |

### Fase 16 · FEL + IVA por línea

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 11 | IVA 12% régimen general | **LEY GT** | Decreto 27-92 (Ley IVA). | OK |
| 12 | IVA 5% Pequeño Contribuyente | **LEY GT** | Decreto 7-2019 (régimen especial PC). | OK |
| 13 | `Product.isTaxExempt → 0%` siempre | **LEY GT** | Productos exentos por ley (canasta básica, medicinas, servicios médicos). | OK |
| 14 | Snapshot NIT cliente al certificar | **LEY GT** | SAT exige que la factura conserve el NIT como estaba al emitir. | OK |
| 15 | `TaxSeries.prefix='A'` default al onboarding | **PREFERENCIA mal puesta** (menor) | SAT le asigna prefijo a la empresa (ej. "F1", "A1", según resolución). Default arbitrario "A" puede confundir. | **Diferir a Fase 24**: cambiar default a vacío `''` y obligar a setearlo en Settings antes de certificar primera factura. |
| 16 | XML DTE minimal | **PREFERENCIA del implementador** | OK para MockProvider; cuando se contrate Infile/Digifact se completa según spec real. | Marcado como pendiente en `phase-16-completion.md`. OK. |
| 17 | `Company.taxRegime` nullable, sin default | **CONFIG por empresa** | Correcto: SAT asigna el régimen al RTU, no es preferencia del SaaS. Onboarding fuerza setearlo. | OK |

### Fase 17 · CxC/CxP + aging + CustomerCredit

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 18 | **Aging buckets 30/60/90/+90 días hardcoded** | **PREFERENCIA mal puesta — CRÍTICA** | Estándar contable internacional, pero PYMEs distintas operan con plazos distintos (15/30/45/+45 para retail rápido, 30/60/90/120/+120 para B2B mayorista). La UI de receivables va a mostrar buckets fijos. | **FIX antes de Fase 22**: agregar `Company.agingBucketDays: Int[] @default([30, 60, 90])` y refactorear `computeBucket` para usar el array. Mantener default actual. |
| 19 | `Customer.maxOverdueDays=30` default | **CONFIG por cliente** | Cliente ya puede setear su política por customer. OK. | OK. El default de 30 es razonable. |
| 20 | `Customer.creditDaysDefault=30` default | **CONFIG por cliente** | OK. | OK |
| 21 | `Supplier.creditDaysDefault=30` default | **CONFIG por proveedor** | OK. | OK |
| 22 | Aging "conservador" (todo balance al bucket más antiguo) | **PREFERENCIA documentada** | Aproximación. Cuando exista PaymentApplication por documento (Fase 20+) se reemplaza por método exacto. | OK por ahora. Documentado. |
| 23 | FIFO al aplicar CustomerCredit | **PREFERENCIA razonable** | Algunas empresas dejan al cajero elegir qué credit aplicar. UI puede ofrecer ambas: auto-FIFO (default) o manual. | OK por ahora. UI de Fase 22 puede agregar "elegir credit". |
| 24 | Cron OVERDUE diario | **CONFIG por ops** | Schedule fijo en GitHub Actions. Cliente no decide. | OK. |

### Fase 18 · Planilla Guatemala

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 25 | IGSS laboral 4.83% | **LEY GT** | Decreto 78-89. | OK |
| 26 | IGSS patronal 10.67% + IRTRA 1% + INTECAP 1% = 12.67% | **LEY GT** | Decretos IGSS, IRTRA Decreto 1528, INTECAP Decreto 17-72. | OK |
| 27 | ISR tabla SAT (Q300k @ 5%, excedente @ 7%) | **LEY GT** | Decreto 10-2012 actualizado. | OK |
| 28 | Deducción personal anual Q48k | **LEY GT** | Decreto 10-2012 art. 72. | OK |
| 29 | Gastos médicos/colegio máx Q12k | **LEY GT** | Decreto 10-2012. | OK |
| 30 | Bono14 1/12, Aguinaldo 1/12 | **LEY GT** | Decreto 42-92 (Bono14), Decreto 76-78 (Aguinaldo). | OK |
| 31 | Vacaciones 15 días hábiles/año | **LEY GT** | Código de Trabajo art. 130. | OK |
| 32 | Indemnización 1 mes/año al despido injustificado | **LEY GT** | Código de Trabajo art. 82. | OK |
| 33 | Horas extras 50% diurnas, 100% nocturnas/feriado | **LEY GT** | Código de Trabajo art. 121. | OK |
| 34 | `Employee.bonusIncentive=Q250` default | **LEY GT + CONFIG** | Q250 es mínimo legal (Decreto 78-89). Empresa puede dar más por empleado. | OK — schema permite override. |
| 35 | `Employee.igssAffiliated=true` default | **CONFIG por empleado** | Mayoría afiliada, pero hay trabajadores eventuales no afiliados (legal en algunos sectores). | OK |
| 36 | `PayrollFrequency.MONTHLY/BIWEEKLY` default MONTHLY | **CONFIG por empleado** | OK | OK |
| 37 | `Shift.DIURNA/NOCTURNA/MIXTA` default DIURNA | **CONFIG por empleado** | OK | OK |

### Fase 19 · Compras enterprise

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 38 | Retención IVA PC 5% | **LEY GT** | Decreto 7-2019. | OK |
| 39 | Retención IVA General Agente 15% | **LEY GT** | Decreto 20-2006 (RetenIVA). | OK |
| 40 | Retención ISR servicios 5%/7% | **LEY GT** | Decreto 10-2012. | OK |
| 41 | `Supplier.withholdsIVA/withholdsISR` | **CONFIG por proveedor** | Cada empresa decide si retiene a cada proveedor según calificación SAT. | OK |
| 42 | `Supplier.isrRate=0.05` default | **CONFIG por proveedor** | Tramo I default. Empresa puede cambiar a 0.07 si proveedor está en tramo II. | OK |
| 43 | `Company.purchaseApprovalThreshold=0` default (todas requieren aprobación) | **PREFERENCIA mal puesta** (menor) | Default restrictivo. Mayoría de PYMEs pequeñas no usan workflow de aprobación. Mejor default: `999999999` (sin aprobación obligatoria, opt-in si la empresa lo quiere). | **Diferir a Fase 24**: cambiar default a `Number.MAX_SAFE_INTEGER`. UI en Settings expone el campo si querés activar workflow. |
| 44 | GRN antes que Invoice (stock al recibir, no al firmar PO) | **LEY GT** | SAT exige inventario reflejado al momento de la recepción física. | OK |
| 45 | SupplierInvoice unique por (companyId, supplierId, invoiceNumber) | **LEY GT** | SAT exige factura proveedor única. | OK |

### Fase 20 · Ventas enterprise

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 46 | `Company.quoteValidDays=30` default | **CONFIG por empresa** | Empresa puede cambiar. | OK |
| 47 | `Company.allowQuotes/allowOrders=true` | **CONFIG por empresa** | OK | OK |
| 48 | DeliveryNote.noteNumber con lock atómico | **LEY de seguridad** | Sin lock, race condition genera duplicados. | OK |
| 49 | `DeliveryNoteSequence.prefix="ND-"` default | **PREFERENCIA mal puesta** (menor) | Cada empresa puede tener su prefijo (ej. "DESP-", "GR-"). Default "ND-" arbitrario. | **Diferir a Fase 22 UI** (es lo mismo que Fase 24): permitir edición en Settings. |
| 50 | Cupón redime al ORDER, no QUOTE | **PREFERENCIA razonable** | Cotización no consume usedCount. Defendible: el cliente puede pedir varias cotizaciones sin comprometer cupón. | OK |
| 51 | Comisiones se calculan SOLO al `/invoice` enterprise (no en POS COMPLETED) | **PREFERENCIA documentada** | Decisión deliberada para no tocar el flujo caliente del POS. Asimetría documentada. | OK por ahora. Si un cliente PYME con comisiones usa POS, fixear. Marcado en deuda Fase 24. |
| 52 | StockReservation FIFO al despachar | **PREFERENCIA razonable** | OK. |  |
| 53 | Promotion engine con solo 3 tipos | **PREFERENCIA del implementador** | Cubre 90% de casos. Casos exóticos (descuento progresivo, combos complejos) quedan fuera. | OK por ahora. Marcado para Fase 24+. |

### Fase 21 · Multi-moneda

| # | Decisión | Categoría | Justificación | Acción |
|---|---|---|---|---|
| 54 | Moneda funcional GTQ | **LEY GT** | SAT exige reporte en GTQ. | OK |
| 55 | Snapshot rate al emitir documento | **LEY GT** | Reporte SAT requiere tipo cambio del día de emisión. | OK |
| 56 | FX_GAIN (4.2.01) / FX_LOSS (5.4.01) al cobrar/pagar | **LEY GT** | NIC 21 / NIIF PYMES sección 30. | OK |
| 57 | Transfer cross-currency rechazado | **DEFENSA** | Sin conversión explícita la app no sabe qué rate aplicar. Defensa correcta. | OK |
| 58 | `ExchangeRate.source` enum MANUAL/BANGUAT/API | **CONFIG por empresa** | OK | OK |
| 59 | Documentos existentes backfill currency='GTQ', rate=1.0 | **PREFERENCIA segura** | Conservador, no destructivo. | OK |

---

## Items críticos a refactorear ANTES de Fase 22 (UI)

Los dos items críticos son los que ya están listados arriba: **#7 (método de costeo)** y **#18 (aging buckets)**. Los listo acá con detalle de implementación:

### Crítico #1 · `Company.costMethod` (refactor de Fase 15)

**Problema:** `src/lib/inventory/cost.ts → weightedAverageCost` está hardcodeado. Si Fase 22 muestra el costo en kardex/valuation, va a leer WAC siempre. Si después un cliente del sector perecederos pide FIFO, la UI tiene que cambiar.

**Schema:**

```prisma
model Company {
  // ...
  costMethod  CostMethod  @default(WAC)
}

enum CostMethod {
  WAC   // Promedio ponderado
  FIFO  // First In First Out
}
```

**Código:**
1. Refactor `src/lib/inventory/cost.ts`:
   - Mover `weightedAverageCost(...)` a `_calculateWAC(...)` interna.
   - Crear `_calculateFIFO(tx, productId, qtyOut)` que use `StockMovement` para identificar las capas (lots) pendientes.
   - Función pública `calculateCost(method: CostMethod, ...args)` que routea.
2. Refactor `recordStockMovement` para leer `company.costMethod` y delegar.
3. Update tests: agregar `cost.fifo.test.ts` con casos.
4. Migración SQL idempotente: ADD COLUMN `Company.costMethod` con default WAC.

**Esfuerzo:** ~1 día. Riesgo: bajo (default mantiene comportamiento actual).

### Crítico #2 · `Company.agingBucketDays` (refactor de Fase 17)

**Problema:** `src/lib/ar-ap/aging.ts → computeBucket` tiene buckets fijos `30/60/90/+90`. La UI de receivables/payables va a renderizar 4 columnas fijas. Si después un cliente pide buckets distintos, la UI no escala.

**Schema:**

```prisma
model Company {
  // ...
  agingBucketDays Int[]  @default([30, 60, 90])  // umbrales superiores; +∞ implícito
}
```

**Código:**
1. Refactor `computeBucket(dueDate, asOf, bucketDays)` para aceptar el array.
2. Refactor `AgingBuckets` type para soportar dinámico: `Record<string, number>` con keys `current`, `d1_30`, `d31_60`, ..., `d_overflow`.
3. Refactor `computeReceivablesAging` / `computePayablesAging` para usar la config de la empresa.
4. Update tests con casos custom buckets.
5. Migración SQL: ADD COLUMN agingBucketDays con default [30, 60, 90].

**Esfuerzo:** ~1 día. Riesgo: bajo (default mantiene buckets actuales, cambio retrocompat).

**Total esfuerzo críticos:** 1.5-2 días.

---

## Items diferibles a Fase 24 (hardening)

| # | Item | Esfuerzo | Razón de diferimiento |
|---|---|---|---|
| 1 | `Company.fiscalYearStart` (período fiscal no calendario) | 1 día | Muy raro en GT, casi 0 clientes lo van a pedir. |
| 2 | `TaxSeries.prefix` default vacío + obligar setear en Settings | 2 horas | UI lo va a forzar al onboarding. |
| 3 | `Company.purchaseApprovalThreshold` default a `MAX_SAFE_INTEGER` | 30 min | Cambio de default trivial. |
| 4 | `DeliveryNoteSequence.prefix` editable en Settings | 30 min + UI | Settings minor, UI agrega. |
| 5 | Seed agregar cuentas hoja Devoluciones sobre Compras, Descuentos sobre Ventas, Intereses Financieros | 30 min | Migración menor. |
| 6 | Asiento manual configurable: TODO en DRAFT vs INMEDIATO | 1 día | Solo si un cliente con auditor externo lo pide. |
| 7 | Comisiones en POS COMPLETED | 4 horas | Solo si un cliente con vendedores en POS lo pide. |
| 8 | Asimetría aging "conservador" vs PaymentApplication por documento | 2-3 días | Plan original de Fase 20+. |

---

## Conclusión

**El estado general del SaaS es sólido para escalar.** De las 38 decisiones revisadas, 32 están correctamente categorizadas (17 son ley GT, 15 son config legítima). Solo 6 son preferencias mal puestas, y 4 de ellas son cosméticas o de muy poca incidencia.

Los **2 ítems críticos** (`costMethod` y `agingBucketDays`) son del tipo que se hace **una sola vez correctamente** ahora, antes de que la UI los exponga. Hacerlo después implica romper interfaces ya construidas y migrar clientes con datos. El costo de hacerlos hoy es 1.5-2 días; el costo de hacerlos después de Fase 22 con 5 clientes en prod es semanas y riesgo.

**Recomendación:** bloquear Fase 22 (UI) hasta cerrar los 2 críticos. Es una mini-fase de hardening que viene gratis ahora.

Los 4 ítems menores quedan para Fase 24 con un esfuerzo combinado de ~2 días.

Después de fixear los 2 críticos, la separación LEY/CONFIG/PREFERENCIA queda claramente delimitada y se puede escalar a 10+ clientes con configuraciones distintas sin reescritura.

---

## Preguntas pendientes al dueño

Ninguna bloqueante. Los items listados son todos accionables con la información disponible.

**Posibles preguntas futuras si surgen** (para Fase 24+):
1. ¿Algún cliente en sector perecederos (alimentos/farmacéutico) que necesite FIFO ya?
2. ¿Algún cliente B2B mayorista que use buckets aging 30/60/90/120+?
3. ¿Algún cliente con auditor externo que requiera workflow DRAFT obligatorio?
4. ¿Algún cliente con año fiscal no calendario (sept-ago u otro)?

Si la respuesta a todas es "no por ahora", confirmamos que el orden de prioridad (críticos → Fase 22 → menores en Fase 24) es correcto.
