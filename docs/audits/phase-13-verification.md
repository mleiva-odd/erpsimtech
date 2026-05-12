# Fase 13 · Verification Report (Auditoría cruzada)

Fecha: 2026-05-11
Verificador: subagente independiente (segunda pasada, no implementador)
Commit auditado: `54a39fe` en `main`
Estado: **APROBADO con observaciones menores** — no bloquea Fase 14.

## 1. Alcance

Validación cruzada del deliverable de Fase 13 reportado en `phase-13-completion.md`. Se auditaron sintaxis SQL, lógica de guards, configuración de CI, archivos de Sentry, helpers de tenant y storage, y se buscaron discrepancias entre lo descrito en el completion report y el código real.

## 2. Resultados de validación

### 2.1 Compilación
| Check | Resultado | Notas |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ verde | sin warnings, exit code 0 |
| `npm run lint` (`eslint .`) | ✅ verde | sin warnings, exit code 0 |
| `@sentry/nextjs` instalado | ✅ presente | versión `10.52.0` en `node_modules/` — el `npm install` ya fue corrido en algún punto |

### 2.2 Migraciones Prisma
| Check | Resultado |
|---|---|
| Archivos presentes en `prisma/migrations/` | ✅ 10 migraciones + `migration_lock.toml` (`provider = "postgresql"`) |
| Sintaxis SQL inspeccionada manualmente | ✅ válida en las 10 |
| `ENABLE ROW LEVEL SECURITY` aplicado a 43 tablas con `companyId` + LoginAttempt (44 total) | ✅ correcto |
| `CREATE POLICY tenant_isolation` en 43 tablas | ✅ correcto (LoginAttempt excluida a propósito) |
| Patrón uniforme `current_setting('app.tenant_id', true)::text = "companyId"::text` con `WITH CHECK` | ✅ |
| Sub-models con FK a parent usan `EXISTS (SELECT 1 FROM parent ...)` | ✅ (PayrollItem, Attendance, LeaveRequest, CashRegister, CashRegisterTransaction) |
| `20260511000000_app_user_role_activation_ready` aplica `GRANT … ON ALL TABLES` + `ALTER DEFAULT PRIVILEGES` | ✅ |
| Migración nueva idempotente (DO $$ BEGIN IF NOT EXISTS) | ✅ |

### 2.3 RLS y tenant context
| Check | Resultado |
|---|---|
| `src/lib/tenant-prisma.ts`: validación UUID antes de `SET LOCAL` | ✅ `UUID_PATTERN` correcto |
| `withTenantContext(companyId, fn)` envuelve en `$transaction` con `SET LOCAL app.tenant_id` | ✅ |
| Doc explícita sobre por qué NO usar `$extends({ query })` con pgbouncer transaction pooling | ✅ |
| Endpoint diagnóstico `/api/_diagnostics/db-role` gated con `settings:manage` | ✅ |
| No expone credenciales ni secretos en la respuesta | ✅ (solo `current_user`, `bypassrls`, `tenant_isolation_active`) |

### 2.4 Storage
| Check | Resultado |
|---|---|
| `getSignedFileUrl` con TTL clamp 1s ≤ TTL ≤ 86400s (24h) | ✅ |
| `getSignedFileUrls` batch tolerante a errores por path | ✅ |
| `getPublicFileUrl` solo para bucket `products` (PUBLIC_BUCKETS explícito) | ✅ |
| Mensajes de error NO filtran detalles del provider | ✅ |
| `/api/upload/route.ts` migrado a `getPublicFileUrl` con comentario | ✅ |

### 2.5 Guard del seed
| Check | Resultado |
|---|---|
| Guard 1: `NODE_ENV === 'production'` → throw | ✅ reproducido manualmente: `Seed cannot run in production…` |
| Guard 2: `ALLOW_SEED_DESTRUCTIVE !== 'true'` → throw | ✅ reproducido manualmente: `Seed bloqueado…` |
| Guard 3: con flag `true` → continúa | ✅ |
| Ambos guards corren ANTES de instanciar `PrismaClient` | ✅ |

(Nota: la prueba runtime con `tsx prisma/seed.ts` en el sandbox falla por mismatch de plataforma de esbuild — `node_modules` se generó en darwin-arm64 y se corrió en linux-arm64. **No es problema de Fase 13.** La lógica del guard se verificó por inspección de código y por reproducción del control flow en Node puro.)

### 2.6 Sentry + global-error
| Check | Resultado |
|---|---|
| `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` presentes | ✅ |
| `enabled: process.env.NODE_ENV === 'production'` en los tres | ✅ (NB: ver observación O4) |
| `tracesSampleRate: 0.1` en prod | ✅ |
| `replaysSessionSampleRate: 0` (privacidad) + `replaysOnErrorSampleRate: 0.1` solo prod | ✅ |
| Cliente y server usan DSN separado (`NEXT_PUBLIC_SENTRY_DSN` vs `SENTRY_DSN`) con fallback | ✅ |
| `src/app/global-error.tsx` con `Sentry.captureException(error)` + UI en español + digest | ✅ |
| `next.config.ts → withSentryIfAvailable` con `require` dinámico tolerante a ausencia de paquete | ✅ |
| `hideSourceMaps: true` (source maps en Sentry pero no en bundle) | ✅ |

### 2.7 Workflow CI (`e2e`)
| Check | Resultado |
|---|---|
| Service Postgres 17 con healthcheck | ✅ |
| `prisma migrate deploy` (no `db push`) — ejercita las migrations reales | ✅ |
| Seed corre con `ALLOW_SEED_DESTRUCTIVE=true` y `SEED_*_PASSWORD` predefinidos | ✅ |
| `npx playwright install --with-deps chromium` | ✅ |
| Next.js levantado con `npm run start` (no `dev`) + curl polling 60s | ✅ |
| Cleanup: kill del PID en `if: always()` + upload del reporte Playwright | ✅ |
| Concurrency cancel `cancel-in-progress: true` | ✅ |
| Env stub global vs. env del job e2e (override correcto) | ✅ |

### 2.8 Secretos
| Check | Resultado |
|---|---|
| Grep por patrones `(password|secret|token|api_key)\s*[:=]\s*['"]` en `*.ts/*.tsx/*.yml/*.sql` | ✅ sin matches reales (solo strings de stub explícitos en `.env.example` y `ci.yml`) |
| `.env.example` solo con placeholders (`replace-with-…`, `PASSWORD`, `your-project`) | ✅ |
| Migraciones SQL sin passwords commiteados | ✅ confirmado: la nueva migración deliberadamente NO setea password (lo hace el dueño en Supabase Dashboard) |

## 3. Observaciones (no bloqueantes)

### O1 · Discrepancia entre completion report y SQL real — **MEDIA**
El reporte `phase-13-completion.md` sección 1.2 dice:

> `ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` (defensa contra escalado).

Pero el SQL real en `prisma/migrations/20260511000000_app_user_role_activation_ready/migration.sql` **no** ejecuta ese `ALTER ROLE`. El propio archivo lo explica en una nota:

> NOTA: Supabase Postgres administrado bloquea ALTER ROLE de atributos (NOSUPERUSER/NOBYPASSRLS/etc) vía supautils. Pero los defaults de Postgres después de `CREATE ROLE x NOLOGIN` ya son exactamente los correctos para este caso: NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOLOGIN. Por eso solo necesitamos crear + grants.

Conclusión: **funcionalmente seguro** porque los defaults del `CREATE ROLE x NOLOGIN` ya son los correctos, pero el completion report está desactualizado respecto al SQL que realmente se va a correr. Recomendación: corregir la sección 1.2 del completion report para que diga lo mismo que la nota en el SQL.

### O2 · `manual_migrations/` y `migrations/` NO son idénticos para la nueva — **BAJA**
El completion report (sección 1.1) dice:

> Los archivos en `prisma/manual_migrations/` quedan como referencia histórica (se mantienen sincronizados con sus equivalentes en `migrations/`).

`diff prisma/manual_migrations/20260511000000_app_user_role_activation_ready.sql prisma/migrations/20260511000000_app_user_role_activation_ready/migration.sql` muestra varias divergencias significativas. La más crítica: **la versión de `manual_migrations/` SÍ incluye el `ALTER ROLE NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` que la versión de `migrations/` correctamente omite**. Si alguien (humano o agente) aplica la versión de `manual_migrations/` por accidente en Supabase, va a fallar.

Recomendación: o (a) borrar `manual_migrations/20260511000000_…` para que no exista la versión engañosa, o (b) reemplazar su contenido por un puntero (`-- This file is historical only; the canonical SQL lives in prisma/migrations/20260511000000_app_user_role_activation_ready/migration.sql`).

### O3 · Shim de tipos `@sentry/nextjs` redundante — **MUY BAJA**
`src/types/sentry-nextjs.d.ts` existe para que typecheck pase sin el paquete instalado. Pero `@sentry/nextjs@10.52.0` **ya está en `node_modules/`**, así que el shim es deuda menor. Los tipos reales del paquete tienen precedencia, por lo que el shim no daña — solo confunde a quien lo lea pensando que el paquete no está. Recomendación: borrarlo en un cleanup futuro (no urgente).

### O4 · Sentry deshabilitado fuera de production — **A CONFIRMAR**
Los tres `sentry.*.config.ts` tienen `enabled: process.env.NODE_ENV === 'production'`. Next.js setea `NODE_ENV=production` también en builds de **preview** en Vercel, así que esto debería capturar errores tanto de Production como de Preview. No es un bug — solo confirmar que es el comportamiento deseado. Si se quiere deshabilitar Sentry específicamente en Preview, habría que cambiar la condición a `process.env.VERCEL_ENV === 'production'`.

### O5 · Riesgos ya documentados que persisten — **A SEGUIR EN FASE 14+**
Los siguientes riesgos del completion report (sección 5) **siguen vigentes** y deben tenerse presentes:
- **Drift potencial entre baseline `20260101000000_init` y producción** (el SQL se escribió a mano, no via `prisma migrate diff`). Antes de aplicar `migrate deploy` en Supabase, el dueño debería correr `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <ephemeral>` localmente. No se puede correr desde el sandbox sin red.
- **Role `app_user` queda dormante**: hasta que se migren ~50 handlers a `withTenantContext`, no se puede rotar `DATABASE_URL` a `app_user` en Production sin romper la app. Esa migración es trabajo de Fase 24 (hardening). En el ínterim, las policies RLS son una defensa-en-profundidad pero no la barrera primaria.

## 4. Conclusión

**Fase 13 cumple los entregables prometidos.** Las observaciones O1–O5 son de documentación/limpieza o riesgos ya conocidos; ninguna bloquea arrancar Fase 14.

Items recomendados antes (o durante) de Fase 14, en orden de prioridad:

1. (O1 + O2) Corregir o aclarar el reporte completion y limpiar `manual_migrations/20260511…` para que no haya dos versiones contradictorias del mismo SQL.
2. (O5) Cuando el dueño tenga shell local con red a Supabase, correr `prisma migrate diff` para validar que la baseline refleja la DB real **antes** de hacer `prisma migrate deploy`.
3. (O3) En cualquier momento futuro: borrar el shim Sentry.
4. (O4) Decidir si Preview debe reportar a Sentry o no (no hay decisión visible documentada).

**Listo para arrancar Fase 14 (Plan de cuentas + partida doble + cierre de período).**
