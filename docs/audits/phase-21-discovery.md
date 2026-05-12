# Fase 21 · Discovery · Tesorería y Multi-moneda

Fecha: 2026-05-11
Auditor: subagente cash management / tesorería
Modo: READ-ONLY. Auditoría del estado actual antes de Fase 21
(Multi-moneda + ExchangeRate + diferencia cambiaria).

Plan referenciado: `docs/audits/phase-13-erp-real-plan.md` (sección Fase 21).

---

## 0. Resumen ejecutivo

- **Existe el campo `currency`** en `BankAccount` (`@default("GTQ")`) y en
  `CompanySettings` (`currency` + `currencySymbol`). **No** existe en
  `Sale`, `PurchaseOrder`, `Payment`, `SupplierPayment`, `AccountPayment`,
  `SupplierPayable`, `Customer` ni `Supplier`.
- **No existe** ningún modelo `ExchangeRate`, ni tabla de tipos de cambio,
  ni snapshot `exchangeRate` en ningún documento. Cero infraestructura
  multi-moneda real. La columna `currency` es decorativa.
- **Validación de saldo bancario:** existe en transferencias
  (`/api/accounting/banks/transfer`) pero **NO** en pagos a proveedores
  (`/api/accounting/payables/[id]/payments`) — el código tiene un
  comentario que lo confirma:
  > "We will allow it for now, but deduct it in BankTransaction"
  Esto permite que el saldo de la cuenta bancaria quede en negativo.

- **Top 3 gaps de Fase 21 sobre la tesorería actual:**
  1. **No hay snapshot de tipo de cambio en documentos.** Cualquier
     refactor que agregue `exchangeRate` debe tocar Sale/PurchaseOrder
     /Payment/SupplierPayment + handlers de creación y reverso.
  2. **Transferencia entre cuentas no contempla conversión.** El endpoint
     `transfer` asume misma moneda implícitamente (decrementa e incrementa
     el mismo `amount`).
  3. **Asiento contable es de una sola línea (AccountingEntry simple).**
     Para registrar diferencia cambiaria se necesita partida doble real
     (Fase 14, pre-requisito). Hoy `createAccountingEntry` crea una sola
     fila tipada INCOME/EXPENSE; no permite cuadrar débito ≠ crédito.

---

## 1. Estado actual de "currency" en el dominio

### Schema (`prisma/schema.prisma`)

| Modelo            | Campo          | Default | Notas                                |
| ----------------- | -------------- | ------- | ------------------------------------ |
| `CompanySettings` | currency       | "GTQ"   | string libre, no enum                |
| `CompanySettings` | currencySymbol | "Q"     | usado solo en formateo de UI         |
| `BankAccount`     | currency       | "GTQ"   | string libre, validado a 3 letras en POST |

**No tienen campo `currency`:** `Sale`, `PurchaseOrder`, `Payment`,
`SupplierPayment`, `AccountPayment`, `SupplierPayable`, `Customer`,
`Supplier`, `Product`, `BankTransaction`, `AccountingEntry`,
`CashRegister`, `CashRegisterTransaction`, `Employee`, `Payroll`,
`JournalEntry` (todavía no existe — depende de Fase 14).

### Código

- `src/app/api/accounting/banks/route.ts` valida `currency` ISO de 3
  letras con default `"GTQ"` (Zod). Es el único endpoint que registra
  algo de moneda.
- `src/app/api/accounting/banks/[id]/route.ts` permite actualizar
  `currency` sin validar que no rompa transacciones históricas.
- `src/components/accounting/BankModal.tsx` ofrece `GTQ | USD` como
  combo.
- `src/app/(dashboard)/settings/page.tsx` ofrece `GTQ | USD` para la
  moneda de la empresa.
- Cero referencias a "exchangeRate", "tipoCambio", "ExchangeRate" en
  todo `src/`. Solo aparece en el plan Fase 21.

**Conclusión:** la noción de moneda hoy es cosmética. Una cuenta
"USD" se mueve aritméticamente igual que una "GTQ" — sumando montos
crudos sin conversión.

---

## 2. `BankAccount` y `BankTransaction`

### `BankAccount`
- Campos: `id`, `companyId`, `name`, `type` (AccountType:
  CASH_BOX/BANK_ACCOUNT/CREDIT_CARD/DIGITAL_WALLET), `accountNumber`,
  `currency`, `balance Decimal(15,2)`, `isActive`, `createdAt`,
  `updatedAt`.
- `balance` es **materializado**: se incrementa/decrementa con cada
  pago/cobro/transferencia. No se recalcula desde transactions.
- Riesgo: si una operación crea `BankTransaction` pero olvida actualizar
  `BankAccount.balance` (o viceversa), el saldo queda desincronizado.
  No hay reconciliador.

### `BankTransaction`
- Campos: `id`, `bankAccountId`, `userId`, `type` (AccountingType:
  INCOME/EXPENSE), `amount`, `reference`, `description`,
  `reconciled Boolean @default(false)`, `createdAt`.
- **No tiene `referenceType`/`referenceId`** propios para vincular al
  documento origen (pago, venta, anulación). El vínculo se hace
  indirectamente vía `AccountingEntry.bankTransactionId`.
- No tiene `currency` ni `exchangeRate`. Hereda la moneda de la cuenta.
- `reconciled` está expuesto pero **ningún endpoint lo cambia hoy**. La
  reconciliación bancaria no está implementada.

### Transferencias (`/api/accounting/banks/transfer`)
- Valida que existan ambas cuentas, mismo `companyId`, ambas activas.
- Valida `sourceBank.balance >= amount`. **Único punto del sistema con
  validación de saldo real.**
- Decrementa origen, incrementa destino, crea 2 `BankTransaction` y 2
  `AccountingEntry` (compensatorios).
- **NO valida que `sourceBank.currency === targetBank.currency`** —
  hoy hace transferencia "USD a GTQ" tratándolas como equivalentes.
  Esto será un bug claro al activar Fase 21.

---

## 3. `CashRegister` y `CashRegisterTransaction`

### Apertura y cierre (`/api/cash-register/route.ts`)
- `POST` abre turno con `openingBalance`. Rechaza si el usuario ya
  tiene un turno OPEN.
- `PUT` cierra:
  - calcula `cashPayments` (Payments method=CASH de Sale.payments del
    turno),
  - calcula `cashAbonos` (AccountPayment.method=CASH del turno),
  - calcula `totalExpenses` (CashRegisterTransaction de cualquier tipo),
  - `expectedCash = opening + cashPayments + cashAbonos - totalExpenses`,
  - rechaza si `|declared - expected| > 0.05`.

  **Bug menor:** el sumatorio de `totalExpenses` no discrimina por
  `PayoutType` (EXPENSE/WITHDRAWAL/REFUND). Esto está bien para el
  cuadre matemático, pero el reporte de cierre no separa motivos.

### `CashRegisterTransaction`
- Solo tipos `EXPENSE` (gasto operativo), `WITHDRAWAL` (retiro),
  `REFUND` (devolución). No registra ingresos: los ingresos vienen de
  Sale.payments + AccountPayment indirectamente.
- **No tiene `currency`**. Se asume implícitamente GTQ.

### Diferencia conceptual

- `CashRegister` = turno de cajero (apertura/cierre con cuadre).
- `CashRegisterTransaction` = movimientos manuales dentro del turno
  (gastos pequeños, retiros, devoluciones en efectivo).
- `BankAccount` con type `CASH_BOX` = caja contable de la empresa
  (efectivo no asociado a un turno).
- **Hoy ambas cosas conviven sin estar enlazadas.** Cerrar un turno
  no mueve dinero a un `BankAccount` tipo CASH_BOX. El efectivo
  recolectado queda "flotando" sin asiento de transferencia.

---

## 4. `AccountPayment` vs `Payment` vs `SupplierPayment`

| Modelo            | Para qué                          | Documento padre            | Banco                  |
| ----------------- | --------------------------------- | -------------------------- | ---------------------- |
| `Payment`         | Pago al momento de venta POS      | `Sale`                     | `bankAccountId?`       |
| `AccountPayment`  | Abono posterior a saldo de cliente (CxC) | `Customer`           | `bankAccountId?`       |
| `SupplierPayment` | Abono a CxP (proveedor)           | `SupplierPayable`          | `bankAccountId?`       |

- Los tres tienen `method PaymentMethod` (CASH/CARD/TRANSFER, +CREDIT en
  Payment).
- Los tres soportan `status: COMPLETED | VOID` (string, no enum).
- Ninguno tiene `currency` ni `exchangeRate`.

### Endpoints relevantes

- `POST /api/sales` — crea Sale + Payment(s) + BankTransaction(s).
- `POST /api/accounting/receivables/[customerId]/pay` — crea
  AccountPayment + BankTransaction + AccountingEntry. **Requiere
  `bankAccountId`**. Bien.
- `POST /api/customers/[id]/payments` — crea AccountPayment **sin
  BankTransaction y sin BankAccount.balance update**. Solo crea el
  AccountPayment y la AccountingEntry. Es decir, si llega un abono CARD
  o TRANSFER por este endpoint, el banco nunca se entera.
- `POST /api/customers/[id]/pay` — **hardcoded method=CASH**, no crea
  BankTransaction, no crea AccountingEntry. Solo AccountPayment +
  decremento de Customer.balance. Endpoint redundante con
  `/customers/[id]/payments` pero peor.
- `POST /api/accounting/payables/[id]/payments` — crea SupplierPayment
  + BankTransaction + AccountingEntry. **No valida saldo bancario**
  (comentario explícito en el código). Permite balance negativo.
- `POST /api/accounting/payables/payments/[paymentId]/reverse` —
  reversa correctamente (incrementa banco, decrementa paidAmount).
- `POST /api/accounting/receivables/payments/[paymentId]/reverse` —
  idem, decrementa banco e incrementa Customer.balance.

---

## 5. Bugs y gaps identificados en tesorería actual

| # | Severidad | Archivo | Descripción |
|---|-----------|---------|-------------|
| T-1 | **Alta** | `api/customers/[id]/payments/route.ts` | Acepta `method: CASH \| CARD \| TRANSFER` pero **nunca crea BankTransaction ni actualiza BankAccount.balance** para CARD/TRANSFER. El banco nunca recibe el dinero contablemente. |
| T-2 | **Alta** | `api/customers/[id]/pay/route.ts` | Endpoint paralelo redundante. Hardcodea `method: 'CASH'`, no crea BankTransaction ni AccountingEntry. Debe eliminarse o unificarse con `/payments`. |
| T-3 | **Alta** | `api/sales/[id]/return/route.ts` | SaleReturn **no reversa ningún BankTransaction, CashRegisterTransaction ni AccountingEntry**. Solo regresa stock y descuenta saldo CREDIT. Una devolución CARD/TRANSFER queda como ingreso permanente al banco. |
| T-4 | **Media** | `api/accounting/payables/[id]/payments/route.ts` | No valida saldo de la cuenta bancaria. Permite que `BankAccount.balance` quede negativo. Pago a proveedor de Q50k desde cuenta con Q1k pasa. |
| T-5 | **Media** | `api/accounting/banks/transfer/route.ts` | No valida `source.currency === target.currency`. Transferir entre cuenta USD y cuenta GTQ ejecuta sin conversión. Crítico antes de Fase 21. |
| T-6 | **Media** | `prisma/schema.prisma` (`BankTransaction`) | Falta `referenceType`/`referenceId` directos. El vínculo a Sale/Payment/SupplierPayment/AccountPayment se hace solo vía `AccountingEntry.bankTransactionId`, lo que dificulta el conciliador. |
| T-7 | **Media** | `prisma/schema.prisma` (`BankAccount.balance`) | Saldo materializado sin job de reconciliación. Si una operación falla parcialmente fuera de `$transaction`, queda drift. No hay endpoint `/api/accounting/banks/[id]/reconcile`. |
| T-8 | **Media** | `api/cash-register/route.ts` (cierre) | No transfiere el efectivo a un `BankAccount` tipo `CASH_BOX` al cerrar turno. El cash recolectado no aparece en ningún balance bancario. |
| T-9 | **Media** | `api/accounting/banks/[id]/route.ts` (PATCH) | Permite cambiar `currency` de una cuenta con transacciones históricas. Inconsistente. Debería bloquearse si `_count.transactions > 0`. |
| T-10 | **Baja** | `BankTransaction.type` | Usa `AccountingType` (INCOME/EXPENSE) en lugar de un enum propio de banco (DEPOSIT/WITHDRAWAL/TRANSFER_IN/TRANSFER_OUT/FEE/INTEREST). Limita reportería. |
| T-11 | **Baja** | `AccountPayment` y `SupplierPayment` | `status` como `String` libre ("COMPLETED" \| "VOID") en lugar de enum. Riesgo de typo. |
| T-12 | **Baja** | `BankTransaction.reconciled` | Campo expuesto pero ningún endpoint cambia el flag. Funcionalidad muerta. |

---

## 6. Validación del plan Fase 21

El plan Fase 21 propone:

1. **Modelo `ExchangeRate (currency, rate, date, source)`**
2. **Campo `currency` en Sale/PurchaseOrder/Payment/BankAccount**
3. **Snapshot `exchangeRate` en cada documento**
4. **Conversión a moneda funcional para reportes**
5. **Diferencia cambiaria al cobrar (asiento contable)**
6. **Transferencias entre cuentas de distinta moneda con conversión**

### Refactor que implica

- **Schema** (migración no trivial):
  - Nuevo modelo `ExchangeRate` con índice `(currency, date)` único o
    al menos `@@index`.
  - Agregar `currency String @default("GTQ")` y
    `exchangeRate Decimal @default(1)` a: `Sale`, `Payment`,
    `PurchaseOrder`, `SupplierPayment`, `AccountPayment`,
    `SupplierPayable`, `BankTransaction`, `CashRegisterTransaction`,
    `AccountingEntry`/`JournalEntry`, posiblemente `Customer` y
    `Supplier` (moneda por defecto del tercero).
  - Backfill: todas las filas existentes ⇒ currency="GTQ",
    exchangeRate=1.
  - Considerar `functionalAmount Decimal` calculado y persistido
    (snapshot a moneda funcional) o calcularlo en queries — recomiendo
    persistir para reportes consolidados rápidos.
- **Endpoints a refactorizar:**
  - `POST /api/sales` — debe leer ExchangeRate del día, snapshot.
  - `POST /api/accounting/receivables/[customerId]/pay` — debe calcular
    diferencia cambiaria entre exchangeRate de la venta original y el
    del día del cobro, generar asiento.
  - `POST /api/accounting/payables/[id]/payments` — idem para CxP.
  - `POST /api/accounting/banks/transfer` — validar moneda. Si
    distintas, requerir `targetAmount` o `exchangeRate` explícito,
    generar asientos compensados.
  - `POST /api/purchases` — snapshot exchangeRate.
  - Reportes (P&L, Balance, Flujo de Caja, libros tributarios SAT) —
    convertir a moneda funcional para consolidar.
- **Dependencias duras:**
  - Fase 14 (partida doble + JournalEntry) — **bloqueante**: sin
    partida doble es imposible registrar diferencia cambiaria
    correctamente (necesitas DR cliente / CR ventas / CR/DR diferencia).
    Hoy `AccountingEntry` es uni-línea.
  - Fase 17 (CxC/CxP con dueDate) — sin esto el snapshot al emitir
    factura vs al cobrar no tiene sentido porque no hay flujo de cobro
    diferido formal.
  - Fase 20 (ventas enterprise con QUOTE/ORDER/INVOICED) — para fijar
    en qué punto del flujo se snapshot el tipo de cambio.

### Tareas que el plan Fase 21 omite y deberían añadirse

- **Pre-flight: corregir los bugs T-1, T-2, T-3 antes de tocar
  multi-moneda.** Si T-1/T-3 se quedan, agregar exchangeRate no arregla
  nada — el banco ya no se entera de la transacción.
- **Job de reconciliación de saldos** (T-7): correr antes y después de
  la migración para verificar `sum(BankTransaction.signedAmount) ==
  BankAccount.balance`. Si no cuadra hoy, multi-moneda lo empeora.
- **Validación de moneda en transferencia** (T-5) — preferiblemente
  agregar antes de Fase 21 como fix.
- **`exchangeRate` mínimo histórico al backfill** — definir el tipo
  oficial del día para todas las filas pre-migración. Sin esto, los
  reportes consolidados pre-multi-moneda van a mentir.
- **Política de redondeo monetario explícita** — `Decimal(15,2)` ahora;
  cuando hagas multiplicaciones `amount * exchangeRate`, definir
  redondeo bancario y dónde se persiste el residuo.
- **Política de cambio de currency en BankAccount** (T-9): bloquear si
  ya hay transacciones. Documentar.
- **Reconciliación bancaria** (T-12): aprovechar la fase para activar
  `reconciled` con endpoint dedicado. Sin esto, el conciliador no
  existe y multi-moneda lo necesita más que mono-moneda.

---

## 7. Recomendaciones priorizadas

### P0 — Hacer antes de Fase 21 (incluir en Fase 24 hardening si no se
adelanta)
- Fix T-1: agregar BankTransaction + balance update en
  `/api/customers/[id]/payments` para CARD/TRANSFER.
- Fix T-2: eliminar (o redirigir) `/api/customers/[id]/pay` — endpoint
  redundante con bugs.
- Fix T-3: SaleReturn debe reversar BankTransaction/CashRegisterTx +
  generar asiento contable contrario.
- Fix T-4: validar saldo bancario en payable payment (o permitirlo
  con flag explícito `allowOverdraft`).
- Fix T-5: validar misma moneda en transfer (temporal, hasta Fase 21).

### P1 — Pre-requisitos duros de Fase 21
- Esperar Fase 14 cerrada (partida doble) — la diferencia cambiaria
  pide DR/CR balanceados.
- Esperar Fase 17 (dueDate en Sale) — define el snapshot al emitir.
- Hacer Fase 21 sobre Fase 20 (ventas enterprise) — para snapshot en
  QUOTE/ORDER/INVOICED.

### P2 — Dentro de Fase 21
- Modelo `ExchangeRate` con `(currency, date)` único, fuente
  enumerada (BANGUAT/MANUAL/API_X).
- Campo `currency` + `exchangeRate` (Decimal(18,8)) +
  `functionalAmount` (Decimal(15,2)) en cada documento monetario.
- Endpoint `GET /api/accounting/exchange-rates?date=&currency=`.
- Endpoint `POST /api/accounting/exchange-rates` manual.
- Endpoint reconciliación bancaria (`reconciled` flag).
- Reverso de SaleReturn alineado con nueva mecánica de exchangeRate.
- Tests:
  - factura USD 100 a 7.80, cobrada a 7.85 ⇒ asiento de diferencia
    cambiaria +0.05*100 = Q5;
  - transferencia USD→GTQ con exchangeRate explícito (genera
    diferencia entre `sourceAmount*rate` y `targetAmount`);
  - reporte P&L consolidado en GTQ con ventas mixtas.

### P3 — Fuera de alcance Fase 21 pero deseable
- Tabla `CurrencyRounding` policy por empresa.
- Job nocturno BANGUAT scraper (o manual desde UI).
- Reconciliador automático `sum(BankTransaction) ≟ BankAccount.balance`.

---

## 8. Conclusión

La tesorería de SIMTECH **funciona en mono-moneda GTQ con bugs
silenciosos significativos** (T-1, T-2, T-3) que cualquier refactor de
multi-moneda heredará. La columna `currency` ya existe en `BankAccount`
y `CompanySettings` pero no se respeta operativamente.

**Fase 21 es viable** pero **no debe iniciarse hasta cerrar Fase 14**
(partida doble) **y arreglar T-1/T-3/T-5** que rompen la integridad
banco↔documento incluso en mono-moneda. Hacer multi-moneda sobre la
base actual amplificaría los gaps en lugar de resolverlos.

---

## Apéndice A · Archivos auditados

```
prisma/schema.prisma
src/app/api/accounting/banks/route.ts
src/app/api/accounting/banks/[id]/route.ts
src/app/api/accounting/banks/[id]/transactions/route.ts
src/app/api/accounting/banks/transfer/route.ts
src/app/api/cash-register/route.ts
src/app/api/cash-register/history/route.ts
src/app/api/sales/route.ts
src/app/api/sales/[id]/route.ts
src/app/api/sales/[id]/return/route.ts
src/app/api/customers/[id]/payments/route.ts
src/app/api/customers/[id]/pay/route.ts
src/app/api/accounting/receivables/[customerId]/pay/route.ts
src/app/api/accounting/receivables/payments/[paymentId]/reverse/route.ts
src/app/api/accounting/payables/[id]/payments/route.ts
src/app/api/accounting/payables/payments/[paymentId]/reverse/route.ts
src/app/api/settings/route.ts (referencia)
src/components/accounting/BankModal.tsx (referencia)
src/app/(dashboard)/settings/page.tsx (referencia)
docs/audits/phase-13-erp-real-plan.md (sección Fase 21)
docs/audits/phase-11-erp-completeness.md
```
