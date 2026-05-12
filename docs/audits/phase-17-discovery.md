# Fase 17 · Discovery — CxC/CxP con dueDate por documento + aging real

Fecha: 2026-05-11
Auditor: subagente AR/AP (read-only)
Alcance: validar plan de Fase 17 contra el estado real del código antes de
implementar dueDate en Sale, cron OVERDUE, endpoints aging, bloqueo de
venta a crédito y CustomerCredit. La regla del plan es:
"agregar `dueDate` a `Sale` (cuando se vende a crédito) y validar que ya
exista en `SupplierPayable`".

## TL;DR ejecutivo

- **`Sale.dueDate` NO existe** — ni columna, ni cálculo, ni UI. La única
  forma de saber "cuándo vence" una venta a crédito hoy es asumir que
  vence el día de la venta (lo cual no representa nada). El crédito vive
  en `Customer.balance` como número agregado, sin documentos vencibles.
- **`SupplierPayable.dueDate` SÍ existe** y se setea con un default
  hardcoded de `+30 días` en `POST /api/purchases` (no es configurable
  por proveedor, no respeta `creditDays`, no se valida).
- **No hay ningún cron real** en el repo. `OVERDUE` está en el enum
  `PayableStatus` pero ninguna línea de código lo asigna — es un estado
  zombi: la UI lo pinta de rojo pero nunca se llega.
- **No hay reporte de aging** en ningún endpoint. El dashboard solo
  agrega `Customer.balance > 0` y la suma de `SupplierPayable` con
  status PENDING/PARTIAL/OVERDUE — sin buckets por antigüedad.
- **`Customer` solo tiene `creditLimit`** (no `creditDaysDefault`,
  no `maxOverdueDays`). La validación al vender a crédito únicamente
  compara `(currentBalance + creditPaymentAmount) > creditLimit` sin
  considerar mora.
- **No existe `CustomerCredit`** (anticipos). Si un cliente paga antes
  de la venta, hoy se rompe: `AccountPayment` exige `customerId` y la
  ruta `/customers/[id]/pay` rechaza si `customer.balance < amount`.
- **No hay estado de cuenta exportable** (ni PDF ni CSV) por cliente.
- **Volumen de refactor: MEDIO-ALTO** — el modelo de datos cambia
  poco (tres campos en `Sale`, dos en `Customer`, un modelo nuevo
  `CustomerCredit`), pero la lógica que toca es transversal: ventas,
  cobros, devoluciones, anulación, reportes, dashboard y notificaciones.

---

## 1. `Sale` con crédito — ¿hay dueDate?

### Schema actual (`prisma/schema.prisma:362-394`)

```prisma
model Sale {
  id             String        @id @default(uuid())
  companyId      String
  branchId       String
  ...
  subtotal       Decimal       @db.Decimal(10, 2)
  discount       Decimal       @default(0) @db.Decimal(10, 2)
  tax            Decimal       @default(0) @db.Decimal(10, 2)
  total          Decimal       @db.Decimal(10, 2)
  status         SaleStatus    @default(COMPLETED)  // COMPLETED|PENDING|CANCELLED|QUOTE
  channel        SaleChannel   @default(POS)
  createdAt      DateTime      @default(now())
  // 👇 no hay dueDate
  // 👇 no hay paymentMethod (el método vive en Payment[])
  payments       Payment[]
  ...
}
```

### Hallazgos

| Cosa esperada por el plan | Estado real |
|---|---|
| `Sale.dueDate` | **NO existe** |
| `Sale.paymentMethod = CREDIT` | NO existe como campo; el "crédito" se detecta filtrando `Payment.method === 'CREDIT'` (`src/app/api/sales/route.ts:206`) |
| Default de `dueDate` basado en cliente | NO existe |
| `OVERDUE` como `SaleStatus` | NO existe en el enum (`PayableStatus` sí tiene OVERDUE, pero `SaleStatus` no) |

### Cómo se "registra" hoy una venta al crédito

`src/app/api/sales/route.ts:196-237`:

1. Se permite máximo 1 `Payment` con `method='CREDIT'` por venta.
2. Se valida `acceptsCredit` en `CompanySettings`.
3. Se valida que exista `customerId` y `customer.creditLimit > 0`.
4. Se valida `(currentBalance + creditPaymentAmount) <= creditLimit`.
5. Se hace `customer.balance += creditPaymentAmount` (un único saldo
   agregado, sin trazabilidad por documento).
6. La venta queda en `status='COMPLETED'` sin dueDate ni vencimiento.

**Implicación:** hoy no hay forma de decir "la factura X vence el día Y";
solo existe el saldo total del cliente. El plan de Fase 17 obliga a
descomponer ese saldo en facturas con vencimiento individual.

---

## 2. `SupplierPayable.dueDate` — ¿se setea?

### Schema (`prisma/schema.prisma:781-803`)

```prisma
model SupplierPayable {
  ...
  totalAmount   Decimal         @db.Decimal(10, 2)
  paidAmount    Decimal         @default(0) @db.Decimal(10, 2)
  status        PayableStatus   @default(PENDING)  // PENDING|PARTIAL|PAID|OVERDUE
  dueDate       DateTime?
  ...
}
```

`dueDate` ya existe en BD y migración (`prisma/migrations/20260101000000_init/migration.sql:661`).

### Dónde se asigna

- `POST /api/purchases` (`src/app/api/purchases/route.ts:185-199`):
  ```ts
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // Default 30 net days
  await tx.supplierPayable.create({
    data: { ..., dueDate: dueDate }
  });
  ```
  **30 días hardcoded**, no respeta `creditDays` del proveedor (no
  existe ese campo) ni `companySettings`.

- `POST /api/accounting/payables` (`route.ts:62-78`): acepta `dueDate`
  del payload, sin validación de formato ni de "no anterior a hoy".
  Si no se manda, queda `null`.

### Falta

- No hay `Supplier.creditDays` ni `Supplier.creditLimit`.
- No hay validación de "este proveedor ya no tiene cupo".
- Si llega un payable sin `dueDate` (NULL), nunca se cataloga como
  OVERDUE — silenciosamente queda sin vencer.

---

## 3. Cron OVERDUE — ¿existe?

**No existe ningún scheduler en el repo.**

- `package.json` no declara `vercel.json` ni Vercel Cron Jobs.
- No hay rutas tipo `/api/cron/*` ni `/api/jobs/*`.
- `Glob **/cron*` solo devuelve hits dentro de `node_modules` (Sentry).
- `Grep -i cron|schedule` en `src/` solo encuentra menciones casuales
  (literal "scheduled" en docs, "cron" en `lib/observability.ts` de
  Sentry — no es un job).
- No hay GitHub Action programada (no se vio `.github/workflows/cron.yml`).
- No hay `pg_cron` ni `Supabase Edge Function` referenciada.

**Consecuencia operativa:** `PayableStatus = 'OVERDUE'` jamás se
asigna automáticamente. La UI (`src/app/(dashboard)/accounting/payables/page.tsx:32`)
muestra el badge rojo "Vencido", pero ninguna línea de código transita
PENDING/PARTIAL → OVERDUE. El estado solo se podría poner manualmente
con un `UPDATE` directo a BD, cosa que el código nunca hace.

---

## 4. Aging actual — ¿existe reporte?

**No existe ningún endpoint de aging.** Lo más cercano:

- `GET /api/accounting/receivables` (`route.ts`): lista clientes con
  `balance > 0`, ordenado por balance desc. **No agrupa por
  antigüedad de factura.** De hecho ni siquiera hay factura — solo el
  saldo agregado del cliente.
- `GET /api/accounting/payables`: lista payables con filtro por
  status (PENDING/PARTIAL/PAID/OVERDUE) pero **no calcula buckets
  0-30/31-60/61-90/+90** ni considera fecha actual contra dueDate.
- `GET /api/accounting/summary` (`route.ts:42-54`): expone
  `receivables` (suma de `Customer.balance`) y `payables` (suma de
  `totalAmount - paidAmount` de payables no PAID). Es un total
  agregado, sin buckets.

**Grep `aging` en src/ y prisma/: 0 hits.**

El concepto de aging no existe en código; solo aparece en el plan
(`docs/audits/phase-13-erp-real-plan.md`).

---

## 5. `Customer` — ¿creditLimit, creditDays, maxOverdueDays?

### Schema (`prisma/schema.prisma:326-342`)

```prisma
model Customer {
  id              String
  companyId       String
  name            String
  email           String?
  phone           String?
  nit             String?
  address         String?
  creditLimit     Decimal          @default(0) @db.Decimal(10, 2)  // ✅
  balance         Decimal          @default(0) @db.Decimal(10, 2)
  ...
}
```

- `creditLimit` SÍ existe y se valida en `sales/route.ts:226-231`.
- `creditDaysDefault`, `maxOverdueDays`: **no existen**.
- `paymentTerms`, `riskLevel`, `blocked`: tampoco.

### Validación al vender (estado actual)

```ts
// src/app/api/sales/route.ts:226-231
if (creditLimit <= 0) {
    throw new Error(`El cliente ${customer.name} no tiene crédito autorizado.`);
}
if ((currentBalance + creditPaymentAmount) > creditLimit) {
    throw new Error(`El abono excede el límite de crédito de Q${creditLimit.toFixed(2)}.`);
}
```

**No se valida mora.** Un cliente con factura vencida hace 6 meses
puede comprar al crédito mientras `balance + nuevo < creditLimit`. La
Fase 17 propone bloquear si `facturas_vencidas > maxOverdueDays`.

---

## 6. `CustomerCredit` / anticipos — ¿existen?

**No.** Grep `CustomerCredit|anticipo|advance|prepaid|prepayment`
devuelve 0 hits funcionales en `src/`.

### Casos rotos hoy

1. **Cliente quiere pagar antes de la venta:** `AccountPayment` exige
   `customerId` y reduce `balance`. Si `balance === 0`,
   `customers/[id]/pay` y `customers/[id]/payments` rechazan con
   "El abono supera el saldo deudor del cliente" (lines 39-41 y 98-100).
   **No hay forma legal de recibir anticipo.**
2. **Sobre-abono accidental:** mismas rutas rechazan con `400`. El
   exceso no se guarda como crédito a favor.
3. **Nota de crédito a favor del cliente** (devolución sin recompra):
   `SaleReturn` solo decrementa `balance` proporcionalmente si la
   venta era a crédito (`sales/[id]/return/route.ts:119-133`). Si la
   venta fue de contado, no hay nada que registre el crédito a favor.

---

## 7. Estado de cuenta del cliente — ¿endpoint PDF/CSV?

**No existe.** El proyecto sí tiene `jspdf` + `jspdf-autotable`
+ `json2csv` + `papaparse` instalados (ver `package.json:32-38`), y se
usan en `src/app/(dashboard)/reports/page.tsx` para exportar Sales.
Pero no hay endpoint `/api/customers/[id]/statement`, `/api/reports/customer-statement`
ni similar.

El `GET /api/customers/[id]/payments` solo devuelve abonos, sin las
facturas correspondientes ni el saldo en cada fecha.

---

## 8. Bugs identificados (relevantes a Fase 17)

### Bug 1 — Reverso de pago contra `Customer.balance` sin guarda transaccional

`src/app/api/accounting/receivables/payments/[paymentId]/reverse/route.ts:41-44`:

```ts
await tx.customer.update({
  where: { id: payment.customerId, companyId: tenant.companyId },
  data: { balance: { increment: payment.amount } }
});
```

Usa `update` (no `updateMany` con guard) — no rechaza si el customer
fue borrado o si su companyId cambió. Más importante: no valida que
el AccountPayment original no haya sido ya revertido por otro flujo
(no hay lock/select for update).

### Bug 2 — Anulación de venta con CREDIT no revierte si `customerId` se vació

`src/app/api/sales/[id]/route.ts:136-142`: solo revierte balance si
`sale.customerId` existe. Si por algún motivo el customer fue borrado
(no debería pasar por FK), el `balance` queda inflado.

### Bug 3 — `paidAmount` puede quedar negativo al anular pago a proveedor

`src/app/api/accounting/payables/payments/[paymentId]/reverse/route.ts:42-50`:

```ts
const newPaidAmount = Number(payable.paidAmount) - Number(payment.amount);
const newStatus = newPaidAmount <= 0 ? 'PENDING' : 'PARTIAL';
```

Si dos VOID se ejecutan en paralelo, `paidAmount` puede ir a negativo.
Falta `updateMany` con guarda `paidAmount: { gte: payment.amount }`.
Adicionalmente, si el payable estaba en `OVERDUE` y se descobra,
queda en PENDING — pierde la marca de vencido.

### Bug 4 — Race condition en `customers/[id]/payments` POST

`src/app/api/customers/[id]/payments/route.ts:91-132`: dentro de
`$transaction` consulta `tx.customer.findUnique` (línea 93) y luego
`updateMany` con guarda (línea 116). Bien, pero la verificación de
"caja abierta" se hace ANTES del transaction (líneas 76-87) — si la
caja se cierra entre la verificación y el commit, queda inconsistente.

### Bug 5 — `accounting/receivables/[customerId]/pay` no valida cashRegister activo

`route.ts:25-46`: a diferencia de `customers/[id]/pay`, no requiere
caja abierta para `method === 'CASH'`. Esto rompe la simetría:
mismo concepto, dos endpoints con reglas distintas y dependiendo
de cuál se llame, el efectivo entra o no a `cashRegisterTransaction`.
**De hecho:** este endpoint nunca crea `cashRegisterTransaction`,
solo `bankTransaction`. Un pago CASH entra a banco, no a caja.

### Bug 6 — `customers/[id]/pay` hard-codea `method: 'CASH'`

`route.ts:79-87`: ignora cualquier method del payload y siempre
crea `AccountPayment` con `method: 'CASH'`, `reference: 'Abono en
Caja'`, sin `bankAccountId`. Hay dos endpoints duplicados con
comportamiento distinto:
- `/api/customers/[id]/pay` → siempre CASH, requiere caja abierta
- `/api/customers/[id]/payments` → method del payload, soporta CASH/CARD/TRANSFER
- `/api/accounting/receivables/[customerId]/pay` → method del payload,
  exige bankAccountId, va al banco

Fase 17 debería consolidar a uno solo.

### Bug 7 — Saldo a favor perdido en devoluciones de contado

`sales/[id]/return/route.ts:119-133`: solo decrementa `balance` si
había `creditPayment`. Si la venta fue CASH y se devuelve la
mercadería, el cliente queda sin crédito a favor — el sistema no
registra que la tienda le "debe" Q.X. Esto encaja directo con la
necesidad de `CustomerCredit` en Fase 17.

### Bug 8 — `Sale.tax` siempre 0 (ya identificado en Fase 11 pero ataca aging)

`sales/route.ts:251`: `tax: 0`. El total facturado al cliente no
incluye IVA, lo cual subestima la cuenta por cobrar real. No es bug
de Fase 17 directamente, pero impacta el balance del cliente.

### Bug 9 — `AccountPayment` no tiene relación con Sale específica

Solo hay `customerId`. No se puede aplicar un abono a una factura
en particular; se aplica al saldo agregado. Cuando exista
`Sale.dueDate`, también será necesario `AccountPayment.saleId` (o
`PaymentApplication`) para que un abono reduzca la factura más
antigua o la elegida — sin esto, el aging es ficticio.

### Bug 10 — `OVERDUE` mostrado en UI pero nunca asignado

`src/app/(dashboard)/accounting/payables/page.tsx:32`: el badge
existe en la UI pero ningún código transita a OVERDUE. **Bug
silencioso visible**: el usuario asume que el sistema vigila
vencimientos cuando no lo hace.

---

## 9. Validación del plan de Fase 17

| Entregable del plan | Viabilidad | Observaciones |
|---|---|---|
| `dueDate` en `Sale` | OK, migración nullable + backfill `createdAt + creditDays` | obliga a refactor en sales/route.ts (cálculo de default) y reportes |
| `Customer.creditDaysDefault` / `maxOverdueDays` | OK, dos columnas nuevas | UI de cliente debe exponerlas |
| Cron diario OVERDUE | **Falta decidir runtime**: Vercel Cron, Supabase Edge Function, GitHub Action, pg_cron. Hoy no hay infraestructura. | Recomendación: Vercel Cron + `/api/cron/mark-overdue` con `Authorization: Bearer CRON_SECRET`. Compatible con Supabase Free. |
| Aging buckets | OK, dos endpoints nuevos | Requiere recorrer Sales con `dueDate` y `status IN (COMPLETED, PARTIAL)` + remaining balance por venta (lo cual hoy NO existe — el balance es por cliente, no por venta). **Bloqueador estructural**: hace falta `AccountPayment.saleId` o tabla `PaymentApplication`. |
| Bloqueo de venta a crédito por mora | OK | depende de que aging funcione |
| Estado de cuenta PDF/CSV | OK, librerías ya instaladas | nuevo endpoint `/api/customers/[id]/statement.{pdf,csv}` |
| Notificaciones in-app | OK, modelo `Notification` ya existe (`schema.prisma:544-555`) | falta `userId` o `targetRole` en `Notification` para dirigirlo a "cobranzas" — hoy se difunde a toda la empresa |
| `CustomerCredit` | OK, modelo nuevo + aplicación en venta | requiere reglas claras: ¿se aplica automáticamente o el cajero elige? |

### Issues con el plan

1. **Falta `PaymentApplication`** (o `AccountPayment.saleId`). Sin
   aplicar pagos a facturas específicas, los buckets de aging son
   teóricos: si el cliente tiene 3 facturas (10, 20, 30 días) y
   abona Q50, ¿cuál se cancela? FIFO automático debería ser la regla
   por defecto.
2. **`Notification` no tiene `userId`** — el plan dice "users con rol
   cobranzas" pero el modelo actual notifica a la empresa entera.
   Conviene agregar `userId` y/o `targetRole` antes de Fase 17.
3. **Status `OVERDUE` en `Sale`** — el plan dice actualizar
   `SaleStatus`, pero el enum actual no tiene OVERDUE. Hay que
   agregarlo. Cuidado: la lógica de POS asume que solo COMPLETED se
   factura/imprime y QUOTE se descarta; OVERDUE no debe romper esos
   flujos.
4. **Cron secret y rate limit**: definir un mecanismo de
   autenticación para el endpoint cron. No reutilizar la sesión NextAuth.
5. **Definir qué pasa con anulaciones tras OVERDUE**: ¿se permite
   anular una venta vencida? Hoy `sales/[id]/route.ts:113-115` solo
   bloquea CANCELLED y QUOTE.

---

## 10. Issues nuevos (no listados en el plan original)

1. **Duplicación de endpoints de cobro de cliente** (Bug 6). Hay 3
   rutas que hacen lo mismo con reglas distintas. Fase 17 debe
   consolidarlas.
2. **`Supplier.creditDays` no existe** — el dueDate del payable se
   calcula con `+30` hardcoded. Si el plan menciona aging de
   payables real, debería poder configurar el plazo por proveedor.
3. **`Sale.invoiceNumber` puede ser NULL** (es opcional). Cuando se
   genere el estado de cuenta, hay que decidir cómo se identifica la
   factura (id corto vs invoiceNumber) — hoy se usa `id.split('-')[0]`.
4. **`AccountPayment.cashRegisterId` opcional**: un pago no
   necesariamente está atado a una caja. Eso está bien, pero hay
   inconsistencia: `customers/[id]/pay` requiere caja para CASH;
   `accounting/receivables/[customerId]/pay` no.
5. **No hay índice en `SupplierPayable.dueDate`** — el cron diario
   va a escanear toda la tabla. Agregar `@@index([companyId, dueDate, status])`.
6. **`Customer.balance` es columna desnormalizada**: en cada pago/venta
   se hace `increment/decrement`. Si la suma agregada llegara a
   diverger del cálculo real desde `AccountPayment` + `Sale`, no hay
   reconciliación. Fase 17 debería incluir un endpoint
   `POST /api/customers/[id]/recompute-balance` (interno) para auditar.
7. **Reverso de payable no revisa estado OVERDUE**: si era OVERDUE
   y se descobra, queda PENDING perdiendo histórico (Bug 3 amplificado).
8. **Plan no menciona tests**: dado que aging se vuelve crítico
   (bloquea ventas), Fase 17 debería incluir tests unitarios de los
   buckets (corner cases: dueDate = today, dueDate NULL, dueDate
   futuro, exactamente 30/60/90 días).

---

## 11. Volumen de refactor estimado

| Capa | Cambios | Magnitud |
|---|---|---|
| Schema/migraciones | +1 columna en Sale (dueDate), +2 en Customer (creditDaysDefault, maxOverdueDays), +1 en Supplier (creditDays), +1 valor en SaleStatus (OVERDUE), +1 tabla CustomerCredit, +1 tabla PaymentApplication, +1 columna AccountPayment.saleId (opcional), +indexes | Media |
| Endpoints nuevos | `/api/cron/mark-overdue`, `/api/reports/accounting/aging-receivables`, `/api/reports/accounting/aging-payables`, `/api/customers/[id]/statement.pdf`, `/api/customers/[id]/statement.csv`, `/api/customer-credits` (POST/GET/aplicar) | 6-8 rutas |
| Endpoints a tocar | `/api/sales` POST (dueDate + bloqueo mora + aplicar customer-credit), `/api/sales/[id]` (anulación con dueDate), `/api/sales/[id]/return` (saldo a favor → CustomerCredit), `/api/customers/[id]/pay*` (consolidar), `/api/customers/[id]/payments` (aplicar a factura), `/api/purchases` (dueDate desde supplier.creditDays), `/api/accounting/payables/*` reverse (guarda OVERDUE), `/api/accounting/summary` (incluir buckets) | 8-10 rutas |
| UI | Page de receivables: mostrar aging + buckets. Page de payables: idem. Customer form: añadir creditDaysDefault, maxOverdueDays. Supplier form: creditDays. Modal de venta a crédito: dueDate visible. Estado de cuenta downloadable. Notificaciones in-app de mora. | 5-6 vistas |
| Cron infra | Decidir Vercel Cron vs Supabase Edge; crear secret; documentar | Baja |
| Tests | Buckets aging, bloqueo por mora, aplicación de credit, reverso de pago overdue, idempotencia del cron | 8-10 tests |
| Docs | Actualizar `phase-17-completion.md` + `data-model.md` futuro | Baja |

**Total estimado: 1 fase de subagente (3-5 días)**, asumiendo Fase 14
(plan de cuentas) ya cerrada, porque cualquier modificación a pagos
debe generar asiento doble correcto. Si Fase 14 no está, hay
acoplamiento extra.

---

## 12. Recomendaciones puntuales pre-Fase 17

1. **Antes de tocar nada**: agregar `userId` y/o `targetRole` a
   `Notification` para que las alertas de mora lleguen a cobranzas
   y no a toda la empresa.
2. **Decidir tabla `PaymentApplication`** vs `AccountPayment.saleId`.
   La tabla es más flexible (un abono puede repartirse en N
   facturas), el campo es más simple. Recomendado: tabla, para
   soportar abonos parciales aplicados FIFO.
3. **Consolidar las 3 rutas de cobro** en `/api/customers/[id]/payments`
   con un solo schema. Deprecar `/pay` y la ruta bajo
   `/accounting/receivables/[customerId]/pay`.
4. **Backfill de `Sale.dueDate`** para ventas existentes con CREDIT:
   `createdAt + 30 días` como default razonable (o usar
   `creditDaysDefault` del cliente cuando esté creado).
5. **Migrar `Sale.tax = 0` antes** (Fase 16) o aceptar que el balance
   del cliente está subestimado.
6. **Vigilar reverso de OVERDUE** en `payables/payments/.../reverse`:
   si la nueva regla es `OVERDUE` cuando `dueDate < now()`, el reverso
   debe volver a calcular el estado, no asumir PENDING.

---

## 13. Conclusión

El plan de Fase 17 es viable, pero asume implícitamente cambios que
hoy NO están y que conviene declarar explícitos:

- Necesita `PaymentApplication` (no mencionado en el plan).
- Necesita `userId`/`targetRole` en `Notification` (no mencionado).
- Necesita resolver duplicación de endpoints de cobro (no mencionado).
- Necesita `Supplier.creditDays` para que el payable.dueDate no siga
  hardcoded a 30 (no mencionado).
- El cron requiere decisión de runtime (Vercel Cron vs Supabase).

Una vez incorporados estos issues, el refactor es de magnitud **media**
y se encadena limpio con Fase 14 (asientos contables del cobro) y
Fase 16 (Sale.tax correcto para que el balance del cliente sea real).

Recomendación: aprobar la fase con los 8 issues anexos incorporados
al alcance.
