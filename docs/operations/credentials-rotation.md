# Runbook · Rotación y manejo de credenciales

Fecha: 2026-05-11
Fase: 13 · Foundation
Owner: dueño (marvin@odd.digital).

Este runbook documenta TODAS las credenciales que el ERP SIMTECH usa, dónde
viven, cómo rotarlas y cómo responder a una filtración. Mantenerlo actualizado
es parte del entregable de cada fase.

## Lista exhaustiva de credenciales

| Nombre | Tipo | Dónde está | Quién la usa | Sensibilidad |
|---|---|---|---|---|
| `DATABASE_URL` | Postgres conn string (pgbouncer) | Vercel env, `.env.local` | Prisma runtime | **ALTA** — acceso lectura/escritura a toda la DB. |
| `DIRECT_URL` | Postgres conn string directa | Vercel env, `.env.local` | `prisma migrate deploy` | **ALTA** — solo para migrations. Idealmente NO en runtime. |
| `NEXTAUTH_SECRET` | Random hex (32+ chars) | Vercel env, `.env.local` | NextAuth JWT signing | **ALTA** — si se filtra, se pueden forjar sesiones. |
| `NEXTAUTH_URL` | URL pública | Vercel env | NextAuth callback URL | Baja. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública | Vercel env, bundle cliente | Cliente Supabase Storage | Pública por diseño (sale en HTML). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT anon Supabase | Vercel env, bundle cliente | Lecturas no-auth (limitadas por RLS) | **Pública por diseño** pero RLS debe estar activa. |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT service Supabase | Vercel env, `.env.local` (NO bundle) | Server Supabase Storage (uploads) | **CRÍTICA** — bypassea RLS. |
| `NEXT_PUBLIC_SENTRY_DSN` | URL Sentry | Vercel env, bundle cliente | Cliente Sentry | Pública por diseño. |
| `SENTRY_DSN` | URL Sentry server | Vercel env | Server Sentry | Baja (sólo permite enviar errores, no leer). |
| `SENTRY_AUTH_TOKEN` | Token Sentry API | Vercel env (solo prod build) | Subir source maps | Media (subir source maps fuera de tu org). |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Strings | Vercel env | Sentry CLI | Baja. |
| `SEED_*` (passwords seed) | Passwords texto | `.env.local`, GitHub Actions secret | `pnpm seed` en dev/CI | Media (data ficticia). |
| Password `app_user` (Postgres role) | Password Postgres | Supabase Dashboard + `DATABASE_URL` runtime | Conexión runtime sin BYPASSRLS | **ALTA** (cuando se active). |
| Password `postgres` (Postgres role) | Password Postgres | Supabase Dashboard + `DIRECT_URL` | Migrations + bootstrap | **CRÍTICA** — acceso superuser. |

## Lugares donde están las credenciales

1. **Vercel Project Environment Variables** (Production, Preview, Development separados).
   - https://vercel.com/<org>/<project>/settings/environment-variables
2. **GitHub Actions Secrets** del repo.
   - https://github.com/<org>/<repo>/settings/secrets/actions
   - Solo lo mínimo: `SEED_*` para CI. NO meter Supabase service role acá.
3. **Supabase Dashboard** (passwords del role `postgres` y `app_user`).
   - https://supabase.com/dashboard/project/cfluozcpcrqfapqwquip/settings/database
4. **Sentry Dashboard** (DSN público, auth token).
   - https://sentry.io/settings/<org>/projects/<project>/keys/
5. **Archivos locales del dueño**:
   - `.env.local` (dev local) — en `.gitignore`, nunca commit.
   - `.env` (legacy) — idealmente vacío en main; no usar.

## Procedimiento de rotación · individual

### DATABASE_URL / DIRECT_URL

Solo el password puede rotar (el host/port/dbname son fijos).

1. Supabase Dashboard → Settings → Database → Reset database password.
2. Copiar nuevo password.
3. Actualizar `DATABASE_URL` y `DIRECT_URL` en **Vercel** (Production + Preview).
4. Redeploy desde Vercel (forzar nuevo build para que cargue el env).
5. Actualizar `.env.local` del dueño (solo dev local).
6. Verificar: login + crear venta de prueba en preview, mirar logs Sentry/Vercel
   por errores de conexión.

**Frecuencia recomendada:** cada 90 días o ante cualquier sospecha de filtración.

### NEXTAUTH_SECRET

1. Generar nuevo: `openssl rand -base64 48` (NO usar passwords cortos).
2. Actualizar en Vercel (Production + Preview).
3. Redeploy.
4. **Efecto:** todas las sesiones activas se invalidan, los usuarios deben volver
   a loguear. Comunicar antes si afecta horario laboral.

**Frecuencia recomendada:** cada 180 días o ante cualquier sospecha.

### SUPABASE_SERVICE_ROLE_KEY

1. Supabase Dashboard → Settings → API → Reset Service Role Key.
2. Copiar nueva key.
3. Actualizar en Vercel (Production + Preview).
4. Redeploy.
5. Verificar uploads de imagen en POS / Inventory.

**Frecuencia recomendada:** cada 180 días.

### Sentry DSN / Auth Token

DSN normalmente no rota (es público). Si necesitás revocarlo:

1. Sentry Dashboard → Settings → Projects → Client Keys → Revoke.
2. Crear nueva client key.
3. Actualizar `NEXT_PUBLIC_SENTRY_DSN` y `SENTRY_DSN` en Vercel.

Auth token:

1. Sentry Dashboard → Settings → Account → API → Revoke.
2. Crear nuevo con scope mínimo (`project:releases`, `org:read`).
3. Actualizar `SENTRY_AUTH_TOKEN` en Vercel (solo Production, NO preview).

**Frecuencia recomendada:** auth token cada 365 días. DSN solo bajo filtración.

### Password de role `app_user` (Fase 13 onwards)

Cuando esté activado:

1. Supabase Dashboard → Database → Roles → `app_user` → Change password.
   Alternativa SQL en SQL Editor: `ALTER ROLE app_user PASSWORD '<nuevo>';`
2. Construir nuevo `DATABASE_URL` con ese password:
   `postgresql://app_user:<password>@<host>:6543/postgres?pgbouncer=true`
3. Actualizar `DATABASE_URL` en Vercel (Production + Preview).
4. Redeploy.

**Frecuencia recomendada:** cada 90 días.

## Activación inicial del role `app_user` (Fase 13)

Pasos manuales que el dueño debe correr UNA vez para encender RLS real:

1. En Supabase SQL Editor, correr la migración endurecida (también está
   en `prisma/manual_migrations/20260511000000_app_user_role_activation_ready.sql`):
   ```sql
   -- Garantiza que app_user existe y NO tiene BYPASSRLS.
   ALTER ROLE app_user
     NOSUPERUSER
     NOCREATEDB
     NOCREATEROLE
     NOBYPASSRLS;

   GRANT USAGE ON SCHEMA public TO app_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO app_user;
   ```

2. Asignar password al role:
   ```sql
   ALTER ROLE app_user LOGIN PASSWORD '<password-fuerte-32+chars>';
   ```
   El password se elige con `openssl rand -base64 32`. **NUNCA** se commitea.

3. Construir el nuevo DSN:
   ```
   postgresql://app_user:<password>@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   (Mismo host/puerto que el connection pooler de Supabase actual, solo
   cambia el user/password.)

4. **Probar en Preview primero.** Actualizar `DATABASE_URL` solo en el
   Preview Environment de Vercel. Redeploy. Verificar:
   - Login funciona.
   - Crear venta de prueba funciona.
   - Listado de productos del tenant aparece.
   - Llamar al endpoint que reporta el role activo:
     ```bash
     curl https://<preview>.vercel.app/api/_diagnostics/db-role
     # esperado: { "current_user": "app_user", "bypassrls": false }
     ```
     (Si ese endpoint no existe, crearlo invocando `getCurrentDbRole()` de
     `src/lib/tenant-prisma.ts`.)
   - Otra empresa NO ve datos cruzados (correr tests e2e de
     `e2e/multi-tenant-isolation.spec.ts`).

5. **Migrar handlers a `withTenantContext` o `forTenant`** ANTES de promover
   a Production. Sin eso, el role app_user verá 0 filas en todas las queries
   porque RLS deniega cuando `app.tenant_id` no está seteada.

6. Promover `DATABASE_URL` a Production en Vercel.

7. `DIRECT_URL` sigue apuntando al role `postgres` para que las migrations
   puedan correrse — `app_user` NO es owner de tablas y no puede correr DDL.

## Frecuencia recomendada de rotación

| Credencial | Frecuencia | Disparador adicional |
|---|---|---|
| DATABASE_URL password | 90 días | Filtración / empleado saliente con acceso. |
| `app_user` password | 90 días | Filtración / Vercel env compromised. |
| NEXTAUTH_SECRET | 180 días | Sesiones se invalidan, planear horario. |
| SUPABASE_SERVICE_ROLE_KEY | 180 días | Filtración / empleado saliente con acceso. |
| SENTRY_AUTH_TOKEN | 365 días | Suficiente — token tiene scope limitado. |
| Sentry DSNs | Solo bajo filtración | DSN es público por diseño. |
| Seed passwords | 365 días | Filtración / cambio de equipo dev. |

## Kill switch · qué hacer si una credencial se filtra

### Filtración de `SUPABASE_SERVICE_ROLE_KEY`

1. **Inmediato** (T+0 min): Supabase Dashboard → API → Reset Service Role Key.
2. T+5 min: actualizar en Vercel. Redeploy.
3. T+15 min: revisar logs Supabase por queries inesperadas en la última hora.
4. T+30 min: rotar `DATABASE_URL` también (defensa en profundidad).
5. T+1h: si hubo acceso anómalo, snapshot de la DB y notificar a los tenants.

### Filtración de `DATABASE_URL` (password del role `app_user` o `postgres`)

1. **Inmediato**: `ALTER ROLE <role> PASSWORD '<nuevo>'` desde Supabase.
2. T+5 min: actualizar `DATABASE_URL` / `DIRECT_URL` en Vercel. Redeploy.
3. T+15 min: revisar `pg_stat_activity` en Supabase por conexiones activas
   sospechosas:
   ```sql
   SELECT pid, usename, client_addr, query_start, state, query
     FROM pg_stat_activity
    WHERE usename IN ('postgres', 'app_user')
    ORDER BY query_start DESC LIMIT 50;
   ```
   `pg_terminate_backend(pid)` para matar sesiones sospechosas.
4. T+1h: review de `AuditLog` y `LoginAttempt` por actividad anómala.

### Filtración de `NEXTAUTH_SECRET`

1. **Inmediato**: rotarlo en Vercel (Production + Preview). Redeploy.
2. Efecto: invalida todas las JWT activas. Los usuarios deben re-autenticar.
3. T+15 min: revisar `LoginAttempt` por logins exitosos no esperados desde
   IPs raras.
4. Notificar al equipo si hubo evidencia de uso pre-rotación.

### Filtración general (no sé cuál se filtró)

1. Rotar TODO en paralelo: DATABASE_URL, app_user password, NEXTAUTH_SECRET,
   SUPABASE_SERVICE_ROLE_KEY.
2. Forzar redeploy en Vercel.
3. Cerrar todas las sesiones desde DB:
   ```sql
   DELETE FROM "SessionLog";
   ```
4. Review de últimas 24h en Sentry, Vercel logs, Supabase logs, GitHub
   Actions logs.
5. Post-mortem: dónde estaba expuesta, cómo se filtró, qué se rompió en el
   proceso de manejo de secretos.

## Reglas no negociables

- **Nunca commitear `.env`, `.env.local`, ni archivos con credenciales reales.**
  El repo tiene `.env.example` con placeholders y `.gitignore` con `.env*`.
- **Nunca pegar credenciales en chat, screenshots, issues, PRs ni Notion.**
- **Nunca usar `service_role` desde el cliente** — siempre desde un handler
  del server. El bundle del cliente solo ve `NEXT_PUBLIC_*`.
- **Nunca rotar las dos credenciales de Postgres a la vez sin un plan de
  rollback** — si te equivocás en una y la otra ya rotó, perdés acceso.
- **Nunca dar acceso a Supabase Dashboard a usuarios fuera del equipo core.**
- **Nunca activar `BYPASSRLS` en `app_user`.** Si necesitás bypass para una
  herramienta puntual, usá `postgres` directamente.

## Checklist post-rotación

- [ ] Vercel Production redeployado y healthcheck pasa.
- [ ] Vercel Preview redeployado y login funciona.
- [ ] `.env.local` del dueño actualizado.
- [ ] No hay errores 500 en Sentry/Vercel en los últimos 15 min.
- [ ] Tests e2e siguen verdes contra preview.
- [ ] Entrada en `docs/audits/<fase>-completion.md` o changelog mencionando
      la rotación.
