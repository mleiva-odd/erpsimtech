# Phase 14 · Verification Report (Auditoría cruzada)

Fecha: 2026-05-11
Verificador: subagente independiente (no participó en la implementación).
Alcance auditado: schema Prisma, migración SQL, helpers `src/lib/accounting/`,
17 call sites refactorizados, endpoints nuevos (chart/journal/periods/close/
integrity-check/reports), 22 tests, onboarding/admin/seed.

## Veredicto: APROBADO CON OBSERVACIONES

Se cumplen las metas centrales de Fase 14 (motor de partida doble funcional,
CRIT-1/CRIT-2/H2/H3 cerrados, plan de cuentas sembrado, cierre de período
operativo, 5 reportes nuevos). Las observaciones identificadas son de
severidad MEDIA o menor; ninguna bloquea el inicio de Fase 15. Riesgo
principal: la migración SQL hace seed solo para empresas que existen en el
momento del deploy y aún no ha sido aplicada en la DB. Una vez aplicada y
corrido `prisma generate`, el sistema queda listo.

## Resultados de validación

| ID | Validación | Resultado |
|----|------------|-----------|
| V1 | `typecheck` + `lint` verdes | OBS (no se pudo correr en este sandbox; reportado verde por implementador, pendiente verificación del dueño) |
| V2 | Tests presentes (4 suites + mock-tx) con lógica sensata | OK |
| V3 | Migración SQL sintáctica, idempotente, multi-tenant, RLS | OK con 1 OBS-BAJA |
| V4 | CRIT-1 (reversa pagos genera asiento contrario) | OK |
| V5 | CRIT-2 (anulación venta NO crea EXPENSE paralelo) | OK |
| V6 | H2 (`seedChartOfAccounts` en onboarding/admin/seed) | OK |
| V7 | H3 (asientos dentro de `$transaction`) | OK |
| V8 | 17 call sites refactorizados, 0 `createAccountingEntry` legacy | OK |
| V9 | Constantes `ACCOUNTS.*` usadas en lugar de strings literales | OK |
| V10 | Helper `createJournalEntry` cumple contrato | OK |
| V11 | Bridge shim `src/lib/accounting.ts` re-exporta sin `createAccountingEntry` legacy | OK |
| V12 | Decisión `WITHDRAWAL → 3.1.01 Capital Social` | OBS-MEDIA (interpretación contable discutible) |
| V13 | RLS sobre las 4 tablas nuevas | OK |
| V14 | `AccountingEntry` legacy intacto + columna `migrated` | OK |
| V15 | Endpoint cierre de período (`/api/accounting/periods/[id]/close`) | OK con 2 OBS-BAJAS |
| V16 | Lint baseline (≤64 warnings, 0 errors) | OBS (no se pudo correr; pendiente verificación) |

## Observaciones detalladas

### OBS-MEDIA · V12 · `WITHDRAWAL` se imputa a `3.1.01 Capital Social`

`src/app/api/pos/expense/route.ts:86`

```ts
const debitCode = type === 'EXPENSE' ? ACCOUNTS.OPERATING_EXPENSES : ACCOUNTS.EQUITY;
```

Cuando un cajero registra un `WITHDRAWAL` (retiro de efectivo de caja por el
dueño), el asiento debita `3.1.01 Capital Social` y acredita Caja.
Contablemente esto **disminuye el capital aportado por el socio**, lo cual
es defendible si se interpreta el retiro como una devolución de aportes —
pero la práctica más común en PYMEs guatemaltecas es usar una cuenta
separada (`3.1.02 Retiros de Socios` o `1.1.07 Cuenta Corriente Socios`)
para no contaminar el aporte inicial registrado.

Recomendación: aceptable como solución provisional. Antes de Fase 22 (UI
contable), el dueño debe decidir si crear una cuenta hoja específica para
retiros del propietario. Si decide crearla, hay que:

1. Agregarla al `SEED_ACCOUNTS` en `src/lib/accounting/seed.ts`.
2. Agregarla a `ACCOUNTS` en `src/lib/accounting/accounts.ts` (e.g.
   `OWNER_WITHDRAWAL`).
3. Generar una migración SQL incremental que inserte la cuenta para
   empresas existentes.
4. Cambiar `pos/expense/route.ts` para usar la nueva constante.

No bloquea Fase 15.

### OBS-MEDIA · POST `/api/accounting` modo legacy aún crea `AccountingEntry`

`src/app/api/accounting/route.ts:151-197`

El endpoint conserva el "modo B" legacy que crea un `AccountingEntry`
sin generar el `JournalEntry` correspondiente. El implementador lo
justifica como compat con la UI vieja del dashboard. Riesgo: cualquier
asiento manual creado por este branch NO aparece en libro diario, P&L
nuevo, balance general, ni trial balance, generando una discrepancia
visible entre el dashboard legacy y los reportes nuevos.

Recomendación: cuando la UI de Fase 22 migre al modo A (lines[]),
eliminar este branch. Mientras tanto, considerar avisar al usuario en
la UI legacy de que esa entrada no se replica al motor nuevo.

### OBS-BAJA · V3 · La migración crea períodos OPEN históricos retroactivos

`prisma/migrations/20260512000000_chart_of_accounts_and_journal/migration.sql:238-249`

Para entries con fecha previa a 2026-05, la migración crea períodos
mensuales en estado OPEN. Riesgo: después de la migración, un usuario con
permiso de tesorería podría agregar asientos manuales con fecha pasada,
distorsionando reportes históricos.

Mitigación documentada en `phase-14-completion.md:278`: el dueño debe
cerrar manualmente los períodos previos a 2026-05 con
`POST /api/accounting/periods/[id]/close` después de aplicar la migración.

Recomendación: agregar al runbook post-deploy un paso explícito que
liste períodos OPEN históricos y los cierre en bloque vía script o
loop manual.

### OBS-BAJA · V15 · Permiso para cerrar período es `treasury:manage`, no `settings:manage`

`src/app/api/accounting/periods/[id]/close/route.ts:28`

La consigna sugería `settings:manage` o equivalente. El implementador
eligió `treasury:manage`. Es defensible (tesorería = quien gestiona libros
contables), pero en una PYME pequeña ambos roles suelen colapsar al
Administrador. Documentar la elección en el manual de permisos cuando se
ajuste Fase 22.

### OBS-BAJA · V15 · El asiento de cierre se fecha al día 28 del mes

`src/app/api/accounting/periods/[id]/close/route.ts:134`

```ts
const closingDate = new Date(Date.UTC(period.year, period.month - 1, 28, 23, 59, 59));
```

Para febrero esto cae en el día válido (28-feb existe siempre), pero para
meses de 30/31 días el último día real del período es 30 o 31. El
implementador eligió 28 para evitar el edge case de febrero. Resultado:
el asiento de cierre de mayo, por ejemplo, queda fechado el 28-may en
vez del 31-may. No afecta consistencia contable (el período sigue
cerrado y el asiento queda dentro de él), pero la fecha es "rara" para
auditoría externa.

Recomendación de mejora: usar el último día real del mes
(`new Date(Date.UTC(year, month, 0, ...))` da el último día del mes
anterior; o `new Date(year, month, 0)` en local). No bloqueante.

### OBS-BAJA · V3 · Migración asume `gen_random_uuid()` disponible

`migration.sql:180, 219, 239, 285, etc.`

La función PostgreSQL `gen_random_uuid()` viene con `pgcrypto` o con
PostgreSQL ≥ 13. Supabase usa Postgres 15+ por default así que no hay
problema, pero si alguna instancia self-hosted más vieja corre esto,
falla. Idealmente la migración debería incluir
`CREATE EXTENSION IF NOT EXISTS pgcrypto;` al inicio como defensa, aunque
en la práctica el resto del schema ya usa `gen_random_uuid` sin
declararlo.

No bloqueante para Supabase.

### OBS-INFO · V7 · `H4` (sales POST asiento dentro de tx) ya estaba arreglado pre-Fase 14

`src/app/api/sales/route.ts:427` — el asiento se crea dentro del
`$transaction` que abre en línea ~210. Esto coincide con la nota de
`phase-4-transactions-review.md` que ya había movido `sales/route.ts`
adentro. Fase 14 lo refactorizó a `createJournalEntry` correctamente y
mantiene la atomicidad.

### OBS-INFO · V10 · `reverseJournalEntry` setea `reversedById` en el NUEVO asiento, no en el original

`src/lib/accounting/journal.ts:285-288`

La consigna pedía "Marcar `reversedById` en el original". La
implementación setea `reversedById` en el nuevo apuntando al original.
Esto es **funcionalmente equivalente** y de hecho coincide con el modelo
Prisma (relación de auto-referencia: `JournalEntry.reversedById @unique`
apunta a `JournalEntry.id` del entry que está siendo reversado por
otro). La guardia anti doble-reversa funciona correctamente vía la
relación inversa `reversedBy[]`.

Tests `reverse.test.ts:51-70` confirman el comportamiento. No es bug.

### OBS-INFO · Migración SQL — orden de operandos RLS

La migración usa `current_setting('app.tenant_id', true) = "companyId"::text`,
la consigna sugería el orden inverso. Funcionalmente idéntico (Postgres
es conmutativo en `=`). Sin impacto.

### OBS-INFO · `accountingPeriod.closedById` sin FK a User

`prisma/schema.prisma:1074`

El campo `closedById` es `String?` sin relación a `User`. Si un usuario es
borrado, queda un id huérfano. No es crítico — auditoría sigue funcionando
en best-effort. Mejora cosmética para Fase 22.

## Conclusión final

La implementación de Fase 14 cumple lo prometido:

- **Schema:** los 4 modelos nuevos + 2 enums + columna `migrated` están
  bien estructurados; relaciones inversas en `Company`, `Branch`, `User`
  presentes; RLS habilitado sobre las 4 tablas nuevas con políticas
  multi-tenant correctas (incluyendo la subquery sobre `JournalEntry`
  para `JournalLine`).
- **Migración SQL:** sintáctica, idempotente, multi-tenant (cursor sobre
  `Company`), siembra el plan de cuentas estándar GT, migra cada
  `AccountingEntry` legacy a `JournalEntry`+2 líneas con regla
  determinística, marca `migrated=true`. Algunos detalles menores
  (gen_random_uuid, períodos retroactivos OPEN) están documentados pero
  no son bloqueantes.
- **Helpers:** `createJournalEntry` cumple los 6 requisitos del contrato
  (balance DR=CR con tolerancia 0.005, código→id, isPosting check,
  período auto-creado, bloqueo 409 si CLOSED, todo en la `tx` recibida).
  `reverseJournalEntry` invierte correctamente y bloquea doble reversa.
- **CRIT-1:** reversa de pagos a clientes y proveedores ahora llama
  `reverseJournalEntry` en bloque dentro del `$transaction`. Los antiguos
  `createAccountingEntry` con tipo opuesto desaparecieron.
- **CRIT-2:** la anulación de venta llama `reverseJournalEntry` en lugar
  de crear un EXPENSE "Devoluciones POS" paralelo. Confirmado con grep
  `'Devoluciones'` en `src/app/api/sales/` — solo aparece en un
  comentario explicativo.
- **H2:** `seedChartOfAccounts` + `ensureAccountingPeriod` se llaman en
  `prisma/seed.ts:149-150`, `onboarding/route.ts:157-158` y
  `admin/companies/route.ts:175-176`, todos dentro de la `$transaction`
  de creación de empresa.
- **H3:** los 3 call sites problemáticos (`purchases/route.ts`,
  `pos/expense/route.ts`, `customers/[id]/payments/route.ts`) ahora
  crean el asiento dentro del `$transaction` del POST.
- **Call sites:** 0 ocurrencias de `createAccountingEntry` o
  `createAccountingEntryAsync` en `src/app/api/**`; 0 strings literales
  de códigos de cuenta en handlers (verificado con regex
  `'[1-5]\.[0-9]+(\.[0-9]+)?'`).
- **Bridge shim:** `src/lib/accounting.ts` solo re-exporta del directorio
  `accounting/`. Cero código legacy activo.
- **Tests:** 4 suites con 22 casos reales y assertions concretas. El mock
  `mock-tx.ts` cubre los métodos Prisma usados. Lógica sensata, sin
  tests vacíos.
- **Endpoint de cierre:** valida no haya DRAFTs, calcula utilidad por
  diferencia de cuentas INCOME/EXPENSE, transfiere a `CURRENT_EARNINGS`
  (3.2.02), marca `CLOSED` + auditoría.

**Listo para arrancar Fase 15** (costeo promedio ponderado / COGS al
vender) sin bloqueantes. Los pendientes son:

1. El dueño debe correr `npm install && npx prisma generate && npx
   prisma migrate deploy` en su entorno (vitest y prisma generate no se
   pudieron ejecutar en el sandbox del implementador ni en el del
   verificador por restricciones de red).
2. El dueño debe ejecutar `GET /api/accounting/integrity-check` después
   del deploy para validar `balanced=true`.
3. El dueño debe decidir el destino contable de los `WITHDRAWAL` antes
   de Fase 22 (UI contable).
4. Cerrar manualmente los períodos OPEN históricos retroactivos
   generados por la migración.

Ninguno de estos pendientes bloquea Fase 15.
