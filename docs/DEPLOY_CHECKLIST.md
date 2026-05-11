# Deploy Checklist

## Antes del deploy

1. Confirma variables en Vercel:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Confirma backup reciente de la base.
3. Si la base objetivo está vacía, crea la estructura base con `npm run prisma:push`.
4. Si la base objetivo está vacía, crea el primer `SUPER_ADMIN` con `npm run bootstrap:superadmin`.
5. Revisa si el cambio toca esquema.
6. Si toca esquema, aplica primero el SQL manual correspondiente:
   - `prisma/manual_migrations/20260415_sales_idempotency_and_returns.sql`
   - `prisma/manual_migrations/20260415_account_payment_cash_register.sql`
   - `prisma/manual_migrations/20260415_sale_item_unit_cost.sql`
   - `prisma/manual_migrations/20260417_company_settings_alignment.sql`
7. Valida localmente:
   - `npm run prisma:validate`
   - `npm run check:preprod`

## Orden correcto

1. Backup DB.
2. Si la base está vacía, ejecutar `npm run prisma:push`.
3. Si la base está vacía, ejecutar `npm run bootstrap:superadmin`.
4. Aplicar SQL manual en la base objetivo.
5. Verificar columnas/tablas nuevas.
6. Desplegar código.
7. Esperar deploy exitoso.
8. Ejecutar humo funcional.

## Humo funcional post-deploy

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
11. Reportes.

## Señales de rollback

- Error de login o sesión.
- Error Prisma por columna faltante.
- Caja abierta no visible.
- Venta no registra o duplica.
- Abono o devolución rompe caja o saldo.
- Error 500 generalizado en `/api/*`.

## Rollback mínimo

1. Pausar pruebas.
2. Revertir al último deploy estable en Vercel.
3. Si hubo cambio de esquema no compatible, restaurar backup o corregir con SQL puntual.
4. Repetir humo básico antes de reabrir uso.
