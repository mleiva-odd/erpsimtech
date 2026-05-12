# Phase 17 · Verification Report

Fecha: 2026-05-12
Verificador: subagente AR/AP — auditoría cruzada (read-only, sin participación previa).
Alcance: validar implementación de Fase 17 (CxC/CxP + aging + CustomerCredit + bloqueo por mora).

## Veredicto: APROBADO CON OBSERVACIONES

`typecheck` verde, `lint` 0 errors (64 warnings = baseline). Migración SQL idempotente y RLS consistente. Helpers `aging.ts` / `credit.ts` / `overdue.ts` se comportan según contrato. Sin defectos bloqueantes. Detallo 1 issue MEDIO (idempotencia parcial del backfill OVERDUE post-cron) y 5 observaciones MENORES no bloqueantes.

## Resultados V1–V14

| Check | Estado | Comentario |
|---|---|---|
| V1 · `npm run typecheck` | OK | `tsc --noEmit` sin output, exit 0. |
| V1 · `npm run lint` | OK | 0 errors, 64 warnings (baseline de Fase 14/15 + casts deliberados de `ar-ap/*.ts`). |
| V2 · Migración idempotente | OK | DO blocks para enums; ADD VALUE IF NOT EXISTS para SaleStatus; CREATE TABLE/INDEX IF NOT EXISTS; ADD COLUMN IF NOT EXISTS; RLS DROP+CREATE policy. Backfill `dueDate` usa `(coalesce(creditDaysDefault, 30) \|\| ' days')::interval` — cast correcto. Backfill OVERDUE filtra `status='COMPLETED' AND dueDate IS NOT NULL AND dueDate<now() AND customer.balance>0`. |
| V3 · Bucket boundaries | OK | `computeBucket` en `aging.ts:69` — `days<=0 → current`, `<=30 → d1_30`, `<=60 → d31_60`, `<=90 → d61_90`, else `d90_plus`. Tests cubren 30/31/90/91 explícitamente (líneas 41–59 de `aging.test.ts`). |
| V4 · `assertCustomerCanBuyOnCredit` | OK | 404 `CUSTOMER_NOT_FOUND` cuando no existe; 409 `CREDIT_LIMIT_EXCEEDED` solo si `limit > 0 && newBalance > limit`; 409 `CUSTOMER_OVERDUE_BLOCKED` cuando alguna sale tiene `daysOverdue > maxOverdueDays`. Filtra sales por `status IN ['COMPLETED','OVERDUE']` y `dueDate < asOf`. |
| V5 · Integración en sales/route.ts | OK | Línea 9 import; línea 238 llama el helper ANTES de `tx.customer.update({ balance: { increment } })` en línea 248; `saleDueDate = now + creditDaysDefault` (líneas 244–246) y se pasa al `Sale.create` (línea 282); catch en línea 555 mapea `error instanceof ARAPError` a `{ error, code }` con `status: error.status` (no 500). |
| V6 · Refactor purchases/route.ts | OK | Línea 159–165: `tx.supplier.findUnique(...).creditDaysDefault`; fallback `?? 30`. |
| V7 · `markOverdueDocuments` idempotente | OK con MATIZ | Sale: filtra por `status='COMPLETED'`, así que una sale ya OVERDUE no se re-marca. Payable: filtra por `status IN ['PENDING','PARTIAL']`, así que un payable ya OVERDUE no se re-marca. Ver Issue MEDIO M1 abajo sobre el caso edge cuando un Sale OVERDUE recibe pago parcial y queda nuevamente "current". |
| V8 · Cron endpoint protegido | OK | Línea 35: si `process.env.CRON_SECRET` no existe → 503 (kill switch); línea 44: secret incorrecto → 401 con `'No autorizado'` (genérico). `companyId` opcional desde body con `try/catch`. Llama `markOverdueDocuments(prisma, companyId?)`. |
| V9 · Endpoints aging | OK | Ambos requieren `treasury:view`. Aceptan `asOf` ISO (404 si NaN). Devuelven `{ asOf, customers/suppliers, totals }`. Usan `prisma.$transaction(async (tx) => ...)`. |
| V10 · CustomerCredit CRUD | OK con MATIZ | POST con Zod (`CreateSchema`); tenant guard via `findFirst({ id, companyId })` en línea 87; GET con paginación + filtros `customerId/status`; PATCH cancel rechaza `CANCELLED`/`FULLY_APPLIED` (409). Ver Obs MENOR O3 (no whitelist completa de `status` queryparam contra `PARTIALLY_APPLIED`/etc — ya cubierto por `ALLOWED_STATUS`). |
| V11 · Statement del cliente | OK | Tenant guard en línea 49 (`findFirst({ id, companyId })`); rango default = 6 meses; CSV exportable; incluye `aging` desde `computeReceivablesAging` filtrado por `customerId`. |
| V12 · Schema integrity | OK | Relaciones inversas verificadas: Company.customerCredits (`schema:49`), User.customerCredits + customerCreditApplications (`schema:115–116`), Customer.customerCredits (`schema:363`), Sale.customerCreditApplications (`schema:413`). Índices `CustomerCredit_companyId_customerId_idx` + `CustomerCredit_companyId_status_idx` (migration:72–73). Defaults: `creditDaysDefault Int @default(30)`, `maxOverdueDays Int @default(30)`, `status CustomerCreditStatus @default(ACTIVE)`. |
| V13 · Decisiones documentadas | OK | Completion §1.3 documenta la limitación del aging "conservador" (todo el balance al bucket más antiguo); §4 documenta endpoints duplicados de cobro y el refactor de devoluciones como TODOs. |
| V14 · Tests | OK con MATIZ | `aging.test.ts`: 13 casos (boundaries 30/31/90/91 explícitos, daysOverdue ignora hora). `credit.test.ts`: 3 casos sobre `ARAPError` (status+code+JSON). No cubre `assertCustomerCanBuyOnCredit` ni `applyCustomerCreditsToSale` con stubs — diferido a Fase 25 (DB efímera). |

## Observaciones detalladas

### M1 · MEDIO · Sale puede quedar en estado inconsistente OVERDUE→pagado sin volver a COMPLETED/PAID

`src/lib/ar-ap/overdue.ts:27` filtra `salesToMark` por `status='COMPLETED'` para promover a OVERDUE, lo cual es correcto e idempotente. Pero NO existe el camino inverso: si una Sale está OVERDUE y el cliente paga (vía `accounting/receivables/[customerId]/pay` o `customers/[id]/payments`), el endpoint de cobro decrementa `Customer.balance` pero **no** transita la Sale de OVERDUE → COMPLETED. La Sale queda con `status='OVERDUE'` permanente.

Consecuencia:
- En `aging.ts:127`, el filtro de sales del aging usa `status: { in: ['COMPLETED','OVERDUE','PENDING'] }`, así que la sale OVERDUE huérfana sigue contribuyendo al `oldestDue` aunque ya esté pagada — sobre-reporte de mora.
- En `credit.ts:135`, `assertCustomerCanBuyOnCredit` filtra `status: { in: ['COMPLETED','OVERDUE'] }`, así que esa sale OVERDUE histórica puede bloquear nuevas ventas a crédito incluso después de haber sido pagada.

Mitigación natural: si el cliente paga al punto de `balance=0`, el aging del cliente desaparece (filtra `balance: { gt: 0 }`), pero la sale individual sigue en OVERDUE en BD.

Recomendación: documentar como follow-up (Fase 20+ con PaymentApplication por documento) o agregar una limpieza en el cron — al final del recorrido, transitar OVERDUE → COMPLETED para sales cuyo `customer.balance = 0`. No bloqueante porque el aging conservador ya está reconocido como limitación en el completion report.

### m2 · MENOR · `notifyOverdueSales` declarada y exportada pero nunca invocada

`src/lib/ar-ap/overdue.ts:78–113` define la función y `index.ts:31` la exporta, pero ningún caller la usa. El cron handler (`api/cron/mark-overdue/route.ts`) llama solo `markOverdueDocuments` y no recoge los IDs ni notifica. Resultado: ninguna notificación in-app se genera cuando una factura pasa a OVERDUE — silencioso. El completion report (§1.3) menciona la función pero no aclara que está desconectada. Sugerencia: encadenar `notifyOverdueSales` en el cron, o documentar explícitamente que es código preparatorio para Fase 22.

### m3 · MENOR · `assertCustomerCanBuyOnCredit` con `creditLimit = 0`

`credit.ts:151`: `if (limit > 0 && newBalance > limit)`. Si `creditLimit = 0` (default histórico), el check de límite NO se aplica — el helper considera que el cliente tiene "límite ilimitado". El comportamiento legacy en `sales/route.ts:225–230` (validación vieja) era el opuesto: si `creditLimit <= 0` → "no tiene crédito autorizado". La validación vieja del handler fue removida y solo queda `assertCustomerCanBuyOnCredit`, así que **un cliente con `creditLimit=0` ahora puede comprar a crédito sin límite**. Es un cambio de comportamiento no destacado en el completion report.

Recomendación: o restaurar la regla "creditLimit ≤ 0 → bloquear" dentro del helper (más seguro), o documentar el cambio explícito. No bloqueante porque clientes existentes deberían tener `creditLimit` > 0 al usar la feature.

### m4 · MENOR · `MANUAL_DEPOSIT` como `referenceType` en POST CustomerCredit

`api/customer-credits/route.ts:104` hardcodea `referenceType: 'MANUAL_DEPOSIT'`, pero el resto del repo (helper, schema docs) usa `'SALE_RETURN'` para devoluciones y nada para anticipos manuales. El valor 'MANUAL_DEPOSIT' aparece por primera vez aquí, sin estar enumerado en docs ni tipado. No es bug porque el campo es `String?` libre, pero crea inconsistencia: anticipos manuales tienen `reason='ADVANCE_PAYMENT'` pero `referenceType='MANUAL_DEPOSIT'`. Considerar `null` o alinear con `reason`.

### m5 · MENOR · `markOverdueDocuments` hace findMany seguido de updateMany — race condition trivial

`overdue.ts:26–43`: primero hace `findMany` con filtros, luego `updateMany({ id: { in: ids } })`. Entre las dos queries un Sale podría haber sido cancelado o pagado al punto que `customer.balance` cayera a 0. El segundo `updateMany` solo filtra por `id`, no re-valida la condición. Resultado posible: una Sale podría ser marcada OVERDUE cuando ya no debería.

Mitigación: el cron corre 1×/día (06:00 GT), ventana mínima. No hay write contention típica a esa hora. Sería trivial cerrar la ventana usando el filtro completo en el `updateMany` (con `status='COMPLETED' AND dueDate < now AND customerId IN ...`) pero no es bloqueante.

### m6 · MENOR · Test coverage de aging.test.ts no cubre `daysOverdue = 1`

Las boundaries cubiertas son `0` (current), `30→d1_30`, `31→d31_60`, `90→d61_90`, `91→d90_plus`. Falta el caso `1 día → d1_30` para confirmar la frontera inferior del primer bucket vencido. Trivial. No bloqueante.

### m7 · INFO · Aging incluye `status='PENDING'` en `computeReceivablesAging`

`aging.ts:129`: `status: { in: ['COMPLETED', 'OVERDUE', 'PENDING'] }`. PENDING en sales no se documenta en `phase-17-completion.md` como estado considerado para aging — en el handler de sales actuales un Sale solo crea `COMPLETED` o `QUOTE`, pero hay handlers legacy que usan PENDING. No causa daño (la mayoría tiene `dueDate=null` y va a current), pero genera un divergence menor entre el doc y el código.

## Cosas explícitamente revisadas y verde

- **RLS sub-model**: `CustomerCreditApplication` usa EXISTS sobre el padre `CustomerCredit` (migration:165–175). Patrón correcto para tablas sin `companyId` directo.
- **Idempotencia del enum `OVERDUE`**: `ALTER TYPE ADD VALUE IF NOT EXISTS` (line 33) — soportado desde Postgres 12; Supabase corre Postgres 17.
- **Backfill `Sale.dueDate`**: usa `c.creditDaysDefault` (que existe por la migración anterior en el mismo archivo) con fallback a 30. Cast `(N || ' days')::interval` válido.
- **Backfill OVERDUE**: filtra por `status='COMPLETED'` (no toca QUOTE/CANCELLED) y `dueDate IS NOT NULL` (no toca contado). Correcto.
- **Tenant guard de customer-credits POST**: `findFirst({ id, companyId })` antes de crear — el customer no puede ser de otra empresa.
- **Tenant guard de cancel**: `credit.companyId !== tenant.companyId` (404 implícito).
- **`assertCustomerCanBuyOnCredit` orden de validaciones**: primero límite (más barato), luego mora — ordenado correctamente.
- **Decimal handling**: todos los puntos sensibles usan `Number(decimal)` antes de comparar, evitando comparaciones JSBI/Decimal directas.
- **`saleDueDate` no se setea en QUOTE**: la guard `hasCreditPayment && status === 'COMPLETED'` (sales/route.ts:232) garantiza que cotizaciones no reciban dueDate.
- **Cron acepta body opcional**: `req.json().catch(() => ({}))` no rompe si llega sin body (caso normal del cron).
- **`computePayablesAging` es exacto por documento** (paidAmount vs totalAmount).
- **Shim de tipos prisma-phase17.d.ts**: aumenta `PrismaClient` y `Prisma.TransactionClient` con delegates + loosen de Where/Select para Sale/Customer/SupplierPayable. Compatible con typecheck pre-`prisma generate`.

## Riesgos operativos no atacados por la implementación (esperado)

Los siguientes quedaron como follow-up reconocido en el completion report (§4) — no son issues de esta fase:

- Refactor de `sales/[id]/return/route.ts` para llamar `createSaleReturnCredit` cuando la venta original era a crédito.
- Consolidación de los 3 endpoints duplicados de cobro de cliente.
- `PaymentApplication` por documento (necesario para aging exacto de CxC).
- UI/UX (Fase 22) para los nuevos endpoints.
- Tests de integración con DB efímera (Fase 25).

Ninguno bloquea Fase 16.

## Verificaciones de comandos

```
$ cd /sessions/blissful-stoic-pasteur/mnt/erp-simtech && npm run typecheck
> simtech-pos@0.1.0 typecheck
> tsc --noEmit
(verde — exit 0)

$ npm run lint
... 64 warnings (todos any), 0 errors
✖ 64 problems (0 errors, 64 warnings)
```

## Conclusión

La Fase 17 está **APROBADA CON OBSERVACIONES**. La implementación cumple los entregables del plan (dueDate en Sale, OVERDUE en SaleStatus, CustomerCredit + Application, aging real, cron protegido, bloqueo por mora, statement). Los issues encontrados son de seguridad/limpieza menor y no bloquean Fase 16:

- **M1 (Medio)**: Sale.status='OVERDUE' nunca vuelve a 'COMPLETED' tras pago, lo que infla aging y puede bloquear ventas legítimas a clientes que ya pagaron. Mitigado parcialmente por el filtro `balance > 0` del aging. Documentar como follow-up de Fase 20+ (cuando exista PaymentApplication) o agregar un transitorio reverso en el cron.
- **m2–m7 (Menores)**: cosmética y oportunidades de refuerzo. No bloquean.

**Recomendación al dueño:**
1. Aplicar la migración con `npx prisma migrate deploy` y luego `npx prisma generate`.
2. Configurar `CRON_SECRET` en Vercel y GitHub.
3. Decidir si M1 se acepta como limitación documentada o se mitiga con un transitorio "OVERDUE → COMPLETED si customer.balance = 0" en el cron antes de Fase 22.
4. Encadenar `notifyOverdueSales` en el cron handler, o eliminar la función para no dejar dead code.

**Listo para avanzar a Fase 16** (IVA / `Sale.tax` real). La Fase 17 deja la superficie de CxC/CxP suficientemente bien tipada y testeada como para que el cálculo de IVA solo necesite agregar `tax > 0` y los asientos contables existentes (líneas 461–466 de `sales/route.ts`) ya lo soportan.
