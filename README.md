# SIMTECH POS

POS/ERP multi-sucursal construido con Next.js 16, Prisma, PostgreSQL y Supabase.

## Requisitos

- Node.js 18+
- PostgreSQL o Supabase
- variables de entorno configuradas

## Variables de entorno

Usa [.env.example](.env.example) como base. Las variables mínimas para desarrollo y despliegue son:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Para despliegues en Vercel con Supabase:

- `DATABASE_URL`: usa la cadena pooled de Supabase para runtime (`6543`).
- `DIRECT_URL`: usa la cadena session/direct para Prisma CLI y tareas administrativas (`5432`).
- `NEXTAUTH_URL`: debe ser la URL final pública. Para este proyecto productivo: `https://erp.simtechgt.com`.

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` a partir de `.env.example`.

3. Sincroniza la base local y genera datos semilla:

```bash
npx prisma db push
npm run seed
```

Si necesitas contraseñas estables en tu entorno local, exporta antes:
`SEED_SUPERADMIN_PASSWORD`, `SEED_COMPANY_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD` y `SEED_CASHIER_PASSWORD`.

4. Levanta la app:

```bash
npm run dev
```

## Credenciales de seed

El seed imprime en consola las credenciales generadas para desarrollo local.

- Si no defines `SEED_*_PASSWORD`, se generan contraseñas aleatorias en cada ejecución.
- Si necesitas estabilidad para pruebas locales, define esas variables antes de correr el seed.
- No reutilices estas credenciales fuera de un entorno local efímero.

## Preproducción

Antes de desplegar:

```bash
npm run prisma:validate
npm run check:preprod
```

## Despliegue y migraciones

Este proyecto no debe depender de `prisma db push` en producción.

Si el cambio toca esquema, aplica primero los SQL manuales en `prisma/manual_migrations/` y luego despliega el código. En esta base ya existen migraciones manuales importantes para:

- idempotencia de ventas y devoluciones
- `cashRegisterId` en `AccountPayment`
- `unitCost` en `SaleItem`

Si subes código sin aplicar el SQL correspondiente, el deploy puede compilar pero fallar en runtime.

## Bootstrap de una base nueva

Para una base vacía de Supabase:

1. Crear la estructura base una sola vez:

```bash
npm run prisma:push
```

2. Aplicar los SQL manuales de `prisma/manual_migrations/` en la base objetivo.

3. Crear el primer `SUPER_ADMIN` sin datos demo ni borrado de registros:

```bash
BOOTSTRAP_SUPERADMIN_NAME="Super Admin SIMTECH" \
BOOTSTRAP_SUPERADMIN_EMAIL="admin@tu-dominio.com" \
BOOTSTRAP_SUPERADMIN_PASSWORD="tu-password-segura" \
npm run bootstrap:superadmin
```

Si el correo ya existe como `SUPER_ADMIN` y quieres resetear nombre/contraseña:

```bash
BOOTSTRAP_SUPERADMIN_NAME="Super Admin SIMTECH" \
BOOTSTRAP_SUPERADMIN_EMAIL="admin@tu-dominio.com" \
BOOTSTRAP_SUPERADMIN_PASSWORD="tu-password-segura" \
BOOTSTRAP_SUPERADMIN_FORCE_RESET=true \
npm run bootstrap:superadmin
```

El seed de `prisma/seed.ts` no debe usarse en producción porque limpia datos y crea información demo.

Checklist operativa:

- [docs/DEPLOY_CHECKLIST.md](docs/DEPLOY_CHECKLIST.md)
- [docs/VERCEL_SUPABASE_SETUP.md](docs/VERCEL_SUPABASE_SETUP.md)
- [docs/runbook.md](docs/runbook.md) · runbook operacional
- [docs/email-setup.md](docs/email-setup.md) · activar email transaccional (Resend)

## Funcionalidades operacionales (SUPER_ADMIN)

Disponibles solo para `role = SUPER_ADMIN`:

- `/admin/health` · estado de DB, email provider, Sentry, env vars y deploy en tiempo real
- `/admin/companies` · directorio global del SaaS con métricas mensuales, filtros (todas/activas/trial/pagando/suspendidas), búsqueda y export CSV
- `/admin/companies/[id]` · detalle por empresa: suspender/reactivar, resetear password de cualquier usuario, toggle activo de usuarios, ver últimos eventos de auditoría

## Crons (GitHub Actions)

Todos usan el mismo secret `CRON_SECRET`:

- `.github/workflows/keep-alive.yml` — ping cada 6 días para evitar pausa de Supabase FREE
- `.github/workflows/backup.yml` — backup diario `pg_dump` con artifact 30 días
- `.github/workflows/maintenance.yml` — limpieza diaria de tokens expirados y login attempts
- `.github/workflows/trial-warnings.yml` — recordatorios de trial por vencer (D-7, D-1)

## Email transaccional

La app envía emails (welcome, password reset, payroll generated, trial warnings) a través de una capa abstracta en `src/lib/email/`. Sin `RESEND_API_KEY` configurada, todo se loguea en Vercel logs (modo console). Para activar envío real seguir [`docs/email-setup.md`](docs/email-setup.md): 10 minutos, Q0 mientras estés bajo 3.000 envíos/mes.

## Historial de cambios

Ver [CHANGELOG.md](CHANGELOG.md) para el detalle del sprint "Camino a producción" (Mayo 2026).

## Estado técnico actual

- `npm run lint`: limpio
- `npm run typecheck`: limpio
- `npm run build`: limpio
- `npm audit --omit=dev`: con vulnerabilidades moderadas pendientes de actualización
