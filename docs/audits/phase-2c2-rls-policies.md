# Sprint 2.C.2 — Policies RLS por tenant (defensa en profundidad DB-side)

**Estado:** Aplicado en producción · Dormante (no afecta el comportamiento actual).

## Qué se hizo

Aplicado a Supabase (`cfluozcpcrqfapqwquip`) vía MCP en `2026-05-09`:

- Migración `add_tenant_isolation_policies_v2` — 32 tablas (top-level y sub-models con relación al parent).
- Migración `add_tenant_isolation_policies_hr_cash` — Employee, Payroll, PayrollItem, Attendance, LeaveRequest, CashRegister, CashRegisterTransaction.

**Patrón aplicado:** policy `tenant_isolation FOR ALL` con

```sql
USING ("companyId"::text = current_setting('app.tenant_id', true))
WITH CHECK ("companyId"::text = current_setting('app.tenant_id', true))
```

para tablas con `companyId` directo, y `EXISTS (SELECT 1 FROM parent ...)` para sub-models que heredan tenant via relación.

## Por qué está dormante hoy

Las policies aplican solo a roles **no privilegiados** de Postgres:

- `postgres` (owner del schema, el que usa Prisma vía `DATABASE_URL`) **bypassea RLS por default** → su comportamiento NO cambia.
- `service_role` de Supabase tiene `BYPASSRLS` → tampoco se ve afectado (lo usa `src/lib/supabase.ts` para Storage).
- `anon` y `authenticated` (los roles de PostgREST) NO setean `app.tenant_id`, así que la comparación da NULL = false y siguen viendo 0 filas (deny by default, igual que antes).

Verificado post-aplicación:

| Escenario | Visible |
|---|---|
| Postgres lee `Company` | 2 (todas) |
| Postgres lee `User` | 3 (todos) |
| Anon sin `tenant_id` lee `Company` | 0 |
| Anon sin `tenant_id` lee `User` | 0 |
| Anon CON `tenant_id='X'` lee `Company` | 1 (solo X) |
| Anon CON `tenant_id='X'` lee `User` | 1 (solo el de X) |

**Conclusión:** la app productiva sigue 100% normal. Las policies son una red de seguridad latente que se activa cuando un role respete RLS.

## Activación futura (cuando decidas)

El cambio para "encender" las policies es:

1. **Crear role `app_user` en Supabase** (vía SQL o dashboard):
   ```sql
   CREATE ROLE app_user LOGIN PASSWORD '<contraseña-fuerte>';
   GRANT USAGE ON SCHEMA public TO app_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE ON SEQUENCES TO app_user;
   ```

2. **Rotar `DATABASE_URL` en Vercel** a una connection string que use `app_user` en vez de `postgres`. Probar en preview environment primero.

3. **Migrar handlers a usar `forTenant(companyId)`** desde `src/lib/tenant-prisma.ts`. El módulo ya está implementado y exporta:
   - `forTenant(companyId).withTx(async (tx) => { /* operaciones */ })`
   - `getCurrentDbRole()` para verificar el role activo en runtime.

4. **Validar en preview** que:
   - Una venta de prueba se completa.
   - El advisor de Supabase no reporta RLS violations.
   - `getCurrentDbRole()` devuelve `{ current_user: 'app_user', bypassrls: false }`.
   - Los tests cross-tenant (Sprint 5) bloquean accesos cruzados.

5. **Promover a producción** después del preview.

## Limitaciones aceptadas

- **`LoginAttempt` no tiene policy de tenant** (es pre-auth, no tiene `companyId`). Mantiene RLS habilitado deny-all para `anon`. El server (postgres / service_role) la maneja sin problemas.
- **Activar el role va a aumentar el costo de queries** un poco, porque cada transacción ejecuta un `SET LOCAL app.tenant_id` extra. Medido en otros proyectos: ~1-2ms overhead por request, despreciable.
- **El role app_user NO puede ser owner de tablas**, así que `prisma db push` y migrations seguirán requiriendo el role `postgres`. Para Vercel, eso significa mantener una segunda env var `DIRECT_URL` apuntando al role privilegiado solo para deploy de migrations.

## Archivos relacionados

- `prisma/manual_migrations/20260509_add_tenant_isolation_policies.sql` — script SQL completo (referencia, ya aplicado).
- `src/lib/tenant-prisma.ts` — implementación de `forTenant()`. Lista pero no usada.
- Verificación: corré `getCurrentDbRole()` desde un endpoint para confirmar el role activo después del switch.
