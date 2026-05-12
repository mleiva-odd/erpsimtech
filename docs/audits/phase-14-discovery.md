# Phase 14 · Accounting Discovery

Fecha: 2026-05-11
Estado: Read-only audit en preparación de Fase 14. No se modificó código del proyecto.
Auditor: subagente especialista contable.

## Resumen ejecutivo

- El sistema contable actual es **single-line** (`AccountingEntry` con `type INCOME/EXPENSE` y `amount` único). **No existe partida doble** — ni `ChartOfAccount`, ni `JournalEntry`, ni `JournalLine`, ni cuentas hoja codificadas. El plan de Fase 14 es correcto en alcance.
- **17 call sites** de `createAccountingEntry` / `createAccountingEntryAsync` distribuidos en **9 archivos** + el endpoint de creación manual `POST /api/accounting`. Todos generan asientos de una sola "pierna" usando un nombre de categoría libre.
- **Bugs contables severos detectados:**
  - Reversa de pagos (`/api/accounting/{receivables,payables}/payments/[paymentId]/reverse`) **no genera asiento contrario**: solo revierte saldo cliente/proveedor y banco. La entrada contable original queda "viva" → P&L queda inflado de forma permanente.
  - Anulación de venta crea un EXPENSE paralelo "Devoluciones POS" en lugar de revertir el INCOME original con misma cuenta — ya documentado en `phase-13-erp-real-plan.md` Fase 20, pero el plan de Fase 14 no lo aborda explícitamente al refactorizar.
  - `createAccountingEntryAsync` en `pos/expense`, `purchases POST` y `customers/[id]/payments POST` corre **fuera del `$transaction`** → puede dejar movimientos sin asiento (M-1 de phase-4).
  - `initializeAccountingCategories` está exportado pero **nunca se llama** en seed, en `/api/onboarding`, ni en `/api/admin/companies`. Las categorías se crean por demanda (`findFirst`/`create` dentro del helper). Resultado: cada empresa termina con categorías diferentes y huérfanas (e.g. "Reversa de Compras", "Devoluciones POS", "Cobros a Clientes") inventadas en cada call site.
- **Ya implementado parcialmente que el plan no contempla:** existe `POST /api/accounting` para entradas manuales (Fase 14 debe preservar este flujo apuntándolo a `JournalEntry`); existe el dashboard `/accounting` que consume `summary`, `categories` y la lista paginada (todo lectura desde `AccountingEntry`).
- **Volumen real del refactor:** 17 call sites + 1 helper + 4 endpoints de lectura (`/api/accounting`, `/summary`, `/categories`, `/reports/accounting/profit-loss`) + 1 página dashboard. Migración de datos: cada `AccountingEntry` se convierte a `JournalEntry` con 2 líneas (regla determinística). **Estimado: 4-6 días para un subagente competente.**

## Estado actual del módulo contable

### Modelos en `prisma/schema.prisma`

Solo dos modelos relacionados a contabilidad operativa:

```prisma
// prisma/schema.prisma:733
model AccountingCategory {
  id          String          @id @default(uuid())
  companyId   String
  name        String
  type        AccountingType   // INCOME | EXPENSE
  isSystem    Boolean         @default(false)
  active      Boolean         @default(true)
  ...
  @@unique([companyId, name])
}

// prisma/schema.prisma:749
model AccountingEntry {
  id            String             @id @default(uuid())
  companyId     String
  branchId      String?
  categoryId    String
  type          AccountingType     // INCOME | EXPENSE
  description   String
  amount        Decimal            @db.Decimal(10, 2)
  referenceType String?            // 'SALE' | 'PURCHASE' | 'CUSTOMER_PAYMENT' | ...
  referenceId   String?
  date          DateTime           @default(now())
  userId        String
  bankTransactionId String?
  ...
}
```

`enum AccountingType` (schema.prisma:663) solo tiene **INCOME / EXPENSE**. No hay ASSET, LIABILITY, EQUITY.

**No existen:** `ChartOfAccount`, `JournalEntry`, `JournalLine`, `AccountingPeriod`, ni nada equivalente. Tampoco en `prisma/migrations/`.

### Helper centralizado: `src/lib/accounting.ts`

- `createAccountingEntry(tx, data)` — busca o crea categoría por **nombre libre** (no por código contable) y graba `AccountingEntry`. (`src/lib/accounting.ts:24-66`)
- `createAccountingEntryAsync(prisma, data)` — versión post-transaction que silencia errores con `console.error`. (`src/lib/accounting.ts:72-83`)
- `SYSTEM_CATEGORIES` — array literal con 4 ingresos + 10 egresos. (`src/lib/accounting.ts:89-108`)
- `initializeAccountingCategories(prisma, companyId)` — upsert de las anteriores. **Orphan: nunca importada fuera del propio archivo.**

### Endpoints contables existentes (`src/app/api/accounting/**`)

| Endpoint | Verbo | Función actual |
|---|---|---|
| `accounting/route.ts` | GET / POST | Lista paginada de `AccountingEntry` con filtros; POST de entrada manual con `categoryId` |
| `accounting/summary/route.ts` | GET | Aggregates mensuales INCOME/EXPENSE + CxC + CxP + breakdown por categoría |
| `accounting/categories/route.ts` | GET / POST | CRUD parcial de `AccountingCategory` |
| `accounting/banks/route.ts` | GET / POST | CRUD `BankAccount` |
| `accounting/banks/[id]/route.ts` | GET / PUT / DELETE | Edit bank account |
| `accounting/banks/[id]/transactions/route.ts` | GET / POST | Movimientos manuales de banco |
| `accounting/banks/transfer/route.ts` | POST | Transferencia entre cuentas (genera **2** `AccountingEntry`: 1 INCOME + 1 EXPENSE) |
| `accounting/payables/route.ts` | GET / POST | Lista y alta manual de `SupplierPayable` |
| `accounting/payables/[id]/payments/route.ts` | POST | Pago a proveedor + entrada contable |
| `accounting/payables/payments/[paymentId]/reverse/route.ts` | POST | Anula pago, **sin asiento contrario** |
| `accounting/receivables/route.ts` | GET | Lista de clientes con saldo > 0 |
| `accounting/receivables/[customerId]/pay/route.ts` | POST | Cobro a cliente + entrada contable |
| `accounting/receivables/payments/[paymentId]/reverse/route.ts` | POST | Anula cobro, **sin asiento contrario** |

### Reportes contables existentes (`src/app/api/reports/accounting/**`)

Solo uno:

- `reports/accounting/profit-loss/route.ts` — P&L del período. Lee de `AccountingEntry` agrupando por `categoryId` y separa por `type`. **No existe** balance general, flujo de caja, balance de comprobación, libro diario, ni libro mayor.

`profit-loss` tiene un detalle peculiar: además de leer `AccountingEntry`, lee `Sale` y `SaleItem` para calcular ventas brutas y COGS (de `unitCost`). Esto significa que el P&L "real" hoy mezcla dos fuentes — Fase 14 debería unificar a `JournalEntry` con líneas DR COGS / CR Inventario y dejar que el P&L lea de una sola fuente.

### Generación automática de asientos: call sites

| Archivo | Línea | Helper | Type / Categoría | Dentro de `$transaction`? |
|---|---|---|---|---|
| `src/app/api/sales/route.ts` | 403 | `createAccountingEntry` | INCOME · "Ventas POS"/"Ventas Remotas" | Sí |
| `src/app/api/sales/[id]/route.ts` (cancel) | 184 | `createAccountingEntry` | EXPENSE · "Devoluciones POS"/"Devoluciones Remotas" | Sí — pero **crea EXPENSE paralelo** en lugar de reversar el INCOME original |
| `src/app/api/pos/returns/route.ts` | 285 | `createAccountingEntry` | EXPENSE · "Devoluciones POS" | Sí |
| `src/app/api/pos/expense/route.ts` | 92 | `createAccountingEntryAsync` | EXPENSE · "Gastos de Operación (Caja)"/"Retiros de Efectivo (Caja)" | **No** (post-tx) |
| `src/app/api/purchases/route.ts` | 205 | `createAccountingEntryAsync` | EXPENSE · "Compras de Inventario" | **No** (post-tx) |
| `src/app/api/purchases/[id]/route.ts` (cancel) | 149 | `createAccountingEntry` | INCOME · "Reversa de Compras" | Sí — crea INCOME paralelo, mismo bug que ventas |
| `src/app/api/customers/[id]/payments/route.ts` | 150 | `createAccountingEntryAsync` | INCOME · "Abonos de Clientes" | **No** (post-tx) |
| `src/app/api/accounting/receivables/[customerId]/pay/route.ts` | 84 | `createAccountingEntry` | INCOME · "Cobros a Clientes" | Sí |
| `src/app/api/accounting/payables/[id]/payments/route.ts` | 91 | `createAccountingEntry` | EXPENSE · "Pagos a Proveedores" | Sí |
| `src/app/api/accounting/banks/transfer/route.ts` | 75, 87 | `createAccountingEntry` ×2 | EXPENSE + INCOME · "Traslados Bancarios Salientes/Entrantes" | Sí |

**Total: 11 lugares + 2 piernas del transfer = 12 invocaciones generadoras.** Sumando los dos helpers en `accounting.ts` y la creación manual en `accounting/route.ts:101`, son **14 sitios que tocan `AccountingEntry`**. En el conteo bruto de `Grep` salen 17 matches (incluyen los `import` y los pares `createAccountingEntryAsync` que envuelven el `await`).

### Categorías que el código inventa por demanda

Aparte de las 14 categorías en `SYSTEM_CATEGORIES`, el código crea sobre la marcha:
- "Reversa de Compras" (purchases cancel)
- "Devoluciones POS" / "Devoluciones Remotas" (sale cancel + returns)
- "Cobros a Clientes" (receivables/pay)
- "Pagos a Proveedores" (payables/pay) — ya existe en SYSTEM_CATEGORIES como "Pagos a Proveedores", duplicado
- "Traslados Bancarios Salientes" / "Traslados Bancarios Entrantes" (transfer)
- "Gastos de Operación (Caja)" / "Retiros de Efectivo (Caja)" (pos/expense) — duplica "Retiros de Caja" de SYSTEM_CATEGORIES.

Hay **superposición y duplicación** ("Pagos a Proveedores" vs SYSTEM, "Retiros de Caja" vs "Retiros de Efectivo (Caja)") porque cada call site escribió su propio literal.

## Hallazgos

### CRÍTICOS

**H1 · Reversa de pago a cliente sin asiento contrario**
`src/app/api/accounting/receivables/payments/[paymentId]/reverse/route.ts:30-65`
La transacción marca el `AccountPayment` como `VOID`, decrementa el banco, regresa el saldo deudor del cliente — **pero no crea un `AccountingEntry` contrario**. El INCOME original ("Cobros a Clientes" o "Abonos de Clientes") sigue contado. P&L y `summary` quedan inflados permanentemente cuando se anula un cobro. Severidad: CRÍTICA contable.

**H2 · Reversa de pago a proveedor sin asiento contrario**
`src/app/api/accounting/payables/payments/[paymentId]/reverse/route.ts:30-71`
Mismo defecto: solo revierte saldos en `SupplierPayable` y `BankAccount`. El EXPENSE original "Pagos a Proveedores" queda. Severidad: CRÍTICA.

**H3 · Anulación de venta crea EXPENSE paralelo en lugar de reversar el INCOME**
`src/app/api/sales/[id]/route.ts:184-194`
La cancelación graba `type: 'EXPENSE'` con categoría "Devoluciones POS" — el INCOME "Ventas POS" original queda intacto. En reportes mensuales, los totales de ingresos y egresos se inflan **ambos**, y el neto cuadra solo "por casualidad". Hace imposible auditar ventas reales vs anuladas por monto. Mismo patrón en cancelación de compra (`purchases/[id]/route.ts:149` graba INCOME "Reversa de Compras"). Severidad: CRÍTICA.

**H4 · Asientos contables fuera de `$transaction`**
Tres endpoints crean el asiento contable después de cerrar la transacción principal:

- `src/app/api/purchases/route.ts:205` (`createAccountingEntryAsync` post-tx)
- `src/app/api/pos/expense/route.ts:92` (idem)
- `src/app/api/customers/[id]/payments/route.ts:150` (idem)

Si la lambda muere o el async falla silenciosamente (el helper hace `console.error` y devuelve `null`), queda compra/egreso/abono sin movimiento contable. Ya está marcado como M-1 en `phase-4-transactions-review.md` para sales (resuelto allí), pero **estos 3 quedaron pendientes**. Severidad: CRÍTICA (consistencia transaccional rota).

### ALTAS

**H5 · `initializeAccountingCategories` nunca se invoca**
`src/lib/accounting.ts:113-145` — la función está exportada pero ningún `import` la usa. Confirmado con grep. Cuando se crea una empresa nueva por `/api/onboarding` o `/api/admin/companies`, no se siembran las categorías. La primera venta crea "Ventas POS" sobre la marcha vía `findFirst|create`. Resultado: el listado en el dashboard arranca incompleto. Severidad: ALTA.

**H6 · Categorías duplicadas y nombres mágicos hardcodeados**
Cada call site hardcodea el nombre de categoría como string literal ("Ventas POS", "Compras de Inventario", "Pagos a Proveedores", "Traslados Bancarios Entrantes", etc.). No hay constante compartida. "Pagos a Proveedores" aparece como literal en `payables/[id]/payments/route.ts:94` **y** en `SYSTEM_CATEGORIES.EXPENSE`. "Retiros de Efectivo (Caja)" (literal en `pos/expense/route.ts:91`) no coincide con "Retiros de Caja" del SYSTEM. Si un usuario renombra una categoría desde la UI, el próximo call site la duplica. Severidad: ALTA.

**H7 · `Sale.tax` hardcoded a 0 — el P&L ignora IVA**
`prisma/schema.prisma:373` define `tax Decimal @default(0)`. Revisando `sales/route.ts` no hay cálculo de IVA por línea — siempre se persiste con default 0. El P&L (`profit-loss/route.ts:124-125`) calcula `ventasNetas = ventasBrutas − tax` pero como `tax` es 0, ventasNetas == ventasBrutas. Severidad: ALTA contable, aunque se ataca en Fase 16. Mencionar al diseñar el `JournalEntry` de venta: la línea de IVA débito fiscal hoy sería 0; la implementación de Fase 14 debe dejar el slot reservado pero usar valor 0 hasta Fase 16.

**H8 · No existe `AccountingPeriod` ni mecanismo de cierre**
No hay tabla `AccountingPeriod`, no hay status `OPEN/CLOSED`, no hay endpoint de cierre, no hay enforcement de edición. Cualquier usuario con `treasury:manage` puede crear un `AccountingEntry` con `date` arbitraria (`POST /api/accounting` acepta `date` opcional, schema-validado solo como `string()`, ver `accounting/route.ts:11`). Severidad: ALTA. El plan lo incluye.

### MEDIAS

**H9 · `POST /api/accounting` permite entrada manual sin balanceo**
`src/app/api/accounting/route.ts:73-124` deja crear un movimiento aislado (single-line, sin contraparte). Cuando se migre a partida doble, este endpoint debe pedir `lines[]` con suma DR == suma CR. Severidad: MEDIA (afecta UX del dashboard `/accounting` que tiene un formulario para registrar entradas).

**H10 · `AccountingEntry.amount` es `Decimal(10, 2)` — riesgo de overflow**
`prisma/schema.prisma:756` — 10 dígitos totales, 2 decimales → máximo 99,999,999.99. Para una PYME guatemalteca a corto plazo no es problema, pero `Sale.total`, `Payroll.totalGross` y `BankAccount.balance` ya están en `Decimal(15, 2)`. La inconsistencia puede causar fallos cuando se reporta un total mensual sumado. En la nueva tabla `JournalLine`, usar `Decimal(15, 2)` en débito/crédito. Severidad: MEDIA.

**H11 · No hay índice por `(companyId, date)` en `AccountingEntry`**
Existen índices por `(companyId, type, date)` y `(companyId, categoryId)`, pero no uno simple por `(companyId, date DESC)` que es el orderBy más frecuente en el dashboard. En `JournalEntry` agregar índice por `(companyId, date DESC)` + por `(companyId, periodId, posted)`. Severidad: MEDIA.

**H12 · `summary` calcula CxC desde `Customer.balance` no desde asientos**
`accounting/summary/route.ts:42` lee `customer.balance` como saldo de CxC, no agrega desde `AccountingEntry` ni desde una cuenta "Clientes por cobrar". Cuando Fase 14 introduzca CxC como cuenta del catálogo, el reporte deberá:
  - O mantener este atajo (es válido y rápido)
  - O dejar el `summary` como dashboard rápido y delegar reporte fiel al nuevo Balance General.
Decisión abierta — recomendación al final del documento. Severidad: MEDIA.

### BAJAS

**H13 · Schema Zod del POST de entrada manual no fuerza `date` ISO**
`accounting/route.ts:11`: `date: z.string().optional()`. Acepta cualquier string. Convertirlo a `z.coerce.date()` o `z.string().datetime()`.

**H14 · `branchId` en banco/transferencia es opcional pero no se propaga**
`accounting/banks/transfer/route.ts:75-97` llama `createAccountingEntry` **sin** `branchId`. Significa que las transferencias entre bancos no quedan adjudicadas a una sucursal y el filtro por sucursal del dashboard las omite. Cuando haya partida doble, los asientos de tesorería pueden ir a nivel de empresa (sin branch), lo cual es defendible — pero hoy es inconsistente con el resto.

**H15 · El dashboard `/accounting/page.tsx` hace fetch a 3 endpoints en serie y sin ETag**
No es bug, es performance/UX que el Frontend de Fase 22 deberá tocar. Marcar como nota para Fase 14 no romper el contrato.

## Volumen del refactor

| Pieza | Cantidad | Detalle |
|---|---|---|
| Modelos Prisma a agregar | 4 | `ChartOfAccount`, `JournalEntry`, `JournalLine`, `AccountingPeriod` |
| Enums a agregar | 1 | `AccountTypeCategory` (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE) — distinto del `AccountType` actual de bancos |
| Migraciones SQL | 1 grande + 1 backfill | Crear modelos + seed de plan de cuentas + script de migración de `AccountingEntry → JournalEntry` |
| Helper a reescribir | 1 | `src/lib/accounting.ts` — nueva firma `createJournalEntry(tx, { date, description, lines: [{ accountCode, debit, credit }] })` con validador `Σ DR == Σ CR` |
| Call sites a refactorizar | 11 invocaciones de creación + 1 manual + 2 lecturas (summary, profit-loss) = **14** | Ver tabla en sección anterior |
| Endpoints API nuevos | 5 | `balance-sheet`, `cash-flow`, `trial-balance`, `general-journal`, `general-ledger`, y endpoint `POST /api/accounting/periods/[id]/close` |
| Endpoints API a refactorizar | 4 | `accounting/route.ts` (manual entry → líneas), `summary/route.ts` (leer de cuentas por tipo), `categories/route.ts` (renombrar a `chart-of-accounts/route.ts`), `reports/accounting/profit-loss/route.ts` |
| Dashboard a actualizar | 1 página | `src/app/(dashboard)/accounting/page.tsx` — el modelo `AccountingEntry` desaparece; sustituir tipos y endpoints |
| Categorías mágicas hardcoded a reemplazar con códigos de cuenta | ~12 | Mapeo INCOME/EXPENSE→cuenta hoja |
| Tests unitarios a escribir | min 4 | Validador DR==CR, regla de migración, validación de cuenta hoja (`isPosting`), bloqueo en período cerrado |

**Estimación de esfuerzo:** 4 a 6 días-persona para subagente competente con conocimiento contable. Riesgo medio en migración de datos por la cantidad de tenants con `AccountingEntry` histórico (ver siguiente sección).

## Decisiones contables abiertas para el dueño

Estas decisiones impactan la implementación y deben definirse **antes** de empezar Fase 14:

1. **¿Niveles jerárquicos del plan de cuentas?**
   El plan propone códigos tipo "1.1.01" — implica jerarquía con `parentId`. Confirmar:
   - ¿Máximo cuántos niveles? (recomendado 3: Tipo → Cuenta mayor → Cuenta hoja. Ej: 1 Activo → 1.1 Activo corriente → 1.1.01 Caja)
   - ¿Permitir códigos más profundos por empresa? (mayor flexibilidad, más complejidad).
2. **¿Centros de costo?**
   El plan no menciona dimensiones extra de análisis (centros de costo, proyectos). Si la PYME lo necesita, agregar `JournalLine.costCenterId` ahora cuesta poco; agregarlo después es costoso. Recomendación: **incluir nullable desde el principio**.
3. **Cuentas hoja mínimas a sembrar** (lista propuesta para Guatemala — confirmar):
   - **Activo:** 1.1.01 Caja General, 1.1.02 Caja Chica, 1.1.03 Bancos (parent), 1.1.04 Clientes (CxC), 1.1.05 IVA Crédito Fiscal, 1.1.06 Inventarios, 1.1.07 Anticipos a Proveedores.
   - **Pasivo:** 2.1.01 Proveedores (CxP), 2.1.02 IVA Débito Fiscal, 2.1.03 ISR por pagar, 2.1.04 IGSS por pagar, 2.1.05 Sueldos por pagar, 2.1.06 ISR retenido a terceros.
   - **Patrimonio:** 3.1.01 Capital, 3.1.02 Resultados del Ejercicio, 3.1.03 Resultados Acumulados.
   - **Ingresos:** 4.1.01 Ventas, 4.1.02 Otros Ingresos, 4.1.03 Diferencia cambiaria positiva.
   - **Egresos:** 5.1.01 Costo de Ventas, 5.1.02 Sueldos y Salarios, 5.1.03 Cuotas Patronales, 5.1.04 Alquiler, 5.1.05 Servicios Básicos, 5.1.06 Publicidad, 5.1.07 Transporte, 5.1.08 Otros Gastos, 5.1.09 Diferencia cambiaria negativa.
4. **¿Cómo manejar bancos como cuenta hija?**
   Hoy `BankAccount` es entidad separada. Cuando se cree un nuevo banco, ¿se crea automáticamente una sub-cuenta hoja bajo 1.1.03 Bancos? **Recomendación: sí, con código autogenerado `1.1.03.NN`** y `BankAccount.chartAccountId` que apunte a la cuenta hoja.
5. **Granularidad de las cuentas de CxC y CxP:**
   ¿Una sola cuenta "Clientes" o subcuenta por cliente? Las PYMEs guatemaltecas suelen usar **cuenta única** + reporte auxiliar (aging). **Recomendación: cuenta única, reporte de aging desde Fase 17.**
6. **¿Migrar `AccountingEntry` histórico o cerrar período al cutover?**
   - Opción A (segura): bloquear cualquier `AccountingEntry` previo a una fecha N, crear un asiento de apertura el día N que refleje balances actuales (CxC, CxP, banco, inventario, capital).
   - Opción B (limpia): migrar cada `AccountingEntry` a un `JournalEntry` con regla automática:
     - INCOME → DR `1.1.01 Caja` / CR `4.1.01 Ventas` (cuando `referenceType == 'SALE'`) o `4.1.02 Otros Ingresos` (resto).
     - EXPENSE → DR la cuenta correspondiente / CR `1.1.01 Caja` (mapeo por categoría → cuenta).
     - Transferencias → DR banco destino / CR banco origen.
   - **Recomendación:** A para empresas con > 1000 entries históricos (riesgo); B para las que tienen pocos. El plan asume B sin condicionar — agregar el flag de fallback.

## Validación del plan de Fase 14

### Lo que el plan acierta

- Alcance correcto: ChartOfAccount + Journal + JournalLine + AccountingPeriod + reportes.
- Reconoce que hay que migrar los entries históricos (regla de 2 líneas).
- Identifica los reportes nuevos correctos: Balance General, Flujo de Caja, Balance de Comprobación, Libro Diario, Libro Mayor.
- Especifica que la reversa de pago debe generar asiento contrario — coincide con H1/H2.

### Lo que el plan asume y no es 100% cierto

- "Refactor del P&L existente para que lea de `JournalEntry` por tipo de cuenta, no de la columna `type` legacy." → El P&L actual también lee `Sale` y `SaleItem` para COGS, no solo `AccountingEntry`. Cuando se mueva COGS a un asiento DR Costo de Ventas / CR Inventario (planeado para Fase 15), el P&L debe reescribirse para no duplicar.
- "Migrar todos los `AccountingEntry` actuales a `JournalEntry` con 2 líneas (regla automática)" → No define qué cuenta hoja se usa por categoría. Hay ~12 categorías legacy. Es necesario un mapping table en código o en migración SQL. **Adjuntar el mapping al inicio de la fase.**
- El plan no menciona el endpoint `POST /api/accounting` de entrada manual ni el dashboard `/accounting/page.tsx` que ya existen. Hay que confirmar que la entrada manual ahora pida líneas y que el dashboard muestre asientos como cabezera + líneas plegables.

### Lo que el plan deja fuera y debería incluir

- **Reversa de cobros/pagos (H1, H2)** debe quedar mencionada explícitamente en los entregables. Hoy es bug crítico.
- **Anulación de venta y compra** (H3) — el plan delega a Fase 20 "anulación reversa el ingreso original (asiento contrario con misma cuenta), no crea un EXPENSE paralelo". Pero si Fase 14 introduce el motor de asientos, debería arreglar el patrón en el refactor de Fase 14 — no esperar a Fase 20. **Mover este fix a Fase 14.**
- **Asientos fuera de `$transaction` (H4)** en `purchases/route.ts`, `pos/expense/route.ts`, `customers/[id]/payments/route.ts` — Fase 14 inevitablemente los toca al refactorizar el helper. Aprovechar para meterlos adentro.
- **Llamada a `initializeAccountingCategories` (renombrada a `initializeChartOfAccounts`)** desde `onboarding/route.ts` y `admin/companies/route.ts`. Sin esto, cada empresa nueva arranca sin plan de cuentas.
- **Decisiones contables abiertas** (sección anterior) deben resolverse antes de codificar.

### Riesgos

- **Riesgo alto:** consistencia de datos durante la migración. Si un tenant tiene `AccountingEntry` con `categoryId` apuntando a una categoría que ya no existe (porque alguien la borró duro alguna vez), el mapping falla. **Mitigación:** correr un audit query antes de la migración para identificar huérfanos.
- **Riesgo medio:** rendimiento. `summary` y `profit-loss` hoy hacen `groupBy` simple. Con el nuevo schema (`JournalEntry` 1-N `JournalLine`), `groupBy` por cuenta requiere join. Asegurar índices.
- **Riesgo bajo:** UI rota. Solo hay una página (`/accounting`) que consume estos endpoints. Bien acotado.

## Recomendaciones específicas para Fase 14

1. **Empezar por las decisiones contables** (sección "Decisiones abiertas") — sin esto, todo lo demás es bikeshedding.
2. **Diseñar el schema con espacio para Fase 15, 16, 18:**
   - `JournalLine.costCenterId String?` (futuro)
   - `JournalLine.taxRate Decimal?` (futuro Fase 16)
   - `JournalEntry.fiscalDocumentId String?` (futuro NCRE/NDEB/Factura)
   - `JournalEntry.posted Boolean @default(false)` + `postedAt` (permite "draft" antes del posting; útil para reportes y cierre).
3. **Helper API propuesto:**
   ```ts
   await createJournalEntry(tx, {
     companyId, branchId, date, description, userId,
     referenceType: 'SALE', referenceId: sale.id,
     lines: [
       { accountCode: '1.1.01', debit: total, credit: 0 },  // Caja
       { accountCode: '4.1.01', debit: 0, credit: subtotal }, // Ventas
       { accountCode: '2.1.02', debit: 0, credit: tax },      // IVA Débito (0 hasta Fase 16)
     ],
   });
   ```
   El helper resuelve el `accountCode` → `accountId`, valida `isPosting`, valida `Σ DR == Σ CR` con tolerancia 0.005, y valida que el período `date` esté `OPEN`.
4. **Plan de migración SQL en dos fases:**
   - Fase A: crear `ChartOfAccount`, `JournalEntry`, `JournalLine`, `AccountingPeriod`. Sembrar cuentas. Crear período actual abierto.
   - Fase B (en otra migración): generar `JournalEntry`/`JournalLine` por cada `AccountingEntry` legacy, marcar `AccountingEntry.migrated = true` (campo temporal). Validar suma DR==CR por empresa. Cuando esté OK, en una fase posterior, dropear `AccountingEntry` y `AccountingCategory` (Fase 25 o cleanup).
5. **Reportes nuevos a priorizar dentro de Fase 14:**
   1. Trial Balance (más simple, validación inmediata DR==CR).
   2. General Journal (lectura cruda).
   3. General Ledger (filtro por cuenta).
   4. Balance Sheet (requiere clasificar cuentas por tipo).
   5. Cash Flow (más complejo — requiere clasificar entre operativo/inversión/financiamiento). **Considerar versión simplificada en Fase 14 y refinarla en Fase 22.**
6. **Incluir un endpoint de auditoría:** `GET /api/accounting/integrity-check` que devuelva (a) entries con `Σ DR ≠ Σ CR`, (b) balance general no cuadrado por período, (c) cuentas hoja con `isPosting = false` que reciben asientos. Útil para QA continuo y para el dueño al cerrar período.
7. **Mover `AccountingEntry.amount` y `JournalLine.debit/credit` a `Decimal(15, 2)`** para alinearse con el resto del schema.
8. **Eliminar nombres mágicos**: definir `const ACCOUNTS = { CASH: '1.1.01', AR: '1.1.04', SALES: '4.1.01', VAT_OUTPUT: '2.1.02', ... }` en `src/lib/accounting.ts` y consumirlo desde todos los call sites. Sin esto, el próximo desarrollador volverá a hardcodear.
9. **Resolver H1-H4 en Fase 14**, no diferir a Fase 20. Cada uno es ~30 líneas de código adicional una vez que el motor está listo.
10. **No tocar el endpoint `summary`** más allá de adaptar los nombres de campos. Su valor de uso (dashboard rápido) no requiere balance general formal. Mantener como "vista operativa" y agregar Balance Sheet como vista contable.

## Estimación de esfuerzo y riesgos

| Subtarea | Esfuerzo | Riesgo |
|---|---|---|
| Schema + migración inicial + seed de plan de cuentas | 0.5 día | Bajo |
| Helper `createJournalEntry` + validador + tests | 0.5 día | Bajo |
| Refactor de 11 call sites + fixes H1-H4 | 1.5 días | Medio (testing manual de cada flujo) |
| Endpoints de reportes (5 nuevos) | 1.5 días | Bajo |
| Migración de datos `AccountingEntry → JournalEntry` + audit | 1 día | **Alto** (tenants con datos sucios) |
| Dashboard refactor (modelo viejo → nuevo) | 0.5 día | Bajo |
| QA: validación de balance, partida doble, cierre de período | 0.5 día | Medio |
| **Total** | **6 días-persona** | Medio |

**Riesgos transversales:**

- Si las decisiones contables abiertas se atrasan, **toda la fase se atrasa**.
- Si se decide migración Opción B y un tenant tiene `AccountingEntry` con categorías no mapeables, hace falta intervención manual antes de correr la migración. **Mitigación:** correr `integrity-check` previo y reportar tenants problemáticos.
- El cambio rompe el contrato del endpoint `GET /api/accounting` (de "listar entries planos" a "listar journal entries con líneas"). El dashboard `/accounting/page.tsx` y cualquier cliente externo (¿hay?) deben actualizarse. **Mitigación:** mantener `GET /api/accounting/entries-legacy` durante 1 ciclo de release que devuelva la vista plana, o renombrar el endpoint a `/api/accounting/journal` y actualizar el dashboard en la misma fase.
- Riesgo de bugs sutiles en signos. Recomendación: tests unitarios obligatorios para:
  - "Una venta de Q1,000 produce DR Caja 1000 / CR Ventas 1000 (sin IVA en Fase 14)."
  - "Anulación de esa venta produce DR Ventas 1000 / CR Caja 1000."
  - "Migración de un `AccountingEntry` INCOME de Q500 → JournalEntry con 2 líneas que suman 0."
  - "Intento de crear JournalEntry con Σ DR ≠ Σ CR retorna error."
  - "Intento de crear JournalEntry en período CLOSED retorna 409."

---

**Conclusión:** El plan de Fase 14 es correcto en concepto y alcance. Necesita ajustes menores: incluir explícitamente el fix de reversa de pagos (H1, H2), el fix de anulación venta/compra (H3, hoy diferido a Fase 20), poner los call sites de `purchases`/`pos/expense`/`customers/payments` dentro de `$transaction` (H4), llamar `initializeAccountingCategories` desde onboarding (H5), y resolver las 6 decisiones contables abiertas antes de codificar. Volumen del refactor manejable (14 sitios). 4-6 días.
