# Auditoría de Seguridad y Estabilidad — Fase 1

**Proyecto:** ERP-SIMTECH (Next.js 16 · Prisma · Supabase · NextAuth)
**Estado del producto:** Desplegado en Vercel/Supabase, sin clientes activos (demos/pruebas).
**Rama de la auditoría:** `audit/phase-1-security-readonly`
**Alcance:** Lectura del repo en `develop` + working tree. Sin cambios de código en esta fase.

---

## Resumen ejecutivo

El código tiene **bases sólidas**: arquitectura multi-tenant ya pensada (`tenant.ts`, `subscription.ts`), checks de permisos centralizados, transacciones Prisma en operaciones críticas (ventas con concurrencia optimista, traslados, pagos), validación Zod en la mayoría de endpoints, audit log y NextAuth con JWT. Sin embargo, hay **brechas concretas** que deben cerrarse antes de aceptar clientes en producción, y algunas inconsistencias menores que se acumulan.

| Severidad | Hallazgos |
|----------:|----------:|
| Crítico   | 4 |
| Alto      | 7 |
| Medio     | 9 |
| Bajo      | 6 |

Las acciones críticas (rotar credenciales débiles, blindar onboarding/bootstrap, headers/rate-limit) son rápidas y no rompen nada en producción.

---

## Crítico

### C-01 · `credentials.md` con contraseñas en texto plano en el árbol de trabajo
- **Evidencia:** `credentials.md` lista contraseñas como `admin123`, `gerente123`, `cajero123` para super admin y staff de demo.
- **Riesgo:** Aunque hoy no está trackeado por git, está al lado del repo y un `git add -A` despistado lo commitea. Más grave: si esos usuarios y contraseñas siguen activos en Supabase de producción (porque el seed se ejecutó con `SEED_*_PASSWORD` apuntando a esos valores), cualquiera con la URL pública entra como super admin con `admin123`.
- **Remediación:** (1) mover el archivo fuera del repo (`scratch/` o eliminar). (2) Rotar TODAS esas contraseñas en la BD productiva ya. (3) Definir contraseñas fuertes (≥16 chars) en variables `SEED_*_PASSWORD` en Vercel/Supabase. (4) `.gitignore` ya bloquea `credentials.md` (incluido en parche de Fase 0).

### C-02 · `get_admin.js` permite reset de super admin
- **Evidencia:** `get_admin.js` en raíz, requiere `ALLOW_ADMIN_RESET=1` y `ADMIN_RESET_PASSWORD` y resetea/genera password. Si por error ese script termina en una imagen Docker o Vercel build, abre puerta trasera.
- **Riesgo:** Aunque tiene guarda por env, no debería convivir con el código fuente de producción.
- **Remediación:** Borrarlo del filesystem. Reemplazar por uso documentado de `scripts/bootstrap-superadmin.ts`, que ya hace lo correcto (≥10 chars, bcrypt 12, no imprime password).

### C-03 · No hay rate limiting en `/api/auth` (login)
- **Evidencia:** `src/lib/auth.ts` define `CredentialsProvider` directo. No hay throttling en intentos fallidos.
- **Riesgo:** Brute force trivial sobre cuentas conocidas, especialmente con contraseñas débiles del seed.
- **Remediación:** Implementar rate limit por (IP, email) en el `authorize()` o en `proxy.ts` para `/api/auth/callback/credentials`. Bloqueo escalonado (5 intentos / 15 min). Stack sugerido: Upstash Ratelimit (KV gratis hasta cierto volumen) o `@vercel/edge` con KV. Alternativa serverless local: tabla `LoginAttempt` con cleanup en cron.

### C-04 · Ausencia de headers de seguridad y CSP
- **Evidencia:** `next.config.ts` está vacío. Sin `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Riesgo:** Clickjacking, XSS amplificado, leaks de referrer, mixed content.
- **Remediación:** Agregar `headers()` en `next.config.ts` con CSP estricto (permitir solo `self`, Supabase storage URL, recharts si aplica), HSTS con `preload`, frame deny, MIME sniff off.

---

## Alto

### A-01 · `src/middleware.ts` vacío y `src/proxy.ts` activo (Next 16)
- **Evidencia:** `middleware.ts` 0 bytes; `proxy.ts` exporta `proxy` y `config.matcher`. Next 16 renombró el convention de `middleware` a `proxy` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
- **Riesgo:** El proxy SÍ corre, pero el archivo vacío genera confusión y puede romper si alguien hace `import` o intenta backportarlo.
- **Remediación:** Borrar `src/middleware.ts`. Documentar en README la migración a `proxy.ts`.

### A-02 · `customers/[id]` route bypassa el helper centralizado
- **Evidencia:** `src/app/api/customers/[id]/route.ts` PUT/DELETE usan `getServerSession` directo, NO llaman a `requirePermission` o `requireOperationalPermission`. Solo verifican autenticación + `companyId`.
- **Riesgo:** Cualquier usuario autenticado del tenant (incluyendo cajero) puede editar/eliminar clientes — incluso sus créditos (`creditLimit`) y borrarlos a pesar de tener historial. Tampoco hay validación Zod del body.
- **Remediación:** Migrar a `requireOperationalPermission(['customers:manage','settings:manage'])`. Agregar Zod para `name`, `email`, `phone`, `nit`, `address`, `creditLimit`. Considerar `creditLimit` requiere permiso aparte.

### A-03 · `bcrypt.hash(_, 10)` en algunos endpoints, 12 en otros
- **Evidencia:** `prisma/seed.ts:78-81`, `src/app/api/users/route.ts:101`, `src/app/api/users/[id]/route.ts:74`, `src/app/api/admin/companies/[id]/route.ts:70` usan rounds=10. `bootstrap-superadmin.ts` y `onboarding/route.ts` usan 12.
- **Riesgo:** Inconsistencia que abre debate cada vez. Rounds=10 es aceptable hoy pero el estándar moderno es 12.
- **Remediación:** Centralizar en `src/lib/hashing.ts` con constante `BCRYPT_ROUNDS = 12` y helper `hashPassword(plain)`. Reemplazar todas las llamadas. Documentar en CLAUDE.md/AGENTS.md.

### A-04 · Política de contraseña débil en onboarding
- **Evidencia:** `OnboardingSchema.adminPassword: z.string().min(6)`.
- **Riesgo:** Cliente nuevo crea su admin con `123456`. Toda la cadena de seguridad del tenant queda colgando de eso.
- **Remediación:** `z.string().min(12).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)` o equivalente. Idealmente integrar con [zxcvbn](https://github.com/dropbox/zxcvbn) para fuerza real, no solo regex.

### A-05 · Sesiones JWT de 30 días sin rotación ni revocación
- **Evidencia:** `auth.ts: maxAge: 30 * 24 * 60 * 60`. JWT firmado, no hay tabla `Session` ni denylist.
- **Riesgo:** Usuario despedido / dispositivo perdido → sigue autorizado 30 días. No hay forma de revocar.
- **Remediación:** (1) Bajar a 7-14 días con sliding refresh. (2) Implementar `version` en `User` (incrementar al cambiar password / desactivar) y validar en JWT callback que `token.userVersion === user.version`. (3) Para revocación inmediata, fallback a sessions DB (NextAuth Adapter) o lista corta de IDs revocados en KV.

### A-06 · Service-role de Supabase usado siempre, sin red de seguridad RLS
- **Evidencia:** `src/lib/supabase.ts` instancia el cliente con `SUPABASE_SERVICE_ROLE_KEY`. Comentario explícito: "podemos saltarnos RLS". Prisma se conecta directo a Postgres con superuser pooler.
- **Riesgo:** Aislamiento de datos depende 100% de que TODOS los handlers filtren por `companyId`. Un solo `findFirst` mal escrito = data leak entre clientes. No hay defensa en profundidad.
- **Remediación:** (1) Activar RLS en tablas `Company`-scoped y crear políticas `USING (company_id = current_setting('app.tenant_id')::uuid)`. (2) Usar Prisma Client Extensions o `prisma.$extends` que setee `SET LOCAL app.tenant_id = ...` al iniciar cualquier transacción. (3) Mantener service_role solo para operaciones realmente globales (Storage, super_admin). Ver `docs/audits/phase-1-security-deep-dive-rls.md` (a generar en Fase 2).

### A-07 · Audit log fire-and-forget sin manejo de errores
- **Evidencia:** `src/app/api/sales/route.ts:418` llama `createAuditLog({...})` sin `await`. Si falla, se pierde el rastro y no hay alerta.
- **Riesgo:** Auditoría incompleta. Para clientes que requieren cumplimiento (ISO, SOX-lite, SAT-FEL en GT), un log perdido es problema legal.
- **Remediación:** O bien `await` con captura controlada, o encolar en una tabla `OutboxEvent` y procesar con un job. Para v1, `await` y try/catch que loguee a observabilidad sin reventar la transacción del usuario.

---

## Medio

### M-01 · 9 archivos `.env*` locales (`.env`, `.env.local`, `.env.temp`, `.env2`, `.env.vercel.production`, `vercel_production.env`)
Confusión de configuraciones. Riesgo de cargar la wrong env. **Remediación:** Quedarse con `.env` (local), `.env.example` (commit), y subir lo de prod solo a Vercel. Borrar el resto. (gitignore ya los bloquea).

### M-02 · Logs de desarrollo trackeados (`dev.log`, `dev_server*.log`, `prisma_dev*.log`, `terminal.txt`)
Aunque ya están en `.gitignore`, varios están en working tree con info de queries y stack traces. **Remediación:** Mover/eliminar y verificar `git log --all -- dev*.log` que no se hayan commiteado en commits viejos.

### M-03 · `playwright-report/` y `test-results/` trackeados en git
**Evidencia:** `git ls-files` los muestra. **Riesgo:** Bloat del repo, ruido en diffs, posible info de tests con datos sensibles. **Remediación:** `git rm --cached -r playwright-report/ test-results/` (incluido en bootstrap Fase 0).

### M-04 · `console.log('--- SOLICITUD DE VENTA RECIBIDA ---')` y otros en producción
**Evidencia:** `src/app/api/sales/route.ts:43`, varios `console.error` con detalles internos en `upload/route.ts`, `customers/[id]/route.ts`. **Remediación:** Logger estructurado (pino o `console.json`) con niveles por env. Observability se aborda en Fase 6.

### M-05 · `dangerouslySetInnerHTML` con CSS hardcodeado
**Evidencia:** `src/components/inventory/PrintBarcodeModal.tsx:74`. Contenido es estático, riesgo bajo, pero anti-patrón. **Remediación:** `<style jsx>` o `<style>` normal.

### M-06 · `customers/route.ts` Zod sin `.trim()`
**Evidencia:** `name: z.string().min(2)` sin `.trim()`. Inconsistente con otros schemas. **Remediación:** Estandarizar `.trim()` en todos los strings que vayan a uniques o búsquedas.

### M-07 · Errores de fechas en query params sin Zod
**Evidencia:** `accounting/route.ts:20-26` parsea `dateFrom`/`dateTo` con `new Date(...)` directo. String inválido → `Invalid Date` silencioso. **Remediación:** Zod `z.string().datetime().optional()` antes de pasar a Prisma.

### M-08 · `createNotification` importado desde un route file
**Evidencia:** `src/app/api/sales/route.ts` importa de `@/app/api/notifications/route`. Acopla rutas y crea riesgo de circular deps al refactorizar. **Remediación:** Mover lógica a `src/lib/notifications.ts`.

### M-09 · Sin protección contra ID enumeration en endpoints `[id]`
Al editar un recurso por ID UUID v4 hay baja probabilidad pero alguna ruta usa `findUnique({ where: { id } })` sin tenant scope antes del update con scope. **Remediación:** Auditar endpoint por endpoint en Fase 3 (multi-tenant deep dive). El patrón seguro es `update({ where: { id, companyId } })` que ya usa `customers/[id]`.

---

## Bajo

### B-01 · Placeholder `admin@simtech.com` en `auth.ts`
Solo es placeholder visual, pero anima a usar ese email. Cambiar a `admin@example.com`.

### B-02 · `bootstrap-superadmin.ts` imprime objeto creado en `console.log`
Incluye email y nombre. En logs de CI/Vercel queda registro. **Remediación:** Imprimir solo `{ id, role, status }`.

### B-03 · Falta `.tool-versions` o `engines` en package.json
Vercel resuelve Node a la última, pero útil pinear versión para reproducibilidad. **Remediación:** `"engines": { "node": ">=20.0.0" }`.

### B-04 · `next.config.ts` literalmente vacío (sin `images` whitelist)
Si más adelante se cargan imágenes externas (Supabase Storage), `next/image` requiere `remotePatterns`. **Remediación:** Configurar al integrar.

### B-05 · `.next/`, `.agent/`, `scratch/` en raíz visible
Limpios localmente pero incluidos en muchos comandos. **Remediación:** `.gitignore` ya los bloquea.

### B-06 · Refs git rotas (`backup-marvinls69`, `erp-origin`, `previous`)
Solo cosmético. **Remediación:** El bootstrap script de Fase 0 las limpia.

---

## Métricas observadas

- 63 archivos `route.ts` en `src/app/api/**`.
- 62/63 usan algún `requireTenant*`/`requirePermission*`. 1 excepción: `customers/[id]/route.ts` (A-02).
- ~140 queries `findFirst|findUnique|findMany` que la heurística no marcó con `companyId` literal. Falsos positivos abundantes (filtran por foreign key del tenant). Auditar uno a uno en Fase 3.
- Schema con `companyId` en 18 modelos top-level del tenant. Sub-modelos heredan vía relación. Índices `[companyId, ...]` bien puestos.
- 30 días de JWT, sin denylist.
- 0 endpoints con rate limiting.
- 0 headers de seguridad configurados.

---

## Plan de remediación (Fase 2 inmediata)

**Sprint 2.A — Limpieza y rotación (1-2 horas):**
1. Borrar `credentials.md`, `get_admin.js`, `dev*.log`, `terminal.txt`. (Ya bloqueados en `.gitignore`.)
2. Rotar contraseñas en Supabase: super admin, admin empresa, gerentes, cajeros. Pasar a contraseñas fuertes vía variables `SEED_*_PASSWORD` y reseed.
3. Rotar `NEXTAUTH_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
4. Borrar `src/middleware.ts` vacío.

**Sprint 2.B — Hardening rápido (medio día):**
5. Agregar `next.config.ts` headers (CSP, HSTS, frame-deny, MIME sniff).
6. Implementar rate limit en `auth` (Upstash) — 5/15min por (IP,email).
7. Subir `bcrypt` a 12 en todos los puntos. Centralizar en `lib/hashing.ts`.
8. Endurecer Zod de onboarding (≥12 chars, complejidad).
9. Migrar `customers/[id]/route.ts` a `requireOperationalPermission` + Zod.
10. `await` el `createAuditLog` (con try/catch) en sales y otros endpoints transaccionales.

**Sprint 2.C — Defensa en profundidad (1-2 días):**
11. Activar RLS en Supabase + Prisma extension que setee `app.tenant_id`. Tests cross-tenant.
12. Sessions con `userVersion` y revocación. Reducir maxAge a 14 días.

**Sprint 2.D — Observabilidad (1 día):** (se solapa con Fase 6)
13. Logger estructurado con request ID.
14. Sentry para errors server+client.
15. Endpoint `/api/health` con check DB y Supabase.

---

## Lo que NO es problema (validado)

- Sales POST: transacción, concurrencia optimista (`updateMany` + `count===1`), idempotencia (`clientRequestId`). Bien hecho.
- Onboarding: transaction, slug único, password hash 12. Solo el `min(6)` está flojo.
- Bootstrap superadmin: env-driven, fail-closed. Solo hay que dejar de imprimir el objeto completo.
- Upload: tipos whitelist, tamaño máximo 5MB, sharp resize y reencode a WebP, nombre saneado, ruta hardcodeada. Bien.
- Schema Prisma: `companyId` en todos los root models, índices y uniques compuestos correctos.
- `proxy.ts`: matcher correcto para Next 16, mapa fino de permisos por ruta.
- NextAuth: secret obligatorio (`requireEnv`), JWT verificado, callbacks bien.

---

## Próximos pasos

Cierre de Fase 1 con este informe. Fase 2 arranca con el sprint 2.A (limpieza + rotación) que es de menor riesgo. Cada sprint en commit y PR a `main` desde `audit/phase-2-*`.
