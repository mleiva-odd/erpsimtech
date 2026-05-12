# Fase 13 · Completion Report

Fecha: 2026-05-11
Subagente: devops/infra
Estado: implementación completa, pendiente verificación cruzada por segundo subagente y aplicación manual en Supabase/Vercel por el dueño.

## 1. Qué se hizo

### 1.1 Migraciones Prisma reales
Convertidas a directorios `prisma/migrations/<timestamp>_<slug>/migration.sql`:

| Migración | Origen | Estado |
|---|---|---|
| `20260101000000_init` | baseline escrita a mano (equivalente a `prisma migrate diff --from-empty --to-schema-datamodel`) | refleja el schema actual; ya aplicada en Supabase |
| `20260415210700_sales_idempotency_and_returns` | `manual_migrations/20260415_sales_idempotency_and_returns.sql` | ya aplicada |
| `20260415215700_account_payment_cash_register` | `manual_migrations/20260415_account_payment_cash_register.sql` | ya aplicada |
| `20260415220200_sale_item_unit_cost` | `manual_migrations/20260415_sale_item_unit_cost.sql` | ya aplicada |
| `20260417172500_company_settings_alignment` | `manual_migrations/20260417_company_settings_alignment.sql` | ya aplicada |
| `20260509100000_add_login_attempt_for_rate_limit` | `manual_migrations/20260509_add_login_attempt_for_rate_limit.sql` | ya aplicada |
| `20260509110000_enable_rls_all_public_tables` | `manual_migrations/20260509_enable_rls_all_public_tables.sql` | ya aplicada |
| `20260509120000_add_tenant_isolation_policies` | `manual_migrations/20260509_add_tenant_isolation_policies.sql` | ya aplicada |
| `20260509130000_create_app_user_role_dormant` | `manual_migrations/20260509_create_app_user_role_dormant.sql` | ya aplicada |
| `20260511000000_app_user_role_activation_ready` | nueva (Fase 13) | **PENDIENTE de aplicar** |

Archivo `prisma/migrations/migration_lock.toml` creado con `provider = "postgresql"`.

Los archivos en `prisma/manual_migrations/` quedan como referencia histórica (se mantienen sincronizados con sus equivalentes en `migrations/`). El nuevo archivo `prisma/manual_migrations/20260511000000_app_user_role_activation_ready.sql` es la copia pareja del nuevo `migrations/20260511000000_app_user_role_activation_ready/migration.sql` para mantener el patrón histórico del proyecto.

### 1.2 Role Postgres `app_user` (sin BYPASSRLS)
- Nueva migración `20260511000000_app_user_role_activation_ready/migration.sql`:
  - Re-asegura `CREATE ROLE app_user NOLOGIN` (idempotente).
  - **No ejecuta `ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`**: Supabase Postgres bloquea ese ALTER vía la extensión `supautils`. Defensa equivalente: los defaults de `CREATE ROLE x NOLOGIN` son exactamente esos (NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS por default), así que no necesitamos forzarlos explícitamente. Verificable post-migración con `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'app_user'`.
  - `GRANT USAGE/SELECT/INSERT/UPDATE/DELETE` sobre `public` schema y todas sus tablas.
  - `GRANT USAGE, SELECT` sobre todas las secuencias.
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public ...` para que tablas/secuencias futuras hereden grants automáticamente. **Crítico** — sin esto, cada nueva tabla creada por migrations sería invisible para `app_user`.

> Corrección 2026-05-11 (verificación cruzada): la versión inicial de esta sección decía que la migración ejecutaba `ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`. El SQL real no lo hace por la restricción de Supabase. Funcionalmente equivalente, pero el texto se actualizó para que coincida con el código aplicable.

### 1.3 RLS verificada
- Auditoría: las 43 tablas con `companyId` (directo o vía relación) ya tienen `tenant_isolation` policy aplicada (`prisma/migrations/20260509120000_add_tenant_isolation_policies`).
- LoginAttempt (44ª tabla con RLS habilitada) deliberadamente sin policy de tenant (pre-auth, sin companyId; mantiene deny-all para anon).
- Patrón: `current_setting('app.tenant_id', true)::text = "companyId"::text` con `WITH CHECK` y `EXISTS (SELECT 1 FROM parent ...)` para sub-models.
- `src/lib/tenant-prisma.ts` ya implementaba `forTenant(companyId).withTx(...)`. Se reforzó con:
  - Constante `UUID_PATTERN` para validar `companyId` antes de inyectarlo en `SET LOCAL`.
  - Nuevo alias `withTenantContext(companyId, fn, options?)` para uso directo en handlers (`await withTenantContext(tenant.companyId, (tx) => tx.sale.findMany(...))`).
  - Bloque de documentación explicando por qué NO se expone una variante `prisma.$extends({ query })` (riesgo de race condition con pgbouncer transaction pooling).
- Nuevo endpoint diagnóstico `GET /api/_diagnostics/db-role` (gated con `settings:manage`) que retorna el role activo y si bypassea RLS. Sirve para validar post-rotación.

### 1.4 Tests e2e en CI
- `.github/workflows/ci.yml`: bloque `e2e` descomentado y ampliado:
  - `runs-on: ubuntu-latest`, `needs: build`.
  - `strategy.matrix.node-version: ['22']`.
  - Service Postgres 17 efímero con healthcheck.
  - `prisma generate` + `prisma migrate deploy` (en lugar de `db push`) — aplica migrations reales del directorio nuevo, valida que estén bien armadas.
  - `npm run seed` con `ALLOW_SEED_DESTRUCTIVE=true` y todas las `SEED_*_PASSWORD` predefinidas.
  - `npx playwright install --with-deps chromium`.
  - `npm run build` + `npm run start` en background con espera activa (`curl` polling 60s).
  - `npm run test:e2e` con `E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` poblados.
  - Cleanup: kill Next.js + upload del reporte Playwright como artifact.

### 1.5 Sentry
- `package.json`: dep `@sentry/nextjs: ^9.2.0` agregada (no instalada — el dueño corre `npm install` al deploy).
- `src/types/sentry-nextjs.d.ts`: shim mínimo de tipos para que typecheck pase ANTES de `npm install`. Una vez instalado, los tipos reales del paquete sobrescriben este shim sin cambios adicionales.
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`: tres archivos de configuración con:
  - `dsn` desde env (`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`).
  - `environment` desde `VERCEL_ENV` / `NODE_ENV`.
  - `release` desde `SENTRY_RELEASE`.
  - `tracesSampleRate: 0.1` en prod (ahorra cuota free tier).
  - `enabled: false` si NODE_ENV no es production.
- `next.config.ts`: wrapper `withSentryIfAvailable(nextConfig)` que aplica `withSentryConfig` solo si la dep está instalada Y hay DSN. Si falta cualquiera, devuelve config sin tocar — permite dev local sin Sentry.
- `src/app/global-error.tsx`: error boundary global App Router que llama `Sentry.captureException(error)` y muestra UI mínima en español con botón de retry y `error.digest` visible.
- `.env.example`: agregadas `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (estaba implícita), `SEED_*`, `ALLOW_SEED_DESTRUCTIVE`.

### 1.6 Bucket Supabase + signed URLs
- Auditoría `src/`: única ocurrencia de `getPublicUrl` en `src/app/api/upload/route.ts` (bucket `products`).
- **Decisión documentada:** bucket `products` se mantiene público por diseño porque:
  - Las imágenes se renderizan en POS y en pantallas visibles a cliente final (catálogo) sin auth intermedio.
  - Cache CDN amigable.
  - Bajo riesgo: solo son fotos de catálogo, no contienen datos sensibles.
- Nuevo helper `src/lib/storage.ts` con:
  - `getSignedFileUrl(bucket, path, expiresInSeconds = 3600)` para buckets privados; clamp 1s ≤ TTL ≤ 24h.
  - `getSignedFileUrls(bucket, paths[], TTL)` para batches con tolerancia a errores por path.
  - `getPublicFileUrl(bucket, path)` para los buckets `PUBLIC_BUCKETS = ['products']` explícitamente marcados.
- `src/app/api/upload/route.ts` migrado a usar `getPublicFileUrl` (centraliza el patrón). Comentario explica que cualquier bucket nuevo debe usar `getSignedFileUrl` por default.

### 1.7 Guard en `prisma/seed.ts`
Agregado en la primera línea ejecutable:

1. `if (process.env.NODE_ENV === 'production') throw …` — bloqueo duro irreversible.
2. `if (process.env.ALLOW_SEED_DESTRUCTIVE !== 'true') throw …` — defensa adicional contra correr el seed por accidente en dev local apuntando a stage/preview.

### 1.8 Runbook
Nuevo archivo `docs/operations/credentials-rotation.md` con:
- Tabla exhaustiva de credenciales (12 entradas).
- Lugares donde están (Vercel env, GitHub Actions, Supabase Dashboard, Sentry, `.env.local`).
- Procedimiento de rotación individual por cada credencial.
- Procedimiento de activación inicial del role `app_user` (paso a paso para Fase 13).
- Tabla de frecuencia recomendada de rotación.
- Kill switch por tipo de filtración (4 escenarios).
- Checklist post-rotación.
- Reglas no negociables (no commitear `.env`, no `service_role` desde cliente, etc.).

## 2. Validación

### `pnpm typecheck`
```
> simtech-pos@0.1.0 typecheck
> tsc --noEmit

(salida vacía → exit code 0 → verde)
```

### `pnpm lint`
```
> simtech-pos@0.1.0 lint
> eslint .

(salida vacía → exit code 0 → verde, 0 warnings)
```

### `npm run test:e2e`
No corrido por el subagente (no hay Next.js levantado en el sandbox + no hay DB). Queda corriendo en CI vía el bloque `e2e:` del workflow una vez que el dueño haga push.

## 3. Pasos que el dueño debe ejecutar manualmente

Estos son los pasos que requieren red a Supabase, credenciales y/o acceso a dashboards. **Ninguno fue ejecutado desde el sandbox.**

### 3.1 Instalar dependencia Sentry
```bash
cd ERP-SIMTECH
npm install   # o pnpm install — recoge la dep nueva @sentry/nextjs declarada en package.json
```

### 3.2 Marcar migraciones existentes como aplicadas en Supabase
Las 9 migraciones que ya están aplicadas en producción (todo lo de `manual_migrations/` previo a Fase 13) deben marcarse en `_prisma_migrations` para que Prisma no intente reaplicarlas. Desde una shell local con `DIRECT_URL` configurada al role `postgres`:

```bash
npx prisma migrate resolve --applied 20260101000000_init
npx prisma migrate resolve --applied 20260415210700_sales_idempotency_and_returns
npx prisma migrate resolve --applied 20260415215700_account_payment_cash_register
npx prisma migrate resolve --applied 20260415220200_sale_item_unit_cost
npx prisma migrate resolve --applied 20260417172500_company_settings_alignment
npx prisma migrate resolve --applied 20260509100000_add_login_attempt_for_rate_limit
npx prisma migrate resolve --applied 20260509110000_enable_rls_all_public_tables
npx prisma migrate resolve --applied 20260509120000_add_tenant_isolation_policies
npx prisma migrate resolve --applied 20260509130000_create_app_user_role_dormant
```

Verificar drift = 0:
```bash
npx prisma migrate status
# Esperado: "Database schema is up to date!" y las 9 migrations en estado Applied.
```

### 3.3 Aplicar la nueva migración (`app_user_role_activation_ready`)
```bash
npx prisma migrate deploy
# Esto aplica 20260511000000_app_user_role_activation_ready/migration.sql
```

Verificar:
```sql
-- En Supabase SQL Editor:
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolname = 'app_user';
-- Esperado: rolsuper=false, rolbypassrls=false, rolcanlogin=false (todavía NOLOGIN).
```

### 3.4 Crear password para `app_user` y rotar DATABASE_URL
1. Generar password:
   ```bash
   openssl rand -base64 32
   ```
2. En Supabase SQL Editor:
   ```sql
   ALTER ROLE app_user LOGIN PASSWORD '<password-generado>';
   ```
3. Construir nuevo DSN:
   ```
   postgresql://app_user:<password-url-encoded>@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   (URL-encode el password si tiene caracteres especiales — Node `encodeURIComponent` es la referencia.)

4. **Probar primero en Preview** (no en Production): actualizar `DATABASE_URL` solo en Vercel → Environment Variables → Preview. Redeploy.

5. Verificar el role activo:
   ```bash
   curl -H "Cookie: <session-cookie-de-admin-en-preview>" \
        https://<preview-url>.vercel.app/api/_diagnostics/db-role
   # Esperado: { "current_user": "app_user", "bypassrls": false, "tenant_isolation_active": true }
   ```

6. **ANTES de promover a Production**, los handlers que hacen `prisma.*` directo NO van a funcionar bajo `app_user` porque ven 0 filas (RLS deniega cuando `app.tenant_id` no está seteada). Las dos opciones son:
   - **Opción A (recomendada):** migrar progresivamente los handlers a `withTenantContext(tenant.companyId, ...)`. Esa migración es trabajo de Fase 14+, no Fase 13.
   - **Opción B (rollback rápido):** rotar `DATABASE_URL` de vuelta al role `postgres` hasta tener la migración completa de handlers. Las policies quedan dormantes pero la infra está lista.

   Fase 13 deja **infra lista, dormante todavía**. Documentado en `docs/audits/phase-2c2-rls-policies.md`.

7. `DIRECT_URL` sigue apuntando al role `postgres` para que migrations corran.

### 3.5 Setup Sentry
1. Crear proyecto en sentry.io (org existente o nueva). Stack: Next.js, runtime Edge + Node.
2. Copiar el DSN público del proyecto. En Vercel:
   - `NEXT_PUBLIC_SENTRY_DSN` = `https://<...>@<...>.ingest.sentry.io/<projectId>` (Production + Preview).
   - `SENTRY_DSN` = mismo valor (o uno separado si Sentry creó un DSN para server).
3. Para upload de source maps (opcional pero recomendado):
   - Crear auth token en Sentry → Account → API → scope `project:releases`.
   - En Vercel (solo Production): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG=<org-slug>`, `SENTRY_PROJECT=<project-slug>`.
4. Para identificar releases:
   - En Vercel Build & Development Settings → variables expuestas → asegurar que `VERCEL_GIT_COMMIT_SHA` esté disponible.
   - Opcional: agregar build script que setee `SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA` antes del build.
5. Redeploy. Verificar en Sentry → Issues que aparezcan errores reales (forzar uno con un endpoint de prueba si necesario).

### 3.6 Migrar `DATABASE_URL` actual en Vercel
Aunque no se active `app_user` todavía, se recomienda agregar `DIRECT_URL` ya mismo (si no está):
- Producción → Settings → Environment Variables → agregar `DIRECT_URL` con la connection string del role `postgres` directa (puerto 5432, NO `pgbouncer=true`). Esto permite que `prisma migrate deploy` corra desde el deploy de Vercel sin pasar por el pooler.

### 3.7 (Opcional pero recomendado) Cron diario para purgar `LoginAttempt`
Documentado pero fuera de alcance de Fase 13:
```sql
DELETE FROM "LoginAttempt" WHERE "createdAt" < NOW() - INTERVAL '24 hours';
```
Programar en Supabase Cron Jobs (extensión `pg_cron`).

## 4. Pendiente / fuera de alcance

- **Migración real de handlers a `withTenantContext`.** Fase 13 deja la herramienta lista (`src/lib/tenant-prisma.ts`) pero NO migra los handlers existentes (~50 endpoints). Esa migración es trabajo de fases posteriores (probable Fase 24 hardening) o se hace incrementalmente. Sin esa migración, **NO** se puede activar realmente el role `app_user` en Production sin romper la app.
- **Cron de mora / OVERDUE en Supabase.** Fase 17 lo agrega.
- **Email transaccional / 2FA TOTP.** Fuera de alcance por decisión del dueño (2026-05-10).
- **Tests e2e cross-tenant funcionando en CI.** El workflow está habilitado pero los tests existentes (`multi-tenant-isolation.spec.ts`) necesitan dos tenants seedeados (A y B). El seed actual solo crea uno. Hay que extender el seed o crear `scripts/create-restricted-company.ts` callable desde CI.
- **Plan de purga de buckets antiguos en Supabase.** Si el dueño tuviera buckets privados con archivos sensibles ya subidos (boletas, etc.), habría que migrarlos. Fase 13 solo audita `products` (público OK).

## 5. Riesgos identificados

1. **Drift entre baseline y DB real.** La migración `20260101000000_init` se escribió a mano desde el schema (no via `prisma migrate diff`, que requería red). Hay riesgo de mismatch sutil (constraints, defaults exactos, índice nombrado distinto). **Mitigación:** correr `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <ephemeral-pg>` para validar drift = 0 antes de hacer push. Si hay drift, agregar una migración de patch correctiva.

2. **Default privileges no aplican a tablas existentes.** El `ALTER DEFAULT PRIVILEGES` solo afecta tablas creadas DESPUÉS. Para asegurarse que las tablas ya existentes tienen los grants correctos, la migración `20260511000000_app_user_role_activation_ready` hace `GRANT ... ON ALL TABLES IN SCHEMA public TO app_user` que SÍ aplica a las existentes. **Mitigación ya en migración.**

3. **`withTenantContext` sin migrar handlers = falsa sensación de seguridad.** El módulo `tenant-prisma.ts` está disponible pero nadie lo usa todavía. Si el dueño rota `DATABASE_URL` a `app_user` sin migrar handlers, la app se rompe (queries devuelven 0 filas). **Mitigación:** documentado explícitamente en `docs/operations/credentials-rotation.md` sección 3.4 paso 6.

4. **Sentry deps fantasmas.** Si el dueño olvida `npm install` después del merge, `@sentry/nextjs` no estará y el build de Vercel va a fallar al importar desde `global-error.tsx`. **Mitigación:** `package.json` tiene la dep declarada; `npm ci` en CI la traerá automáticamente; el shim en `src/types/sentry-nextjs.d.ts` permite que typecheck pase mientras tanto.

5. **Source maps de Sentry pueden filtrar código fuente.** `withSentryConfig` con `hideSourceMaps: true` los sube a Sentry pero los oculta del bundle servido al cliente. Bien. Riesgo controlado.

6. **`prisma migrate deploy` puede fallar en Vercel runtime.** No se debe correr en cada deploy automático — solo cuando hay migration pendiente. **Mitigación:** correr manualmente desde shell local (`npx prisma migrate deploy`) o agregar a un step de "prebuild" en Vercel con manejo de errores que no rompa el deploy si no hay migration nueva.

7. **El bloque `e2e:` del workflow asume puerto 5432 disponible.** Si GitHub Actions agrega features que ocupen ese puerto en el runner, fallará. **Mitigación:** baja probabilidad; los runners de GitHub Actions son limpios.

8. **CI corre el seed con `ALLOW_SEED_DESTRUCTIVE=true`.** Si por error alguien hardcodea esa env en producción, el seed podría correr ahí. **Mitigación:** el guard `NODE_ENV === 'production'` en `seed.ts` es defensa primaria; `ALLOW_SEED_DESTRUCTIVE` es defensa secundaria. **Doble defensa.** El runbook recuerda que esa env NUNCA se setea en Vercel Production.

## 6. Archivos creados / modificados

### Creados
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260101000000_init/migration.sql`
- `prisma/migrations/20260415210700_sales_idempotency_and_returns/migration.sql`
- `prisma/migrations/20260415215700_account_payment_cash_register/migration.sql`
- `prisma/migrations/20260415220200_sale_item_unit_cost/migration.sql`
- `prisma/migrations/20260417172500_company_settings_alignment/migration.sql`
- `prisma/migrations/20260509100000_add_login_attempt_for_rate_limit/migration.sql`
- `prisma/migrations/20260509110000_enable_rls_all_public_tables/migration.sql`
- `prisma/migrations/20260509120000_add_tenant_isolation_policies/migration.sql`
- `prisma/migrations/20260509130000_create_app_user_role_dormant/migration.sql`
- `prisma/migrations/20260511000000_app_user_role_activation_ready/migration.sql`
- `prisma/manual_migrations/20260511000000_app_user_role_activation_ready.sql`
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `src/app/global-error.tsx`
- `src/app/api/_diagnostics/db-role/route.ts`
- `src/lib/storage.ts`
- `src/types/sentry-nextjs.d.ts`
- `docs/operations/credentials-rotation.md`
- `docs/audits/phase-13-completion.md` (este archivo)

### Modificados
- `.env.example` — agregadas envs Sentry, seed, anon key.
- `.github/workflows/ci.yml` — bloque `e2e:` descomentado y endurecido.
- `next.config.ts` — wrapper `withSentryIfAvailable` agregado.
- `package.json` — dep `@sentry/nextjs` declarada.
- `prisma/seed.ts` — guards de `NODE_ENV === 'production'` y `ALLOW_SEED_DESTRUCTIVE`.
- `src/app/api/upload/route.ts` — migrado a `getPublicFileUrl` con justificación documentada.
- `src/lib/tenant-prisma.ts` — `withTenantContext` alias agregado; doc sobre `$extends` agregada; `UUID_PATTERN` extraído como constante.

## 7. Hand-off al verificador

El segundo subagente debe verificar:
- `pnpm typecheck` y `pnpm lint` siguen verdes.
- Los archivos creados existen y respetan la convención del proyecto.
- Las 10 migraciones en `prisma/migrations/` son sintácticamente válidas (correr `psql --dry-run` o `pg_query`).
- La nueva migración `20260511000000_app_user_role_activation_ready` no contiene secretos / passwords commiteados.
- El runbook tiene comandos correctos (especialmente `openssl rand` y los `npx prisma migrate resolve`).
- El bloque `e2e:` del workflow está bien estructurado (matrix, services, env, steps).
- `src/lib/storage.ts` no tiene path injection (paths pasan al SDK Supabase tal cual; el SDK valida).
- El guard del seed funciona: simular `NODE_ENV=production` y `ALLOW_SEED_DESTRUCTIVE=undefined` y validar que tira.

**No marcado como completo.** Listo para auditoría cruzada.
