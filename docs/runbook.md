# SIMTECH ERP — Runbook Operativo

Guía rápida para incidencias en producción. Mantener actualizado tras cada outage real.

**Producción**: `https://erp.simtechgt.com` · branch `main` · Vercel · Supabase FREE.

---

## Tabla de contenido

1. [Smoke test post-deploy](#smoke-test-post-deploy)
2. [Incidencias comunes](#incidencias-comunes)
3. [Procedimientos](#procedimientos)
4. [Backups y restauración](#backups-y-restauración)
5. [Variables de entorno](#variables-de-entorno)

---

## Smoke test post-deploy

Después de cada deploy a producción, correr:

```bash
npm run smoke
# o contra staging:
npm run smoke -- --url https://staging.simtechgt.com
```

Valida `/api/health`, `/login`, `/api/auth/csrf`, `/api/auth/session`. Si falla cualquiera, **rollback inmediato** en Vercel Dashboard → Deployments → seleccionar deploy anterior → Promote to Production.

### Tareas adicionales tras deploy con cambios de schema

Si el commit incluye migraciones nuevas (carpeta `prisma/migrations/`), después del deploy automático de Vercel:

1. **`npx prisma migrate deploy`** contra prod usando `DIRECT_URL`. Vercel NO corre migraciones automáticamente — está intencionalmente desactivado para evitar accidentes destructivos.
2. **`npx prisma generate`** local para refrescar el cliente TypeScript.
3. **Borrar shims `src/types/prisma-phaseXX.d.ts`** correspondientes a la migración recién aplicada (los tipos reales los reemplazan).
4. Verificar `npm run typecheck && npm run lint && npm test` local.

### Dashboard admin de health

Tras deploy, abrir [`/admin/health`](https://erp.simtechgt.com/admin/health) (login SUPER_ADMIN) para verificar:
- DB ping con latencia OK (< 200ms desde Vercel)
- Email provider activo (idealmente "resend", o "console" si no contrataste todavía)
- Sentry on/off según expectativa
- Todas las env vars críticas marcadas como "Seteada"

---

## Incidencias comunes

### 🔴 Sitio no carga (502/503/504)

1. Chequear https://www.vercel-status.com/
2. `curl -i https://erp.simtechgt.com/api/health` — si 503 con `db: down`, problema es Supabase.
3. Si Vercel OK + Supabase OK, ver logs del último deploy: Vercel Dashboard → Project → Logs.

### 🔴 Supabase pausado (FREE plan se pausa tras 7 días sin queries)

Síntomas: `/api/health` retorna 503 con `db: down`, login falla.

Solución:
1. Supabase Dashboard → Project → "Resume project" (botón visible).
2. Esperar ~1 min hasta que la DB acepte conexiones.
3. `npm run smoke` para validar.

Prevención: workflow `keep-alive.yml` golpea `/api/health` cada 6 días (revisar que existe y está activo).

### 🔴 FEL certificación falla

Síntomas: usuario ve "Error al certificar factura" en `/sales/[id]`.

1. Revisar Vercel logs filtrando por `FelError`.
2. Posibles causas:
   - **Provider INFILE/DIGIFACT caído**: contactar al proveedor. Como fallback temporal, cambiar `Company.felProvider` a `'MOCK'` (solo si el cliente acepta facturas no certificadas SAT).
   - **FEL_SERIES_EXHAUSTED**: la serie autorizada se acabó. Solicitar nueva autorización en portal SAT y crear `TaxSeries` nueva.
   - **FEL_SERIES_CONTENTION**: alta concurrencia. Reintentar la operación; si persiste, escalar.

### 🔴 Migración Prisma rota en producción

Síntomas: deploy de Vercel falla con error de Prisma migrate.

NO hacer rollback de DB. Hacer:
1. Vercel Dashboard → Deployments → Rollback al último deploy verde.
2. Identificar la migración rota en logs.
3. En local: `npx prisma migrate resolve --rolled-back <migration_name>` apuntando a la DB de producción (con DATABASE_URL de prod).
4. Arreglar el SQL de la migración localmente.
5. Push y verificar CI verde antes del próximo deploy a prod.

### 🔴 CI rojo (red continuamente)

1. Chequear el job que falla:
   - **lint-typecheck**: error en código TS/lint. Fix local + push.
   - **build**: error de Next.js. Probar `npm run build` local.
   - **unit-tests**: `npm test` local.
   - **integration-tests**: `npm run db:test:up && npm run test:integration`.
   - **e2e**: revisar Playwright report en artifact del run.
2. Si el job tarda demasiado o se cuelga: re-run.

### 🔴 Usuario bloqueado por intentos fallidos de login

`LoginAttempt` registra intentos. Rate limit interno bloquea temporalmente.

Resolver para el usuario:
```sql
DELETE FROM "LoginAttempt"
WHERE email = '<email>' AND "createdAt" > NOW() - INTERVAL '30 minutes';
```

### 🔴 Período contable cerrado (no se aceptan asientos nuevos)

Si el cliente intentó editar/cancelar algo en un mes pasado y la app rechaza:

```sql
-- Solo si tenés autorización del contador del cliente.
UPDATE "AccountingPeriod"
SET status = 'OPEN', "closedAt" = NULL
WHERE "companyId" = '<id>' AND year = 2026 AND month = 4;
```

Después de la corrección, volver a cerrar:
```sql
UPDATE "AccountingPeriod" SET status = 'CLOSED', "closedAt" = NOW()
WHERE "companyId" = '<id>' AND year = 2026 AND month = 4;
```

---

## Procedimientos

### Rollback de deploy

Vercel Dashboard → Project → Deployments → seleccionar deploy verde anterior → ⋯ → "Promote to Production".

Tiempo: ~30 seg. El rollback NO revierte cambios de DB (migraciones).

### Rollback de migración Prisma

```bash
# 1. Identificar migración a revertir
npx prisma migrate status

# 2. Marcar como rolled-back (no ejecuta SQL inverso, solo borra del historial)
npx prisma migrate resolve --rolled-back <NOMBRE_MIGRACION>

# 3. Ejecutar manualmente el DDL inverso (DROP TABLE, ALTER, etc.)
psql "$DATABASE_URL" -c "DROP TABLE \"NuevaTabla\";"

# 4. Verificar
npx prisma migrate status   # debería decir "in sync"
```

### Reset password de un admin

```bash
# Local con DATABASE_URL apuntando a prod (¡con cuidado!)
npm run bootstrap:superadmin -- --email admin@cliente.com --password NuevaPass123!
```

### Crear superadmin nuevo

```bash
SEED_SUPERADMIN_EMAIL=admin@cliente.com SEED_SUPERADMIN_PASSWORD=Pass123! npm run bootstrap:superadmin
```

### Marcar facturas vencidas (cron mark-overdue)

Si el cron de Vercel para mark-overdue falló:
```bash
curl -X POST https://erp.simtechgt.com/api/cron/mark-overdue \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Backups y restauración

### Backups automáticos

Workflow `.github/workflows/backup.yml` corre diario a las 06:00 UTC (00:00 GT) y genera artifact con retención 30 días. Setup:

1. GitHub repo Settings → Secrets → `DATABASE_URL_BACKUP` = connection string Postgres directa (NO pooler, usar `DIRECT_URL` de Supabase).
2. Verificar Actions tab que corre OK.

### Backup manual on-demand

GitHub Actions → "Backup DB (Supabase)" → "Run workflow".

### Restaurar de un backup

```bash
# 1. Descargar artifact desde GitHub Actions → seleccionar run → Artifacts.
# 2. Descomprimir
gunzip simtech-backup-YYYY-MM-DD_HHMM.sql.gz

# 3. ⚠ CRÍTICO: probar primero en una DB stage, NO en prod directo.
psql "$STAGE_DATABASE_URL" < simtech-backup-YYYY-MM-DD_HHMM.sql

# 4. Validar que la app funciona contra stage.

# 5. Si OK, hacer el restore real en prod (poniendo la app en mantenimiento primero).
```

### Supabase PRO ($25/mes) — recomendado cuando el negocio lo justifique

PRO incluye PITR (Point In Time Recovery) automático con retención 7 días, mucho mejor que el workflow manual. Migrar cuando:
- 5+ clientes pagando, o
- Dato perdido = pérdida monetaria > $25/mes.

Mientras tanto, el workflow GitHub Actions cumple.

---

## Variables de entorno

### Producción (Vercel)

**Esenciales** (sin estas la app NO funciona):

| Variable | Descripción | Sensibilidad |
|---|---|---|
| `DATABASE_URL` | Postgres pooler (Supabase) | 🔴 Secret |
| `DIRECT_URL` | Postgres directa (para migraciones) | 🔴 Secret |
| `NEXTAUTH_SECRET` | Firma JWT NextAuth (32+ chars) | 🔴 Secret |
| `NEXTAUTH_URL` | `https://erp.simtechgt.com` | Public |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key Supabase | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (admin) | 🔴 Secret |
| `NEXT_PUBLIC_ENV` | `production` / `staging` / `preview` | Public — controla banner UI |

**Recomendadas** (la app funciona sin, pero degradada):

| Variable | Descripción | Sensibilidad | Sin esto, ¿qué pasa? |
|---|---|---|---|
| `CRON_SECRET` | Bearer para endpoints `/api/cron/*` | 🔴 Secret | Endpoints cron devuelven 503 |
| `NEXT_PUBLIC_SITE_URL` | URL canónica del ERP (`https://erp.simtechgt.com`) | Public | Templates/sitemap caen al default |
| `PASSWORD_RESET_TTL_MINUTES` | Validez del token reset (default 30) | Public | Usa 30 min |
| `RESEND_API_KEY` | API key Resend | 🔴 Secret | Emails solo loguean en Vercel logs |
| `EMAIL_FROM` | `SIMTECH ERP <noreply@simtechgt.com>` | Public | Necesaria si RESEND_API_KEY está activa |
| `SENTRY_DSN` | DSN privado Sentry | 🔴 Secret | Errores solo en logs, sin alertas |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN público para bundle cliente | Public | Errores cliente no llegan a Sentry |
| `SENTRY_AUTH_TOKEN` | Para subir source maps en build | 🔴 Secret | Stack traces ilegibles |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Identificadores Sentry | Public | Source maps van al proyecto wrong |

### Staging (Vercel preview branch)

Mismo set, pero con `NEXT_PUBLIC_ENV=staging` y DB separada (otro proyecto Supabase free).

### Local dev

Copiar `.env.example` → `.env`. NO usar credenciales de prod localmente.

### GitHub Actions

- CI: variables stub configuradas en workflow (no requieren secrets).
- Backup: `DATABASE_URL_BACKUP` en Settings → Secrets.

---

## Contactos de escalación

- **Vercel**: support@vercel.com / Discord
- **Supabase**: support@supabase.io / GitHub
- **Dominio (Cloudflare/Registrar)**: agregar contacto del proveedor.
- **SAT / FEL provider**: número del agente comercial del proveedor (Infile/Digifact).

---

_Última actualización: Fase 26. Actualizar tras cada incidente significativo._
