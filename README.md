# 🚀 SIMTECH POS - Enterprise SaaS

Bienvenido al repositorio oficial de **SIMTECH POS**, un Punto de Venta (ERP) avanzado con arquitectura de software como servicio (SaaS) Multi-Sucursal, construido en **Next.js 16**, **Tailwind CSS**, **Prisma ORM** y **PostgreSQL**.

---

## 🏗️ Requisitos Previos (Local)

Para ejecutar este proyecto en un entorno local, asegúrate de tener instalados:
- **Node.js** (v18.0 o superior)
- **PostgreSQL** corriendo localmente o una URI válida (ej. Supabase)

---

## ⚙️ Despliegue en Entorno Local (Paso a Paso)

Sigue estas estrictas instrucciones si vas a probar este sistema en modo "Desarrollador/QA":

### 1. Clonar e Instalar Independencias
Clona el repositorio e instala los paquetes de Node:
```bash
git clone git@github.com:mleiva-odd/SIMTECHPOS.git
cd SIMTECHPOS
npm install
```

### 2. Variables de Entorno (`.env`)
En la raíz del proyecto, asegúrate de crear el archivo `.env` configurando la base de datos de Postgres y tu secreto de NextAuth:
```bash
# Variables Obligatorias
DATABASE_URL="postgresql://USUARIO:CONTRASEÑA@localhost:5432/simtechdb?schema=public"
NEXTAUTH_SECRET="cualquier-string-largo-aleatorio-para-encriptacion-de-sesiones"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Sincronización DB y Sembrado de Datos (Seed)
Este proyecto cuenta con un script inyector (`prisma/seed.ts`), el cual construirá toda la base de datos inicial y cargará usuarios e inventario base.

Sube las tablas a tu base de datos:
```bash
npx prisma db push
```

Corre la Semilla (Seeder):
```bash
npx prisma db seed
# Node inyectará el inventario semilla y las credenciales maestras.
```

### 4. Levantar Servidor
Finalmente, arranca la máquina en modo desarrollo (Turbopack):
```bash
npm run dev
```
Dirígete a `http://localhost:3000` en tu navegador para ver el App Launcher.

---

## 🔑 Credenciales Generadas Automáticamente (Para Pruebas)

Al correr el comando `npx prisma db seed`, el sistema crea por defecto estas dos identidades para que inicies sesión:

| Usuario / Rol | Correo Electrónico (Login) | Contraseña | ¿Qué puede hacer? |
| --- | --- | --- | --- |
| **Súper Administrador** | `admin@simtechpos.com` | `admin123` | Control global de la aplicación, auditorías, empresas y facturación global. |
| **Admin de Empresa** | `simtech@simtech.com` | `admin123` | Control del Negocio (SIMTECH), gestión de toda su Sucursal Central, Stock y Usuarios. |

> **Nota Adicional:** El Seeder del `Admin de Empresa` ya incluye un inventario de **3 Productos Tecnológicos** inyectados automáticamente en la sucursal para que puedas empezar a cobrar en el `POS` o trasladarlos apenas ingreses.

---
**Simtech Enterprise Solutions © 2026**
