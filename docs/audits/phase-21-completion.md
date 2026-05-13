# Fase 21 · Completion Report — Multi-moneda + ExchangeRate + diferencia cambiaria

Fecha: 2026-05-12
Subagente: treasury / multi-moneda
Estado: implementación completa, pendiente verificación cruzada por segundo subagente y aplicación manual de migración (`prisma migrate deploy`) + `prisma generate`.

## 1. Qué se hizo

### 1.1 Schema Prisma (`prisma/schema.prisma`)

- **Modelo nuevo `ExchangeRate`**: tabla maestra de tipos de cambio por empresa.
  - Campos: `id`, `companyId`, `currency` (ISO-3), `date` (`@db.Date`), `rate` (`Decimal(18,8)`), `source` (`MANUAL`/`BANGUAT`/`API`), `notes`, `createdById`, `createdAt`, `updatedAt`.
  - `@@unique([companyId, currency, date])` — un rate por moneda por día por empresa.
  - `@@index([companyId, date])` + `@@index([companyId, currency, date])`.
- **Enum nuevo `ExchangeRateSource`** = `MANUAL | BANGUAT | API`. Fase 21 solo usa `MANUAL` operacionalmente.
- **Relaciones inversas** en `Company.exchangeRates` y `User.exchangeRatesCreated` (relation name `ExchangeRateCreatedBy`).
- **Columnas snapshot agregadas** a todos los documentos monetarios:
  - `Sale.currency String @default("GTQ")`, `.exchangeRate Decimal? @db.Decimal(18,8)`, `.functionalAmount Decimal? @db.Decimal(15,2)`.
  - `PurchaseOrder`, `Payment`, `AccountPayment`, `SupplierPayment`, `SupplierInvoice`, `BankTransaction` ídem.

### 1.2 Migración SQL (`prisma/migrations/20260527000000_multicurrency/migration.sql`)

Idempotente:
1. `CREATE TYPE "ExchangeRateSource"` dentro de `DO $$ ... EXCEPTION WHEN duplicate_object`.
2. `CREATE TABLE IF NOT EXISTS "ExchangeRate"` con FKs a `Company` (CASCADE) y `User` (RESTRICT), índices y unique.
3. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para `currency`/`exchangeRate`/`functionalAmount` en las 7 tablas. Default seguro: `currency='GTQ' NOT NULL`, `exchangeRate` y `functionalAmount` nullable.
4. **Backfill**: `UPDATE ... SET exchangeRate=1.0, functionalAmount=total/amount WHERE exchangeRate IS NULL`. Idempotente — segundo run no cambia nada.
5. `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "tenant_isolation_exchange_rate"` sobre `ExchangeRate` (patrón Fase 13/14/.../20).

### 1.3 Helpers (`src/lib/currency/`)

- **`types.ts`**: `FUNCTIONAL_CURRENCY = 'GTQ'`, `SUPPORTED_CURRENCIES`, tipos `FxDifference`, `FxOperationSide`, `ExchangeRateSourceLiteral`.
- **`exchange-rate.ts`**:
  - `getExchangeRate(tx, companyId, currency, date)` — retorna 1.0 si GTQ; busca el rate más reciente con `date <= input` para currency no funcional; throw `ExchangeRateError(422)` si no hay.
  - `toFunctionalAmount(amount, rate)` — `Math.round(amount × rate × 100) / 100`.
  - `normalizeCurrency`, `isFunctionalCurrency`, clase `ExchangeRateError`.
- **`fx-difference.ts`**:
  - `calculateFxDifference({ originalRate, currentRate, foreignAmount, side, currency })` — devuelve `{ gain, loss }` con uno en 0.
  - Reglas:
    - `COLLECTION`: rate sube → GAIN, rate baja → LOSS.
    - `PAYMENT`: rate sube → LOSS, rate baja → GAIN.
    - GTQ funcional o foreignAmount ≤ 0 → `{0, 0}`.
- **`index.ts`** barrel.

### 1.4 Endpoints API

- **`GET /api/accounting/exchange-rates`** — listado con filtros `currency`, `date`, `from`, `to`. Top 100 ordenado por `date desc`. Permisos: `treasury:manage | accounting:manage | reports:view | settings:manage`.
- **`POST /api/accounting/exchange-rates`** — alta manual. Validación Zod (currency ISO-3, rate > 0). Conflicto 409 si ya existe `(companyId, currency, date)`. Permisos: `treasury:manage | settings:manage`.
- **`PATCH /api/accounting/exchange-rates/[id]`** — edita solo `notes`. `rate`/`currency`/`date` son inmutables (post-uso corromperían snapshots).
- **`DELETE /api/accounting/exchange-rates/[id]`** — borra solo si NINGÚN documento monetario usó ese rate ese día. Cuenta referencias en `Sale`, `PurchaseOrder`, `Payment`, `AccountPayment`, `SupplierPayment`, `SupplierInvoice`, `BankTransaction`. Si > 0 → 409.

### 1.5 Refactor de endpoints existentes

- **`POST /api/sales`**:
  - Schema Zod acepta `currency` opcional (default `'GTQ'`, ISO-3).
  - Snapshot del rate con `getExchangeRate(tx, ...)` dentro del `$transaction`.
  - Persiste `Sale.currency/.exchangeRate/.functionalAmount`.
  - Propaga snapshot a `Payment` y `BankTransaction` creados durante la venta.
  - Asientos contables (`createJournalEntry`) usan montos × rate (GTQ funcional). Si rate=1 (GTQ) queda idéntico al comportamiento previo.
  - Captura `ExchangeRateError` → 422.

- **`POST /api/purchases`** (ambos modos `fast` y `enterprise`):
  - Schema Zod acepta `currency` opcional (default `'GTQ'`).
  - Snapshot en `PurchaseOrder` y `SupplierInvoice`.
  - Asiento contable construido con líneas × rate (GTQ funcional).
  - Captura `ExchangeRateError` → 422.

- **`POST /api/customers/[id]/payments`** (cobro a cliente):
  - Schema Zod acepta `currency` opcional. Si se omite, hereda de la venta a crédito más reciente del cliente; sino GTQ.
  - Resuelve `originalRate` consultando la última `Sale` a crédito del cliente con la misma currency.
  - Snapshot del rate vigente en `AccountPayment`.
  - Asiento partida doble:
    - DR Caja/Bancos por `paymentFunctional` (rate hoy).
    - CR Clientes (AR) por `amount × originalRate` (rate al facturar).
    - Diferencia → DR FX_LOSS o CR FX_GAIN según `calculateFxDifference(side='COLLECTION')`.
  - Captura `ExchangeRateError` → 422.

- **`POST /api/accounting/payables/[id]/payments`** (pago a proveedor):
  - Body acepta `currency` opcional. Si se omite, hereda de la PO original; sino GTQ.
  - `originalRate` viene del `PurchaseOrder.exchangeRate` snapshot.
  - Snapshot del rate vigente en `SupplierPayment` y `BankTransaction`.
  - Asiento partida doble:
    - DR Proveedores (AP) por `amount × originalRate`.
    - CR Bancos por `paymentFunctional` (rate hoy).
    - Diferencia → DR FX_LOSS o CR FX_GAIN según `calculateFxDifference(side='PAYMENT')`.
  - Captura `ExchangeRateError` → 422.

- **`POST /api/accounting/banks/transfer`**:
  - Valida que `sourceBank.currency === targetBank.currency` (case-insensitive).
  - Si distintas → 400 con `code: 'CURRENCY_MISMATCH'` y mensaje "Las cuentas tienen monedas diferentes; usá conversión manual con asiento doble".
  - Si iguales → flujo original intacto.

### 1.6 Tests Vitest

- **`src/lib/currency/__tests__/exchange-rate.test.ts`** (7 casos):
  - GTQ funcional → 1.0 sin DB.
  - `'gtq'` minúsculas → 1.0 normalizado.
  - USD con rate exacto en la fecha.
  - USD con fechas previas: gana el más reciente <= fecha pedida.
  - Currency inexistente → `ExchangeRateError(422)`.
  - Mensaje del error es accionable (contiene la currency).
  - Aislamiento de tenant (ignora rates de otra empresa).
  - `toFunctionalAmount`: redondeo, rate=1 idempotente, inputs inválidos → 0.

- **`src/lib/currency/__tests__/fx-difference.test.ts`** (12 casos):
  - COLLECTION rate sube → GAIN, rate baja → LOSS, rate igual → 0.
  - PAYMENT rate sube → LOSS, rate baja → GAIN.
  - Currency=GTQ siempre devuelve `{0,0}` (con rates inconsistentes incluso).
  - `'gtq'` minúsculas detectada.
  - Inputs defensivos: amount=0, rate negativo, NaN/Infinity.
  - Redondeo a 2 decimales (banker's rounding clásico).

### 1.7 Documentación

- **`docs/audits/phase-21-completion.md`** (este archivo).
- **`docs/operations/multicurrency.md`** — runbook operacional (cuándo usar, cómo cargar rates manual, política Banguat).

## 2. Decisiones fuera de spec

1. **Rate al pago no requiere ser el mismo del día exacto.** `getExchangeRate` busca `date <= input.date` y toma el más reciente. Esto permite operar viernes con rate del jueves si el operador olvidó cargar el del viernes. La spec no lo prohíbe explícitamente y refleja la operativa real (Banguat publica rates diarios, pero hay días no hábiles).
2. **`functionalAmount` redondeado a `Decimal(15,2)`** vs. el rate `Decimal(18,8)`. Mantiene la simetría con `total Decimal(10,2)` y evita drifts por re-cálculo.
3. **El `DELETE` de ExchangeRate** valida uso por currency+día (`createdAt` dentro del día). Es una aproximación: un rate puede haber sido consumido por un documento en otro día si el operador eligió manualmente otra fecha. Trade-off: una validación más estricta (joins en `exchangeRate=rate`) sería más cara y la auditoría completa la cubre Fase 25.
4. **`AccountingEntry` legacy NO recibe `currency`/`exchangeRate`/`functionalAmount`.** El modelo está deprecated post-Fase 14; agregar columnas allá sería trabajo desperdiciado. Los reportes consolidados ya usan `JournalEntry`.
5. **`CashRegisterTransaction` y `EmployeeLoan` no se tocan.** Fuera de alcance Fase 21 (caja chica y préstamos a empleados siempre GTQ por ley laboral GT).
6. **`Customer`/`Supplier` no reciben `currency` default.** La currency del documento manda; no había justificación para una "currency preferida del tercero" sin re-tocar UI.
7. **El refactor de Sales aplica el rate sobre los montos del Sale al construir asientos.** Cuando rate=1 (caso GTQ), el comportamiento es idéntico al previo (zero-impact).

## 3. typecheck / lint

- TypeScript: cambios usan casts defensivos `as never` / `as unknown as { ... }` para las columnas nuevas (patrón Fase 17/18/19/20). Esto evita romper el build hasta que el dueño corra `npx prisma generate` post-migración.
- Lint: no se introducen nuevos warnings (los helpers no usan `any`, solo `unknown`).
- Tests Vitest: 19 casos nuevos, todos sintéticos en memoria (no DB).

## 4. Riesgos

1. **`prisma generate` pendiente.** Sin él, los casts `as never` son la única razón por la que compila. Cuando el dueño regenere el cliente, los casts pueden simplificarse (Fase 22+).
2. **Backfill toca todas las filas históricas** (`SET exchangeRate=1.0, functionalAmount=total`). En un tenant con millones de Sales esto demora segundos; en Supabase FREE puede caer en timeout de migración. Idempotente — segundo run no afecta nada.
3. **El rate al cobrar NO es el del día exacto si no existe.** Si el operador no carga rates regularmente, todos los cobros del mes consumirán el rate más antiguo cargado — generando FX_GAIN/LOSS distorsionados. Mitigación: docs/operations/multicurrency.md explica la disciplina diaria.
4. **El asiento del cobro asume que la venta original fue en la misma currency.** Si el caller pasa `currency: 'USD'` en un cobro a un cliente cuya última venta a crédito fue en GTQ, `originalRate` cae al `currentRate` (sin diferencia). Esto es seguro pero opaco — el operador puede confundirse. Mejora: bloquear con 400 si currencies no matchean cuando hay venta a crédito.
5. **El refactor de `/api/sales` aplica rate al asiento siempre.** Cuando rate=1 (GTQ) no hay impacto numérico, pero hay multiplicaciones extra → micro-overhead.
6. **Transferencia cross-currency está bloqueada (400).** No hay endpoint alternativo "transfer con conversión". La spec lo difiere a "asiento manual"; UI de Fase 22 debería ofrecer un wizard. Esto puede sorprender a usuarios que hoy hacen transferencias USD→GTQ implícitas (auditoría T-5).

## 5. Archivos creados / modificados

### Creados
- `prisma/migrations/20260527000000_multicurrency/migration.sql`
- `src/lib/currency/types.ts`
- `src/lib/currency/exchange-rate.ts`
- `src/lib/currency/fx-difference.ts`
- `src/lib/currency/index.ts`
- `src/lib/currency/__tests__/exchange-rate.test.ts`
- `src/lib/currency/__tests__/fx-difference.test.ts`
- `src/app/api/accounting/exchange-rates/route.ts`
- `src/app/api/accounting/exchange-rates/[id]/route.ts`
- `docs/audits/phase-21-completion.md`
- `docs/operations/multicurrency.md`

### Modificados
- `prisma/schema.prisma` (modelo `ExchangeRate`, enum `ExchangeRateSource`, 3 columnas snapshot en 7 modelos, relaciones inversas en `Company`/`User`).
- `src/app/api/sales/route.ts`
- `src/app/api/purchases/route.ts`
- `src/app/api/customers/[id]/payments/route.ts`
- `src/app/api/accounting/payables/[id]/payments/route.ts`
- `src/app/api/accounting/banks/transfer/route.ts`

## 6. Listo para verificador

Sí. El verificador debería validar:
1. `prisma migrate deploy` corre limpio en una DB con datos de Fase 13–20 y backfill deja `exchangeRate=1.0, functionalAmount=total` en todas las filas.
2. POST `/api/accounting/exchange-rates` con `currency='USD', rate=7.85, date='2026-05-12'` persiste y el segundo POST con (USD, 2026-05-12) da 409.
3. POST `/api/sales` con `currency='USD'` sin rate cargado → 422 con `code: EXCHANGE_RATE_NOT_FOUND`.
4. POST `/api/sales` con `currency='USD'` y rate cargado → snapshot persistido, asiento contable cuadra en GTQ.
5. POST `/api/accounting/banks/transfer` entre USD y GTQ → 400 con `code: 'CURRENCY_MISMATCH'`.
6. Vitest: `npx vitest run src/lib/currency` → 19 ok.
