# Fase 16 · Discovery — FEL Guatemala (MockProvider primero)

Fecha: 2026-05-11
Auditor: subagente tax/FEL (read-only)
Alcance: estado real del ERP SIMTECH frente a la lista de entregables de la
Fase 16 (`docs/audits/phase-13-erp-real-plan.md`, líneas 106-140).

---

## Resumen ejecutivo

SIMTECH **no tiene nada de FEL implementado** más allá de cuatro columnas en
`CompanySettings` (`felEnabled`, `felProvider`, `felNitEmisor`, `felApiUser`,
`felApiKey`, `felCertificateUrl`), un enum `FelProvider { NONE | INFILE |
DIGIFACT }` y un tab visual en `/settings`. Funcionalmente:

- `Sale.tax` está **hardcoded a 0** en el único punto donde se crea una venta
  (`src/app/api/sales/route.ts:251`).
- `Sale.invoiceNumber` **nunca se asigna en ningún flujo**: no existe ni
  correlativo simple, ni lock optimista, ni serie por sucursal. La única
  lectura es para mostrarlo en UI/reportes.
- No hay tabla `TaxDocument`, `TaxSeries`, `CreditNote`, `DebitNote` ni
  `Company.taxRegime`.
- El enum `FelProvider` existe pero **no hay ningún implementador en `src/`**:
  cero ocurrencias de `MockProvider`, `InfileProvider`, `certify`,
  `generateXml`, `dteUuid`. Es un campo de UI muerto.
- `Product.isTaxExempt` ya existe en schema (`schema.prisma:172`) y en el
  modal de inventario, pero **no se lee en ningún cálculo**, porque no hay
  cálculo de IVA en ninguna parte del codebase.

**Conclusión clave para el dueño:** la infraestructura FEL/MockProvider
**arranca esencialmente desde cero**. El plan de Fase 16 es realista pero la
suposición implícita ("ya hay base sobre la que iterar") es falsa. Lo único
reaprovechable son los 6 campos de `CompanySettings` y el enum.

Magnitud estimada del refactor + nueva infra: **2 a 3 semanas full-time** de
un agente especialista (schema + migraciones + provider pattern + endpoints
nuevos + retrofit de Sale + libros + asientos). Más detalle en sección
"Estimación".

---

## Estado actual por dimensión

### 1. Cálculo de IVA — hardcoded a cero

Único lugar donde se crea una venta:
`src/app/api/sales/route.ts` líneas 191-194 y 241-254.

```ts
// Línea 191
const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
const discountAmount = subtotal * (discount / 100);
const total = subtotal - discountAmount;
...
// Línea 241
const newSale = await tx.sale.create({
  data: {
    ...
    subtotal,
    discount,
    tax: 0,            // ← hardcoded
    total,
    ...
```

Notas:

- El campo `taxRate` (Decimal 5,4, default 0.12) existe en `CompanySettings`
  (`schema.prisma:500`) pero **nunca se lee** desde un endpoint. Sólo aparece
  en la UI de Settings (`src/app/(dashboard)/settings/page.tsx:300-309`)
  donde el usuario ve "Tasa de IVA" pero el valor no afecta nada del flujo
  de ventas.
- `Product.isTaxExempt` (`schema.prisma:172`) tiene UI
  (`src/components/inventory/ProductModal.tsx:32, 68, 239`) y se persiste
  desde `src/app/api/products/route.ts:225`. **No participa de ningún
  cálculo de impuestos en el backend** — es un flag huérfano.
- El P&L lee `Sale.tax` con `_sum` (`src/app/api/reports/accounting/profit-loss/route.ts:112`)
  pero como siempre es 0, "ventas brutas" = "ventas netas" en todos los
  tenants existentes. No es un bug visible porque nunca hay datos.
- Carrito POS (`src/components/pos/Cart.tsx`) muestra **Subtotal → Descuento
  → TOTAL**. No hay línea de IVA en pantalla.
- `TicketModal` (`src/components/pos/TicketModal.tsx:207-217`) imprime solo
  TOTAL, sin desglose de impuestos.
- Wizard de venta remota (`src/components/sales/RemoteSaleWizard.tsx:142-143`)
  también calcula `total = subtotal - descuento`, sin IVA.

**Conclusión:** "tax" en SIMTECH hoy es columna en DB con default 0. No
existe noción de IVA por línea, ni respeto a régimen, ni a producto exento.

### 2. `Sale.invoiceNumber` — totalmente inactivo

Búsqueda exhaustiva (`grep invoiceNumber` en todo el repo) confirma:

| Lugar | Uso |
|---|---|
| `prisma/schema.prisma:370,389` | Campo + unique constraint `(companyId, invoiceNumber)` |
| `src/app/api/sales/route.ts:560` | Filtro de búsqueda en GET (`contains`) |
| `src/app/api/reports/inventory/kardex/route.ts:129,184,206` | Lectura para reportes |
| `src/app/api/reports/sales/route.ts:79` | Fallback en CSV: `sale.invoiceNumber || sale.id.substring(0,8)` |
| `src/app/(dashboard)/sales/[id]/page.tsx:246` | UI: muestra `'Sin factura'` |
| `src/app/api/delivery-notes/[id]/route.ts:20` | Select para mostrar al despachar |

**Cero escrituras.** Ninguna ruta hace `invoiceNumber: ...` en `tx.sale.create`
o `tx.sale.update`. La columna nace y muere `null`.

Comparativa: la única numeración secuencial implementada hoy es
`DeliveryNote.noteNumber` (`src/app/api/delivery-notes/route.ts:88-99`), y
está mal hecha — busca `findFirst({ orderBy createdAt desc })`, parsea con
regex `/\d+$/`, suma 1. **No tiene lock, no es transaccional, dos requests
concurrentes generan colisión `P2002`.** Conviene NO copiar este patrón
para el correlativo FEL; usar `SELECT ... FOR UPDATE` o una tabla
`TaxSeries(branchId, type, nextNumber)` con `update + returning` dentro de
`$transaction` con nivel `Serializable`.

### 3. Régimen tributario — no existe

- No hay `Company.taxRegime` ni equivalente.
- No hay enum `TaxRegime`.
- No hay diferenciación entre Pequeño Contribuyente (5%) y General (12%) en
  ningún punto: cálculos, asientos, UI de configuración.

El campo `CompanySettings.taxRate` (Decimal default 0.12) es lo más cercano
y está pensado como un global por empresa, no como un régimen formal SAT
que cambia tasa por línea según tipo de producto/servicio.

### 4. NIT del cliente — sólo se persiste en `Customer`, no en `Sale`

Esquema:

- `Customer.nit String?` (`schema.prisma:332`).
- **Sale NO persiste NIT del comprador.** No hay `Sale.customerNit` ni
  snapshot equivalente.

Flujo actual:

- `POST /api/customers` y `PATCH /api/customers/[id]` aceptan `nit` como
  string opcional sin validar formato (`src/app/api/customers/route.ts:11`).
  No hay regex GT (NIT GT acepta dígitos + letras + guión + "CF" especial).
- `TicketModal` (`src/components/pos/TicketModal.tsx:178`) imprime
  `sale.customer?.nit` cuando existe, sino nada — no imprime "CF".

Impacto para FEL: para certificar un DTE hay que persistir el NIT
**inmovilizado al momento de la venta** (snapshot), porque si el cliente
edita su NIT después la factura ya emitida queda inconsistente. Hay que
agregar `Sale.receptorNit`, `Sale.receptorNombre`, `Sale.receptorDireccion`
como snapshot, y validar formato GT antes de aceptar (regex
`^([0-9]+-?[0-9kK]|CF)$` aprox).

### 5. `FelProvider` enum — sin implementación

```
schema.prisma:611-615
enum FelProvider {
  NONE
  INFILE
  DIGIFACT
}
```

Búsqueda en `src/`:

- `grep -rn "felProvider\|FelProvider\|MockProvider\|certify\|generateXml"`
  en `src/` devuelve **únicamente referencias declarativas**
  (Zod enum en settings, dropdown en UI, texto explicativo en landing).
- No hay carpeta `src/lib/fel/`, no hay `src/lib/providers/`, no hay
  `src/services/`.
- No hay endpoint `/api/fel/*`.
- No hay tipo `interface FelProvider`, ni `class InfileProvider`, ni
  `MockProvider`.

Falta agregar al enum el valor `MOCK` para poder distinguirlo de `NONE`
(que hoy significa "FEL desactivado"). Sugerencia: el enum queda
`NONE | MOCK | INFILE | DIGIFACT` y el plan se valida con `MOCK` siendo
default activo para todos los tenants en desarrollo/staging.

### 6. Notas de Crédito / Débito — no existen

- No hay modelo `CreditNote`, `DebitNote`, ni tabla similar.
- Lo más parecido a "anular venta" hoy:
  - `PATCH /api/sales/[id]` con `action: 'CANCEL'`
    (`src/app/api/sales/[id]/route.ts:83-202`) — reincorpora stock, revierte
    pagos en caja/banco/balance de cliente, y crea un asiento contable de
    tipo `EXPENSE` "Devoluciones POS" con el total negativo
    (líneas 184-194).
  - `POST /api/sales/[id]/return` y `POST /api/pos/returns` — devolución
    parcial con re-stock proporcional al crédito del cliente.

**Problema SAT:** ninguno de estos flujos emite un DTE de tipo NCRE
(Nota de Crédito) que es lo que SAT requiere para anular una factura ya
certificada. Hoy la anulación es puramente contable interna y movería el
asiento al revés, pero **borraría el registro fiscal sin dejar el rastro
de NCRE asociada al DTE original** — esto es exactamente lo que el plan
Fase 16 pide cerrar.

Adicionalmente, el asiento de "Devoluciones POS" como EXPENSE paralelo
(no como reverso del INCOME original) ya está marcado como bug silencioso
en Fase 24 (`phase-13-erp-real-plan.md:334`). Fase 16 debe contemplar que
el flujo de NCRE reemplace este atajo.

### 7. Productos exentos — flag existe, sin efecto

`Product.isTaxExempt Boolean @default(false)` en `schema.prisma:172`:

- POST `/api/products` lo acepta (`src/app/api/products/route.ts:149,225`).
- PUT `/api/products/[id]` lo actualiza
  (`src/app/api/products/[id]/route.ts:105`).
- UI lo expone (`ProductModal.tsx:239`, badge "Exento" en
  `inventory/page.tsx:212`).
- CSV import lo incluye (`ImportExcelModal.tsx:20`).

Pero ninguna lógica de venta consulta el flag. Cuando Fase 16 introduzca
cálculo de IVA por línea, este flag se vuelve activo: línea con
`product.isTaxExempt = true` → `saleItem.taxRate = 0`, resto del régimen
aplica.

### 8. Volumen del refactor — IVA + invoiceNumber

#### Lugares que tocan `Sale.tax` (todos los hay que modificar)

| Archivo | Línea | Qué hace hoy |
|---|---|---|
| `src/app/api/sales/route.ts` | 251 | `tax: 0` hardcoded al crear venta |
| `src/app/api/reports/accounting/profit-loss/route.ts` | 112, 125, 132 | `_sum.tax` agregado para reportar impuestos |

**Solo 2 archivos.** Refactor IVA backend es contenido. Cambios:

- Nuevo cálculo de tax por línea dentro del `$transaction` de POST `/api/sales`.
- Agregar `SaleItem.taxRate Decimal` y `SaleItem.taxAmount Decimal`.
- Recalcular `Sale.subtotal`/`Sale.tax`/`Sale.total` desde la suma de líneas.
- P&L se mantiene igual (sigue leyendo `_sum.tax`).

UI a tocar (mostrar IVA en cliente):

- `src/components/pos/Cart.tsx` (lines 78-110): agregar fila "IVA".
- `src/components/pos/CheckoutModal.tsx`: usar `totalWithTax` en vez de
  `totalWithDiscount` para calcular `payments[].amount`.
- `src/components/pos/TicketModal.tsx` (lines 207-217): agregar línea IVA
  antes de TOTAL.
- `src/components/sales/RemoteSaleWizard.tsx` (lines 142-143): añadir IVA.
- `src/app/(dashboard)/sales/[id]/page.tsx`: mostrar IVA en detalle.
- `src/stores/cartStore.ts`: nuevo selector `totalWithTax()` que considere
  `isTaxExempt` por producto.

#### Lugares que tocan `Sale.invoiceNumber` (todos los hay que cambiar a TaxDocument o equivalente)

Lectura solamente (no escritura — porque nunca se escribe):

| Archivo | Línea | Qué hace |
|---|---|---|
| `src/app/api/sales/route.ts` | 560 | Filtro de búsqueda |
| `src/app/api/reports/inventory/kardex/route.ts` | 129, 184, 206 | Reporte Kardex |
| `src/app/api/reports/sales/route.ts` | 79 | CSV de ventas |
| `src/app/(dashboard)/sales/[id]/page.tsx` | 246 | UI detalle |
| `src/app/api/delivery-notes/[id]/route.ts` | 20 | Select |
| `src/components/sales/DeliveryNoteModal.tsx` | 24 | Tipo de prop |

**6 archivos de lectura.** Tras Fase 16, se puede:

(a) Mantener `Sale.invoiceNumber` como denormalización del número
    certificado (más simple para reportes existentes), o
(b) Migrar todo a leer `Sale.taxDocument.numero` (más limpio, pero requiere
    update de 6 sitios y join adicional).

Recomendación: (a) — populate `Sale.invoiceNumber` desde el TaxDocument al
certificar exitosamente; los 6 lugares siguen funcionando sin cambios.

### 9. Asientos contables al certificar — hoy no diferencian IVA

`createAccountingEntry` en `src/lib/accounting.ts` es "partida simple":
crea una sola entrada (INCOME o EXPENSE) con monto total. No es partida
doble (Fase 14 debería haber convertido esto a `JournalEntry` con líneas
DR/CR, pero **Fase 14 todavía no está implementada** — ver siguiente
sección).

En POST `/api/sales` línea 403-413:

```ts
await createAccountingEntry(tx, {
  ...
  type: 'INCOME',
  categoryName: 'Ventas POS',
  amount: Number(completedSale.total),  // ← incluye IVA mezclado
  ...
});
```

**Bug:** el `total` agrega IVA + venta neta en una sola categoría INCOME,
sin separar IVA débito fiscal. Cualquier reporte tributario que se haga
hoy sobre `AccountingEntry` va a inflar las ventas en 12% o 5%.

Fase 16 requiere que el asiento sea:

- DR Caja/Cliente — `total` (subtotal + tax)
- CR Ventas — `subtotal`
- CR IVA Débito Fiscal — `tax`

Esto **depende fuerte de Fase 14** (plan de cuentas + JournalEntry). Sin
Fase 14 no se puede hacer el asiento doble correcto.

### 10. Dependencias

Fase 16 declara que depende de Fase 14 (plan de cuentas + partida doble +
cierre de período). El plan asume que Fase 14 se ejecuta antes.

**Estado real verificado:**

- `JournalEntry`, `JournalLine`, `ChartOfAccount`, `AccountingPeriod` —
  ninguno existe en `schema.prisma`.
- `AccountingEntry` legacy sigue siendo el único modelo contable.
- `createAccountingEntry` sigue siendo partida simple.

Si la ejecución secuencial Sprint 0 → Sprint 1 se respeta, Fase 14 entrega
los modelos contables que Fase 16 necesita. Si se intentara hacer Fase 16
antes de Fase 14, el asiento al certificar quedaría inválido y habría que
re-trabajar.

---

## Hallazgos con severidad

### CRIT-1 · `Sale.tax` hardcoded a cero — `src/app/api/sales/route.ts:251`

Toda venta emitida desde el sistema tiene IVA=0 en DB. Cualquier reporte
tributario armado contra estos datos hoy es **inválido legalmente**. Esto
incluye P&L que reporta "impuestos" basado en `_sum.tax`.

Severidad: **crítica para regulación** — bloqueante para vender el sistema
a empresas en régimen General o Pequeño Contribuyente.

### CRIT-2 · `Sale.invoiceNumber` nunca se asigna — `src/app/api/sales/route.ts` (POST completo)

No hay correlativo. Sale guarda solo `id` (UUID). El ticket POS muestra
los primeros 8 chars del UUID
(`src/components/pos/TicketModal.tsx:157`). SAT exige correlativo
secuencial dentro de la serie autorizada.

Severidad: **crítica**.

### HIGH-1 · Categoría "Devoluciones POS" se contabiliza como EXPENSE paralelo

`src/app/api/sales/[id]/route.ts:184-194`: al anular venta se crea un
asiento EXPENSE en categoría "Devoluciones POS" con monto total — no
revierte el INCOME original. Esto distorsiona los reportes y, en el flujo
FEL, va a romper el match entre DTE original y NCRE.

Severidad: alta. Ya marcado para Fase 24 pero Fase 16 lo va a tropezar.

### HIGH-2 · `Product.isTaxExempt` huérfano

Flag existe pero no se consulta. Hoy no rompe nada porque no hay cálculo
de IVA; cuando Fase 16 introduzca el cálculo, hay que recordar
respetarlo. El test E2E debe cubrir explícitamente: producto exento
dentro de una venta con régimen General produce `taxRate = 0` en esa
línea y suma 0 al `Sale.tax`.

### MED-1 · `DeliveryNote.noteNumber` no usa lock

`src/app/api/delivery-notes/route.ts:88-99`: `findFirst + parseInt + 1`
fuera de transacción. Dos requests concurrentes generan colisión
`P2002`. Fase 16 NO debe copiar este patrón para el correlativo FEL.
Usar tabla `TaxSeries` con `tx.taxSeries.update({ data: { nextNumber:
{ increment: 1 }}, where: { … }})` dentro de la `$transaction` que
emite el DTE.

### MED-2 · Credenciales FEL en claro en `CompanySettings`

`felApiUser`, `felApiKey`, `felCertificateUrl` se persisten como `String?`
sin cifrado (`schema.prisma:493-495`). El plan Fase 16 declara cifrado
at-rest. Hoy:

- `sanitizeSettings` (`src/app/api/settings/route.ts:32-40`) **enmascara
  al leer** (devuelve `''` en `felApiUser`/`felApiKey`), pero NO en la DB.
- Cualquier admin con acceso a la DB ve las credenciales en plano.

Para MockProvider esto es irrelevante (no hay credenciales reales),
pero el schema y el helper de read/write deben quedar preparados para
cifrado al cambiar a Infile/Digifact. pgcrypto + función helper
`encryptFelCredential` / `decryptFelCredential` parece el camino más
limpio dado que ya usamos Postgres.

### MED-3 · NIT del receptor no se snapshot-ea en `Sale`

`Sale.customerId` apunta al cliente vigente. Si el cliente edita su NIT
después de emitir la factura, la consulta histórica queda inconsistente.
Hay que persistir `Sale.receptorNit`/`Sale.receptorNombre`/
`Sale.receptorDireccion` al momento de emitir.

### LOW-1 · `FelProvider` enum no tiene valor `MOCK`

Hoy es `NONE | INFILE | DIGIFACT`. Para que el MockProvider sea
discriminable del estado "FEL desactivado", hay que agregar `MOCK` al
enum. Migración:

```sql
ALTER TYPE "FelProvider" ADD VALUE 'MOCK';
```

### LOW-2 · UI de Settings expone "Tasa de IVA" sin efecto

`src/app/(dashboard)/settings/page.tsx:300-309`: usuario configura tasa
pero **no se aplica a nada** hoy. Confusión potencial. Después de Fase 16
debería leerse en el cálculo o quitarse del UI hasta que se use.

---

## Validación del plan Fase 16

Reviso las suposiciones del plan (líneas 106-140 del plan principal).

| Suposición del plan | Realidad | Veredicto |
|---|---|---|
| "Refactor de Sale para calcular IVA por línea" | No hay cálculo previo: es construcción inicial, no refactor | OK (mejor) — pero subestimado |
| "Sale.tax deja de ser hardcoded a 0" | Correcto, hoy es exactamente eso | Confirmado |
| "Respetar Product.isTaxExempt" | Flag existe, hay que activarlo | OK |
| "Refactor de Sale para integrar SaleItem.discount" | `SaleItem.discount` existe (`schema.prisma:431`) pero **no se usa en el cálculo de subtotal** — POST `/api/sales` no lo lee | Plan correcto: hay que integrarlo |
| "Provider pattern con interface FelProvider" | No hay nada hoy | OK |
| "MockProvider que certifica localmente" | Cero código previo | OK — construcción desde cero |
| "Endpoint POST /api/fel/certify/:saleId" | No existe | OK |
| "Factory que elige provider según Company.felProvider" | El campo está en `CompanySettings`, no en `Company`; el plan dice `Company.felProvider` lo cual es incorrecto literalmente — el factory debe leer de `CompanySettings.felProvider` | **Aclarar:** el plan dice `Company.felProvider`, pero `felProvider` vive en `CompanySettings` |
| "Credenciales cifradas at rest (pgcrypto o aplicación)" | Hoy plano. Migración necesaria | Plan correcto |
| "Asiento contable correcto (DR Cliente/Caja, CR Ventas, CR IVA Débito)" | Hoy partida simple sin separar IVA | Bloqueado por Fase 14 |
| "Notas de Crédito y Débito modelos nuevos" | No existen | OK |
| "Reportes tributarios (Libro Ventas/Compras/IVA)" | No existen | OK |

**Asunto a confirmar con el dueño:** el plan dice "Cada SaleItem persiste
`taxRate` (0 si exento, 5 o 12 según régimen y producto)". Esto sugiere
que un mismo establecimiento NO puede tener líneas con tasas mezcladas —
o sea, si es Pequeño Contribuyente, todas las líneas son 5% (excepto
exentas). Confirmar que NO existe un caso "régimen General vendiendo
producto con tasa especial" en GT para PYMEs. (En GT existe el 0% para
ciertas exportaciones y servicios al exterior; ver si entra en alcance.)

---

## Preguntas abiertas para el dueño

1. **Régimen de las PYMEs target.** ¿La gran mayoría va a ser General
   (12%)? ¿Cuántos clientes esperás en Pequeño Contribuyente (5%)? Si es
   <10% del pipeline, el MVP puede arrancar solo con General y agregar
   Pequeño Contribuyente como Fase 16.1 posterior.
2. **NIT especial "CF" (Consumidor Final).** ¿Aceptamos venta sin NIT del
   cliente (CF) en el MVP MockProvider? El SAT lo permite hasta cierto
   monto. Validador GT debe contemplar `CF` como valor válido.
3. **Series por sucursal vs. por empresa.** El plan Fase 16 dice
   "TaxSeries por sucursal y tipo de documento". ¿Confirmamos que en
   producción cada `Branch` tendrá su propia serie autorizada por SAT?
   ¿O para el MVP de MockProvider basta con serie única por empresa?
4. **Anulación con NCRE automática vs. opcional.** Hoy `PATCH /api/sales/[id]`
   con `action: CANCEL` anula sin generar nota fiscal. ¿La transición a
   FEL convierte esto en obligatorio (siempre genera NCRE) o solo cuando
   `felEnabled = true`?
5. **MockProvider determinístico vs. aleatorio.** Para tests E2E es
   conveniente que el UUID/hash sean deterministicos a partir del
   `Sale.id`. ¿OK con eso?
6. **Cifrado de credenciales en `CompanySettings`.** Para el MVP
   MockProvider no hay credenciales reales que cifrar. ¿Aplazamos pgcrypto
   a la fase "switch a provider real" o lo dejamos listo ya?
7. **Trial sin FEL.** Onboarding declara que trial no emite FEL
   (`src/app/onboarding/page.tsx:184`). Con MockProvider esto deja de ser
   técnicamente cierto. ¿Mantenemos la restricción comercial o el trial
   también puede emitir DTE Mock?

---

## Recomendaciones

### Schema (migración nueva)

```prisma
enum TaxRegime {
  GENERAL                // 12%
  PEQUENO_CONTRIBUYENTE  // 5%
}

enum FelProvider {
  NONE
  MOCK
  INFILE
  DIGIFACT
}

enum TaxDocumentType { FACT NCRE NDEB }
enum TaxDocumentStatus { PENDING CERTIFIED CANCELLED REJECTED }

model TaxSeries {
  id          String @id @default(uuid())
  companyId   String
  branchId    String
  docType     TaxDocumentType
  prefix      String              // "A", "FE", etc.
  nextNumber  Int      @default(1)
  authNumber  String?              // autorización SAT
  active      Boolean  @default(true)
  @@unique([branchId, docType])
}

model TaxDocument {
  id              String @id @default(uuid())
  companyId       String
  saleId          String?  @unique
  creditNoteId    String?  @unique
  debitNoteId     String?  @unique
  docType         TaxDocumentType
  seriesId        String
  numero          Int
  numeroDisplay   String              // "FE-A-00000123"
  uuidSat         String?  @unique
  autorizacionSat String?
  hash            String?
  xmlFirmado      String?  @db.Text
  estado          TaxDocumentStatus  @default(PENDING)
  providerName    String              // "MOCK", "INFILE", ...
  providerResponse Json?
  certifiedAt     DateTime?
  cancelledAt     DateTime?
  cancelReason    String?
  ...
}
```

Y `Company.taxRegime TaxRegime @default(GENERAL)`.

Y `SaleItem`:

```prisma
taxRate   Decimal  @default(0) @db.Decimal(5,4)
taxAmount Decimal  @default(0) @db.Decimal(10,2)
```

Y `Sale`:

```prisma
receptorNit       String?
receptorNombre    String?
receptorDireccion String?
```

### Provider pattern

```ts
// src/lib/fel/provider.ts
export interface FelProvider {
  name: 'MOCK' | 'INFILE' | 'DIGIFACT';
  certify(input: CertifyInput): Promise<CertifyResult>;
  cancel(uuid: string, reason: string): Promise<CancelResult>;
  generateXml(input: CertifyInput): string;
}

// src/lib/fel/mock.ts
export class MockProvider implements FelProvider { ... }

// src/lib/fel/index.ts
export function resolveProvider(settings: CompanySettings): FelProvider {
  switch (settings.felProvider) {
    case 'MOCK': return new MockProvider();
    case 'INFILE': return new InfileProvider({...});
    case 'DIGIFACT': return new DigifactProvider({...});
    default: throw new Error('FEL no configurado');
  }
}
```

### Endpoints nuevos

- `POST /api/fel/certify/:saleId` — chequea sale.status, llama
  `provider.certify`, asigna correlativo desde `TaxSeries` con
  `update + increment` dentro de `$transaction`, persiste `TaxDocument`,
  retro-llena `Sale.invoiceNumber = taxDocument.numeroDisplay`.
- `POST /api/fel/cancel/:taxDocumentId` — emite NCRE y marca el TaxDocument
  original como CANCELLED.
- `POST /api/credit-notes` y `POST /api/debit-notes` — flujo completo
  análogo a Sale, con su propio certificador.
- `GET /api/reports/tax/sales-book?from=&to=` — Libro de Ventas SAT (CSV).
- `GET /api/reports/tax/purchases-book?from=&to=` — Libro de Compras
  (con `Supplier.nit`).
- `GET /api/reports/tax/iva-summary?period=YYYY-MM` — IVA crédito vs.
  débito.

### Orden de implementación dentro de Fase 16

1. Schema + migración (TaxRegime, TaxSeries, TaxDocument, CreditNote,
   DebitNote, agregar columnas a Sale y SaleItem).
2. Provider pattern + MockProvider (sin tocar Sale todavía).
3. Refactor POST `/api/sales` para calcular IVA por línea + integrar
   `SaleItem.discount`. **Aún sin certificar.**
4. Endpoint `/api/fel/certify/:saleId` con lock transaccional sobre
   TaxSeries.
5. Notas de Crédito/Débito (modelo + endpoints + UI mínima).
6. Reportes tributarios (CSV).
7. Asiento contable con DR/CR de IVA — depende fuerte de Fase 14, así que
   verificar que JournalEntry/JournalLine existan antes de tocar esto.

---

## Estimación

| Bloque | Horas |
|---|---|
| Schema + migración + seed de TaxSeries default | 6 |
| Provider pattern + MockProvider + XML generator SAT | 14 |
| Refactor POST /api/sales (IVA por línea, exento, snapshot NIT) | 10 |
| Endpoint certify + lock de TaxSeries | 6 |
| Endpoint cancel + flujo NCRE | 8 |
| CreditNote / DebitNote modelo + endpoints | 14 |
| Asientos contables (DR/CR con IVA) — depende Fase 14 | 6 |
| Libros SAT (3 reportes) | 10 |
| UI: badge "Certificado", botón "Certificar", desglose IVA en carrito/ticket | 12 |
| Tests unitarios (cálculo IVA, validación NIT GT, factory de provider) | 8 |
| Tests E2E (venta → certificar Mock → ver libro → anular con NCRE) | 6 |
| Verificación segundo subagente | 4 |
| **Total** | **~104 h ≈ 13 días full-time** |

Esto asume Fase 14 ya entregada con JournalEntry funcional. Si Fase 14
está pendiente, agregar coordinación + posible bloqueo de 2-3 días.

---

## Lo que no estoy auditando porque está fuera de Fase 16

- Retenciones IVA pequeño contribuyente / ISR servicios — Fase 19.
- ExchangeRate y diferencia cambiaria para FEL en USD — Fase 21.
- UI de "test de conexión FEL" — Fase 22.
- Plantillas customizables de factura — Fase 23.
- Conexión real a Infile/Digifact (provider concreto) — fuera de alcance
  declarado del plan principal.
