# Vercel + Supabase Setup

Guía operativa para desplegar este proyecto en Vercel usando:

- dominio productivo: `erp.simtechgt.com`
- base de datos: Supabase Postgres
- storage: Supabase bucket `products`

## 1. Variables que usa este proyecto

Debes configurar estas variables en Vercel para `Production`:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Mapeo recomendado

#### `DATABASE_URL`

Usa la cadena pooled de Supabase para runtime, ideal para tráfico serverless.

Formato esperado:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true
```

#### `DIRECT_URL`

Usa la cadena session/direct para Prisma CLI y tareas administrativas.

Formato esperado:

```env
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Alternativamente, si tu entorno soporta IPv6 o tu proyecto tiene IPv4 add-on:

```env
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

#### `NEXTAUTH_SECRET`

Debe ser una cadena larga y aleatoria. Puedes generarla con:

```bash
openssl rand -base64 32
```

#### `NEXTAUTH_URL`

Debe quedar exactamente así en producción:

```env
NEXTAUTH_URL=https://erp.simtechgt.com
```

#### `NEXT_PUBLIC_SUPABASE_URL`

Es la URL pública del proyecto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
```

#### `SUPABASE_SERVICE_ROLE_KEY`

Es la service role key del proyecto Supabase. Se usa server-side para subir imágenes al bucket `products`.

## 2. Configuración en Supabase

### Base de datos

En el dashboard de Supabase:

1. Entra a `Connect`.
2. Copia:
   - la cadena `Supavisor transaction mode` para `DATABASE_URL`
   - la cadena `Supavisor session mode` o `Direct connection` para `DIRECT_URL`

### Storage

Este proyecto espera un bucket llamado `products`.

Debes crear:

1. Bucket: `products`
2. Acceso: público

La app genera URLs públicas para las imágenes subidas, así que si el bucket no existe o no es accesible, fallará `/api/upload`.

## 3. Configuración en Vercel

### Proyecto

1. Importa el repositorio en Vercel.
2. Framework detectado: `Next.js`
3. Root Directory: la raíz actual del repo
4. Agrega las variables de entorno de la sección 1

### Dominio

Para el subdominio `erp.simtechgt.com`:

1. En Vercel, abre el proyecto.
2. Ve a `Settings -> Domains`.
3. Agrega `erp.simtechgt.com`.
4. En tu proveedor DNS de `simtechgt.com`, crea el `CNAME` que te indique Vercel para el subdominio.

Referencia oficial:

- Vercel indica que para subdominios debes usar `CNAME`.

## 4. Antes del primer deploy productivo

1. Confirma que `npm run lint` pase.
2. Confirma que `npm run typecheck` pase.
3. Confirma que `npm run build` pase.
4. Aplica manualmente, en la base objetivo, estos SQL si aún no existen:
   - `prisma/manual_migrations/20260415_sales_idempotency_and_returns.sql`
   - `prisma/manual_migrations/20260415_account_payment_cash_register.sql`
   - `prisma/manual_migrations/20260415_sale_item_unit_cost.sql`
   - `prisma/manual_migrations/20260417_company_settings_alignment.sql`

## 5. Después del deploy

Pruebas mínimas:

1. Login en `https://erp.simtechgt.com/login`
2. Carga de dashboard
3. Consulta de productos
4. Subida de imagen en inventario
5. Venta simple
6. Abono a cliente
7. Egreso o movimiento contable

## 6. Qué necesito de tu lado

No necesito que pegues secretos completos en el chat.

Lo ideal es que hagas una de estas dos cosas:

1. Configuras las variables directamente en Vercel y Supabase, y luego me dices cuáles ya quedaron.
2. Las colocas localmente en `.env` con los nombres exactos del proyecto y yo valido que el formato quede correcto sin exponerlas.

Confírmame estos datos no sensibles para seguir:

- `PROJECT_REF` de Supabase
- región del proyecto Supabase
- si ya creaste el bucket `products`
- quién gestiona el DNS de `simtechgt.com` (Cloudflare, GoDaddy, Namecheap, etc.)
- si el proyecto de Vercel ya existe o todavía hay que crearlo
