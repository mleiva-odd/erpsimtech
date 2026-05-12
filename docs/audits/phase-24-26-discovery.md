# Fases 24-26 · Discovery — Hardening / QA / Operaciones

Fecha: 2026-05-11
Auditor: agente principal (en lugar de subagente, que se cortó por rate limit)
Modo: READ-ONLY (Read/Grep). No se modificó código.

---

## 1. Resumen ejecutivo

- **Cuotas reales: el sistema NO las aplica.** `checkQuota` está definido en `src/lib/plans.ts:457` con lógica completa, pero **no se llama desde ningún handler** (`grep` retorna 0 hits en `src/app/api/`). Toda la cuota declarada en `PlanQuotas` (branches, users, products, salesPerMonth, payrollEmployees, storageMb, apiAccess, legalEntities) es **decorativa**. Un cliente en plan `negocio` con `maxBranches=1` puede crear las que quiera. **SEVERIDAD CRÍTICA**: el modelo comercial del SaaS no se cumple en producción.
- **Tests unitarios: 0.** No hay `*.test.ts` ni `*.spec.ts` en `src/`. La meta del plan (cobertura ≥60%) implica empezar literalmente desde cero en Fase 25.
- **Tests e2e: 2 archivos, 239 líneas totales.** `e2e/checkout.spec.ts` (78 líneas) y `e2e/multi-tenant-isolation.spec.ts` (161). El workflow de CI los corre (Fase 13 habilitó el job e2e), pero **`multi-tenant-isolation.spec.ts` necesita dos tenants seedeados** y el seed actual solo crea uno; ese test probablemente falla en CI o se salta. Hay que extender el seed o usar `scripts/create-restricted-company.ts` desde el step de CI.
- **75 handlers REST + 0 migrados a `withTenantContext`.** Toda la app sigue conectando como role `postgres` (BYPASSRLS). El switch a `app_user` (RLS activa) no es viable sin esta migración. El plan no incluye explícitamente "migrar 75 handlers" en ninguna fase específica — queda como trabajo implícito en Fase 24 (hardening). **Volumen real: 2-3 días de un agente competente.**
- **Supabase plan FREE (no NANO pago como asume el plan):** el plan de Fase 26 dimensiona backups con "retención 3-7 días" pensando en NANO. **Realidad de FREE:**
  - Backups automáticos: solo último día, sin PITR.
  - Proyecto se **pausa después de 7 días de inactividad** (gravísimo: si el cliente no usa el sistema una semana, el sistema queda offline hasta que alguien lo reactive).
  - Límites de DB y egress más ajustados.
  - **El plan necesita ajuste:** backup mensual manual descargado fuera de Supabase pasa de "opcional recomendado" a **obligatorio**, y hay que documentar un cron que toque la DB cada 6 días para evitar la pausa.
- **Bugs silenciosos del plan Fase 24:** **12 de 13 siguen abiertos** (confirmado uno por uno abajo, sección 3). El único arreglado es la integración de `requireBranchAccess`, que sí está siendo usado en 4 endpoints (sales, cash-register, dashboard charts, dashboard root).
- **Runbook de incidentes: no existe.** Solo hay `docs/operations/credentials-rotation.md` (rotación, no incidentes). Fase 26 lo crea desde cero.
- **Stage environment: no existe.** Vercel Preview hace de proxy, pero no hay Supabase stage separado.
- **Health check `/api/health`: no existe** (sí hay `/api/_diagnostics/db-role` de Fase 13, pero requiere permiso `settings:manage` — no sirve como liveness probe).

**Conclusión:** las Fases 24-26 son más voluminosas de lo que el plan sugiere. **Recomendación**: dividir Fase 24 en dos sub-fases (24a: aplicar cuotas reales + migrar handlers a withTenantContext; 24b: cerrar bugs silenciosos remanentes), y ajustar Fase 26 a la realidad de Supabase FREE antes de implementarla.

---

## 2. Cuotas (Fase 24 · `checkQuota` aplicado en endpoints)

### Estado actual

`src/lib/plans.ts:457-498` define la función `checkQuota(planId, resource, current)`:

```ts
export function checkQuota(
  planId: PlanId,
  resource: keyof PlanQuotas,
  current: number,
): QuotaCheckResult {
  // ... lógica correcta: compara current vs plan.quotas[resource],
  //     soporta -1 (ilimitado), boolean (apiAccess), string (support).
}
```

`PlanQuotas` (líneas 41-52) cubre los recursos correctos: `branches`, `users`, `products`, `salesPerMonth`, `storageMb`, `legalEntities`, `apiAccess`, `support`, `payrollEmployees`.

### Realidad

```
$ grep -rn "checkQuota" --include="*.ts" --include="*.tsx" src/
src/lib/plans.ts:457:export function checkQuota(
```

**Una sola ocurrencia: la definición.** Cero llamadas. La función está muerta.

Lugares donde el plan Fase 24 manda llamarla, todos sin llamada:

| Recurso | Handler que debe gatear | Estado |
|---|---|---|
| `maxProducts` | `POST /api/products` (línea 1 de `src/app/api/products/route.ts`) | Sin check |
| `maxBranches` | `POST /api/branches` | Sin check |
| `maxUsers` | `POST /api/users` | Sin check |
| `maxSalesPerMonth` | `POST /api/sales` y `POST /api/pos/...` | Sin check |
| `maxPayrollEmployees` | `POST /api/hr/employees` | Sin check |
| `apiAccess` | endpoints "públicos" (si los hay) | N/A — no hay endpoints públicos hoy |

`Subscription` (`prisma/schema.prisma:472-489`) tiene `maxBranches` y `maxUsersPerBranch` como columnas, pero **tampoco se consultan** desde ningún handler. Solo se setean al crear empresa (`POST /api/admin/companies`) con valores hardcoded.

### Severidad y recomendación

**CRÍTICA.** El SaaS no impone su modelo comercial. Cualquier cliente puede exceder su plan libremente. Es el primer trabajo concreto de Fase 24.

Esfuerzo estimado: **1-1.5 días** (5 endpoints a parchear + tests de cuota + UI que muestre "cuota alcanzada" con CTA a upgrade).

---

## 3. Bugs silenciosos del plan Fase 24 — estado actual

El plan enumera 13 bugs silenciosos a cerrar en Fase 24. Verificación uno por uno:

| # | Bug | Estado actual | Referencia |
|---|---|---|---|
| 1 | IVA en `Sale` no hardcoded | **ABIERTO** | `src/app/api/sales/route.ts:251` → `tax: 0` literal |
| 2 | `SaleItem.discount` integrado en cálculos | **ABIERTO** | Columna existe en schema (`prisma/schema.prisma:431`) pero `grep` retorna 0 escrituras y 0 lecturas en `src/` |
| 3 | Devolución `CARD`/`TRANSFER` genera `BankTransaction` | **ABIERTO** (parcialmente) | Comentario "Create BankTransaction if applicable" en `src/app/api/sales/route.ts:313` no garantiza la rama para refunds; el discovery de Fase 20 confirma que `pos/returns` no genera BankTransaction |
| 4 | `DeliveryNote.noteNumber` con lock anti-colisión | **ABIERTO** | Confirmado por discovery de Fase 20 (`src/app/api/delivery-notes/route.ts:88-99` genera sin lock) |
| 5 | Anulación reversa el ingreso original (no crea `EXPENSE` paralelo) | **ABIERTO** | `src/app/api/sales/[id]/route.ts:149,162,183,187` crea `type: 'EXPENSE'` con categoría "Devoluciones POS" |
| 6 | `PurchaseOrder.reference` con `@@unique(companyId, supplierId, reference)` opcional | **ABIERTO** | `prisma/schema.prisma`: `reference String?` sin unique constraint |
| 7 | Validación de saldo bancario activa en payments | **ABIERTO** | `src/app/api/accounting/payables/[id]/payments/route.ts:41` tiene comentario: "We will allow it for now, but deduct it in BankTransaction" |
| 8 | `PurchaseOrderItem.quantity` migrado a `Decimal` | **ABIERTO** | Sigue siendo `Int` (confirmado por discovery de Fase 19) |
| 9 | Cron OVERDUE diario | **ABIERTO** | Cero crons en el repo (no hay `pg_cron`, no hay scheduled function, no hay cron en Vercel) |
| 10 | Bonificación incentivo Q250 proporcional al período | **ABIERTO** | Discovery de Fase 18 confirma: Q250 constante, no prorrateada |
| 11 | `UserBranchAccess` realmente respetado en `requireBranchAccess` | **PARCIAL** | `requireBranchAccess` existe en `src/lib/tenant.ts:168` y se llama en 4 endpoints (sales, cash-register history, dashboard, dashboard charts). Falta validar que TODOS los endpoints branch-scoped lo usen (inventory, products por sucursal, cash-register POST, stock-transfers, etc.) |
| 12 | `checkQuota` llamado en endpoints relevantes | **ABIERTO** | Ver sección 2 |
| 13 | `useEffectEvent` reemplazado | **ABIERTO** | `src/components/layout/NotificationsMenu.tsx:3,22` sigue importándolo y usándolo |

**12 de 13 abiertos, 1 parcial.** Esfuerzo estimado para cerrarlos todos: **4-6 días** (muchos son one-liners; otros como #5 y #1 implican refactor de Sale POST/anulación que ya está dentro del scope de Fases 14, 16, 20).

**Nota importante:** los bugs 1, 5 son cerrados implícitamente por Fases 14/16/20 (no son trabajo extra). Bugs 2, 4, 6, 8 también caen dentro de Fases 19-20. **El trabajo neto de Fase 24 sobre bugs silenciosos es menor de lo que parece** — son los items 3, 7, 9, 10, 11, 12, 13.

---

## 4. Migración de handlers a `withTenantContext`

**No explícitamente en el plan**, pero crítico para activar el role `app_user` (objetivo de Fase 13 dormido).

```
75 archivos route.ts en src/app/api
0 archivos usando withTenantContext o forTenant
```

Sin esta migración, no hay punto en haber creado el role `app_user` ni en haber activado RLS. La defensa-en-profundidad existe pero está dormida.

Recomendación: **agregar como entregable explícito de Fase 24 o como mini-fase 24a**. Esfuerzo: 2-3 días para migrar 75 handlers (la mayoría son one-liners: cambiar `prisma.sale.findMany(...)` por `await withTenantContext(tenant.companyId, (tx) => tx.sale.findMany(...))`).

Riesgo: handlers que ya usan `prisma.$transaction` explícitamente necesitan re-encajar el `SET LOCAL`. Se necesita un patrón coherente.

---

## 5. Tests existentes (Fase 25)

### Unit tests

```
find src/ -name "*.test.ts" -o -name "*.spec.ts"
(no output)
```

**Cero tests unitarios.** Fase 25 manda cobertura ≥60% en lógica crítica:
- Cálculo de costo promedio ponderado (Fase 15)
- Cálculo de ISR/Bono14/Aguinaldo/Indemnización (Fase 18)
- Validación de partida doble (Fase 14)
- Aging buckets (Fase 17)
- IVA por línea por régimen (Fase 16)
- Diferencia cambiaria (Fase 21)

Esfuerzo realista para tests unitarios + setup de Vitest/Jest: **3-4 días**.

### E2E

```
e2e/checkout.spec.ts                    78 líneas
e2e/multi-tenant-isolation.spec.ts     161 líneas
                                       239 total
```

`checkout.spec.ts`: flujo POS básico (login → carrito → checkout).
`multi-tenant-isolation.spec.ts`: valida cross-tenant data leakage. **Requiere 2 tenants seedeados** (A y B) y el seed actual solo crea uno. Probable falla silenciosa en CI.

Faltan tests para los flujos del plan Fase 25:
- Venta con FEL Mock (Fase 16)
- Compra con GRN parcial (Fase 19)
- Cierre de período + intento de editar entry posterior (Fase 14)
- Cobranza con bloqueo por mora (Fase 17)
- Planilla mensual completa (Fase 18)

Esfuerzo realista para e2e expansion: **2-3 días**.

### Configuración CI

`.github/workflows/ci.yml` ya tiene job `e2e` (habilitado en Fase 13). Para Fase 25 hay que:
1. Extender el seed para dos tenants (o llamar a `scripts/create-restricted-company.ts` desde CI).
2. Configurar Vitest/Jest + threshold de coverage.
3. Agregar job `unit-tests` antes de `build`.
4. Subir cobertura a Codecov u otro (opcional).

---

## 6. Sentry, observability, health check

### Sentry

Configurado en Fase 13 (`sentry.{client,server,edge}.config.ts`, `withSentryIfAvailable` en `next.config.ts`).

`next.config.ts:121-122`:
```ts
widenClientFileUpload: true,
hideSourceMaps: true,
```

Source maps **se suben a Sentry** pero **no se sirven en el bundle**. Bien.

Pendiente Fase 24 según plan: "Sentry configurado para frontend con source maps". → **ya está hecho en Fase 13**. Item del plan que se puede tachar.

### `/api/health`

```
find src/app/api -type d -name "health"
(no output)
```

**No existe.** Fase 24 lo pide. Esfuerzo: 30 min (endpoint que valida DB con `SELECT 1` y devuelve 200/503).

Hoy, lo más cercano es `/api/_diagnostics/db-role` (Fase 13), pero requiere `settings:manage` — no sirve como liveness probe.

---

## 7. Operaciones (Fase 26)

### Backups

Plan Fase 26 asumió Supabase NANO ($25/mo): "snapshots diarios con retención 3-7 días".

**Realidad Supabase FREE:**

| Característica | NANO ($25/mo) | FREE (actual) |
|---|---|---|
| Backups automáticos | últimos 7 días | **último 1 día**, sin PITR |
| Auto-pausa por inactividad | nunca | **después de 7 días sin actividad** |
| DB size | 500 MB | 500 MB |
| Egress/mes | 5 GB | 2 GB |
| Branching | sí | no |
| Compute | mejor | el más bajo |

**Implicaciones críticas para el plan:**

1. **Backup mensual manual descargado fuera** pasa de "opcional recomendado" a **obligatorio**. Sin esto, una pérdida de DB > 24 hs es irrecuperable.
2. **Pausa por inactividad es el riesgo más serio.** Si un cliente PYME no usa el sistema una semana (vacaciones, feria, navidad), la DB se pausa y el ERP queda offline. Próxima sesión: 5-30 min de espera para reactivar.
3. **Mitigación necesaria:** cron externo (GitHub Actions schedule o cron-job.org) que toque `/api/health` cada 6 días para evitar la pausa.
4. **Documentar plan de migración a NANO/PRO**: cuándo migrar, qué cambia, cómo restaurar de un backup descargado manualmente.

### Stage environment

**No existe.** Solo Vercel Preview, pero apunta a la misma DB de producción (probable; necesita confirmación con dueño).

Fase 26 lo pide: stage env separado con datos sintéticos. En Supabase FREE no es trivial (otro proyecto FREE = otra cuenta o pasar a paid).

Alternativa pragmática: usar Postgres efímero del workflow e2e como "stage" y limitar manual testing a Production con datos de prueba clearly marked.

### Smoke tests post-deploy

`docs/DEPLOY_CHECKLIST.md` documenta humo funcional **manual** (login, apertura caja, etc.). No hay script automatizado.

Esfuerzo Fase 26: 1 día para script que valide login + crear venta + crear compra + ver reporte.

### Runbook de incidentes

**No existe.** Solo `credentials-rotation.md` (rotación). Falta runbook de incidentes:

- DB down
- RLS rompe (denial silencioso de queries)
- FEL provider down (cuando se conecte)
- Planilla con error
- Vercel deploy fallido
- Supabase pausado por inactividad
- Filtración de credenciales

Fase 26 lo crea. Esfuerzo: 1-2 días.

### Restore drill

Plan pide drill trimestral. Hoy no se ha hecho ninguno.

Recomendación: scriptear `npx supabase db dump > backup.sql && diff baseline.sql backup.sql` y probarlo. Documentar el procedimiento end-to-end.

---

## 8. 2FA — discrepancia en el plan

El plan tiene una contradicción menor:

- Línea 41 del plan: "Fase 24 · Hardening: bugs silenciosos + cuotas reales + 2FA TOTP"
- Línea 355: "Nota: 2FA TOTP queda **fuera de alcance** (decisión del dueño 2026-05-10)"

El título de la Fase 24 menciona 2FA TOTP pero la sección lo excluye explícitamente. **Recomendación:** corregir el título de la Fase 24 para que no incluya "2FA TOTP", evitando confusión a futuros agentes.

---

## 9. `DEPLOY_CHECKLIST.md` desactualizado

El checklist menciona:
- `npm run prisma:push` para crear esquema → ya no es la práctica (Fase 13 introdujo `prisma migrate deploy`)
- Aplicar SQL de `manual_migrations/` manualmente → ahora vive en `prisma/migrations/`
- No menciona el nuevo flujo `prisma migrate resolve --applied` para baselines existentes

Fase 26 debe actualizar este doc, alineado con el runbook de credenciales y el nuevo flujo de migraciones.

---

## 10. Preguntas abiertas para el dueño

1. **Dimensionamiento Supabase FREE:** ¿el plan es quedarse en FREE indefinidamente, o pasar a NANO/PRO cuando haya N clientes? Esto define si Fase 26 invierte en mitigar pausa-por-inactividad o en migrar a paid antes.
2. **2FA TOTP:** confirmar que sigue excluido. Si sí, corregir título de Fase 24.
3. **Stage environment:** ¿aceptamos hacer Fase 26 sin stage separado (probable, dado FREE tier)? Alternativa: stage manual con Supabase Free de otra cuenta y datos sintéticos vía seed.
4. **Cron externo para evitar auto-pausa:** ¿usar GitHub Actions schedule (gratis) o un servicio externo (cron-job.org)? GitHub Actions es la opción recomendada porque ya está en infraestructura.
5. **Mini-fase 24a:** ¿OK dividir Fase 24 en 24a (cuotas + handler migration) y 24b (bugs silenciosos remanentes)? Mejora la legibilidad del progreso.

---

## 11. Recomendaciones específicas

### Para Fase 24
- Renombrar a "Fase 24 · Hardening: cuotas + handler migration + bugs silenciosos".
- Agregar entregable explícito: **migrar 75 handlers a `withTenantContext`**.
- Reducir lista de bugs silenciosos a los que NO son cerrados por fases anteriores (3, 7, 9, 10, 11, 12, 13 según sección 3).
- Marcar como ya hecho: source maps Sentry (vino con Fase 13).

### Para Fase 25
- Empezar con setup de Vitest (no hay framework de tests unitarios todavía).
- Tests unitarios primero en `src/lib/*` (puro, sin DB). Después en handlers.
- Coverage threshold ≥60% en `src/lib/`, ≥40% global (más realista que 60% global).
- Extender seed para dos tenants antes que cualquier e2e cross-tenant.

### Para Fase 26
- Acomodar al free tier o pedir green-light para migrar a paid antes.
- Cron externo en GitHub Actions: schedule `0 */144 * * *` (cada 6 días) → `curl https://erp.simtechgt.com/api/health`.
- Backup mensual manual obligatorio, no opcional.
- Stage env: aceptar uno mínimo (Supabase Free segundo proyecto + Vercel Preview).
- Runbook de incidentes con secciones: DB down, RLS rompe, Supabase pausado, deploy fallido, filtración cred.

---

## 12. Estimación de esfuerzo

| Sub-fase | Trabajo | Días |
|---|---|---|
| 24a · Cuotas + handler migration | 5 endpoints cuota + 75 handlers `withTenantContext` + tests | 3-4 |
| 24b · Bugs silenciosos remanentes | 7 bugs (los que no caen en otras fases) | 1-2 |
| 25 · Tests + docs | Setup Vitest + tests unit lib + e2e expansion + docs/user + docs/technical | 5-7 |
| 26 · Ops | Health check + smoke script + runbook + cron anti-pausa + backup mensual + stage mínimo | 3-4 |

**Total estimado**: 12-17 días para cerrar el sprint final (Fases 24-26). El plan original asumía menos porque no contemplaba (a) cuotas son 0% aplicadas, (b) 75 handlers a migrar, (c) Supabase FREE en lugar de NANO, (d) 0 tests unit como base.
