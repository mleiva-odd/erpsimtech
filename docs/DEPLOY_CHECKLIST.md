# Deploy Checklist

> Actualizado en Fase 13. Flujo viejo basado en `prisma db push` y
> `manual_migrations/` reemplazado por `prisma migrate deploy` con migraciones
> reales en `prisma/migrations/`. Ver runbook completo de credenciales y
> rotación en `docs/operations/credentials-rotation.md`.

## Antes del deploy

1. Confirmá variables en Vercel (production scope):
   - `DATABASE_URL` (pooled, `pgbouncer=true`, puerto 6543)
   - `DIRECT_URL` (no pooled, puerto 5432, role `postgres` para migrations)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Sentry (opcional pero recomendado): `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
   - **Nunca** setear `ALLOW_SEED_DESTRUCTIVE` ni `SEED_*` en production.
2. Confirmá backup reciente de la base (Supabase FREE: solo retiene el último día — descargar dump manual mensual a almacenamiento externo).
3. Validá local antes de cualquier deploy:
   - `npm run prisma:validate`
   - `npm run check:preprod` (lint + typecheck + build)
4. Si hay cambios de schema, asegurate de que la migración Prisma esté creada en `prisma/migrations/<timestamp>_<slug>/migration.sql`. **No** uses `prisma db push` en producción.

## Orden correcto del deploy

### Caso A · Base de datos vacía (primer deploy del ambiente)

1. Aplicar baseline + migraciones desde tu shell local con `DIRECT_URL` apuntando a la DB destino:
   ```bash
   npx prisma migrate deploy
   ```
   Esto corre TODAS las migraciones de `prisma/migrations/` en orden.
2. Bootstrap del SUPER_ADMIN:
   ```bash
   npm run bootstrap:superadmin
   ```
3. Desplegar código a Vercel (push a la rama `main` o equivalente).
4. Esperar deploy exitoso (verde en Vercel UI).
5. Smoke test post-deploy (sección "Humo funcional").

### Caso B · Base de datos con datos (deploy incremental)

1. Si hay migraciones nuevas en `prisma/migrations/`:
   ```bash
   # Verificá qué pendientes hay (sin aplicar):
   npx prisma migrate status
   # Aplicá las pendientes:
   npx prisma migrate deploy
   ```
2. Si **la primera vez que se usa el flujo de migraciones Prisma** (migrado desde el flujo viejo de `manual_migrations/`), marcá las migraciones que ya existían en producción:
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
   Luego `prisma migrate status` debe reportar "Database schema is up to date" para las viejas y las nuevas listas para aplicar.
3. Desplegar código a Vercel.
4. Esperar deploy exitoso.
5. Smoke test post-deploy.

## Verificación rápida post-deploy

```bash
# Liveness probe (no requiere auth):
curl -sf https://erp.simtechgt.com/api/health
# Esperado: {"status":"ok","db":"up","ts":"…"}
```

Si el endpoint responde 503 (`status: degraded`), revisar logs de Vercel y de Supabase antes de continuar.

## Humo funcional post-deploy (manual)

1. Login con usuario admin.
2. Login con usuario cajero.
3. Apertura de caja.
4. Venta simple en efectivo.
5. Venta mixta.
6. Cotización.
7. Abono a cliente.
8. Egreso.
9. Devolución parcial.
10. Cierre de caja.
11. Reportes (P&L, kardex).

> Fase 26 automatizará este checklist con un script `scripts/smoke-post-deploy.ts` que corre vía CI tras cada deploy exitoso.

## Señales de rollback

- Error de login o sesión (NextAuth callback fail).
- Error Prisma por columna faltante (migración no corrida).
- Caja abierta no visible.
- Venta no registra o duplica.
- Abono o devolución rompe caja o saldo.
- Error 500 generalizado en `/api/*`.
- `/api/health` responde 503 sostenido.
- Sentry registra spike de errores nuevos en el último deploy.

## Rollback mínimo

1. Pausar pruebas y avisar al equipo.
2. Revertir al último deploy estable en Vercel (Deployments → Promote).
3. Si hubo cambio de esquema no compatible, restaurar backup del día anterior desde Supabase Dashboard (FREE retiene 1 día). Si necesitás algo más viejo, usar el backup mensual descargado fuera de Supabase.
4. Repetir humo básico antes de reabrir uso.
5. Documentar la causa en `docs/operations/incidents/<fecha>.md` (Fase 26).
