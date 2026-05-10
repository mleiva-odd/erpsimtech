# Tests E2E — Setup

Los tests E2E corren con Playwright contra una instancia Next.js + Postgres
(local o de staging). NO se corren contra producción.

## Levantar entorno de testing

### 1. Postgres dedicado

Recomendado: usar Supabase **branches** (uno por feature/test) o un Postgres
local en Docker:

```bash
docker run -d --name erp-test-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=erp_test \
  -p 5433:5432 postgres:17
```

### 2. Variables de entorno (`.env.test.local`)

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/erp_test
DIRECT_URL=postgresql://postgres:postgres@localhost:5433/erp_test
NEXTAUTH_SECRET=test-secret-min-32-chars-1234567890abcd
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://stub.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=stub
SUPABASE_SERVICE_ROLE_KEY=stub

# Seed con passwords fuertes
SEED_SUPERADMIN_PASSWORD=TestPass1234!
SEED_COMPANY_ADMIN_PASSWORD=TestPass1234!
SEED_MANAGER_PASSWORD=TestPass1234!
SEED_CASHIER_PASSWORD=TestPass1234!
```

### 3. Aplicar schema y seed inicial

```bash
npx prisma db push
npm run seed
```

El seed crea **una** empresa con admin/managers/cashiers. Para tests
cross-tenant necesitás una segunda empresa.

### 4. Crear segunda empresa para tests cross-tenant

Corré el script `create-restricted-company.ts` con env vars distintas:

```bash
RESTRICTED_COMPANY_ADMIN_EMAIL=admin-tenant-b@test.com \
RESTRICTED_COMPANY_ADMIN_PASSWORD=TestPassB1234! \
npx tsx scripts/create-restricted-company.ts
```

Esto crea una empresa "Restricted Company Test" con un admin propio.

### 5. Capturar IDs de recursos del tenant B

Conectate al Postgres y obtené:
- El UUID de un customer de la empresa B (creá uno con su admin).
- El UUID de un producto de la empresa B (creá uno).

```sql
-- Después de crear customer/product en la app como admin de B:
SELECT id, name FROM "Customer" WHERE "companyId" = (
  SELECT id FROM "Company" WHERE slug = 'restricted-test'
) LIMIT 5;

SELECT id, name FROM "Product" WHERE "companyId" = (
  SELECT id FROM "Company" WHERE slug = 'restricted-test'
) LIMIT 5;
```

### 6. Configurar env vars de test

En tu shell antes de correr los tests:

```bash
export E2E_TENANT_A_EMAIL=simtech@simtechgt.com
export E2E_TENANT_A_PASSWORD=TestPass1234!
export E2E_TENANT_B_EMAIL=admin-tenant-b@test.com
export E2E_TENANT_B_PASSWORD=TestPassB1234!
export E2E_TENANT_B_CUSTOMER_ID=<uuid-customer-de-b>
export E2E_TENANT_B_PRODUCT_ID=<uuid-product-de-b>
```

## Correr tests

```bash
# En una terminal: levantar Next con env de test
NEXTAUTH_SECRET=test-secret-min-32-chars-1234567890abcd \
  DATABASE_URL=postgresql://postgres:postgres@localhost:5433/erp_test \
  NEXT_PUBLIC_SUPABASE_URL=https://stub.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=stub \
  SUPABASE_SERVICE_ROLE_KEY=stub \
  npm run dev

# En otra terminal: correr Playwright
npm run test:e2e
```

## Tests incluidos

- `multi-tenant-isolation.spec.ts`: valida que un user de tenant A no
  puede ver/editar/borrar recursos de tenant B (customers, productos,
  sales). Cubre el agujero clásico de IDOR cross-tenant.
- `checkout.spec.ts`: prevención de doble cobro (idempotencia de POST
  con `clientRequestId`).

## CI

El workflow `.github/workflows/ci.yml` ya tiene un job `e2e` comentado
listo para activar cuando esto esté estable. Solo descomentar.
