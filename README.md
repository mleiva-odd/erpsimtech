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

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` a partir de `.env.example`.

3. Sincroniza la base local y genera datos semilla:

```bash
npx prisma db push
npx prisma db seed
```

4. Levanta la app:

```bash
npm run dev
```

## Credenciales de seed

Después de `npx prisma db seed`:

- `admin@simtechpos.com` / `admin123`
- `simtech@simtech.com` / `admin123`

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

## Estado técnico actual

- `npm run lint`: limpio
- `npm run typecheck`: limpio
- `npm run build`: limpio
- `npm audit --omit=dev`: limpio
