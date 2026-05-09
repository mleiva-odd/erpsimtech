# Fase 2 — Resumen y estado

Branch: `audit/phase-1-security-readonly`. (Mantenemos la rama porque toda Fase 2 sigue siendo trabajo de hardening contra el mismo baseline.)

## Sprint 2.A · Limpieza y rotación

Acciones que **vos ejecutás**:

1. `bash scripts/audit-phase-2a-cleanup.sh` — borra del filesystem `credentials.md`, `get_admin.js`, `dev*.log`, `terminal.txt`, `src/middleware.ts` (vacío), `.env.temp/.env2/...`, `playwright-report/`, `test-results/` y artefactos de prueba.
2. Seguir `docs/audits/phase-2-rotation-checklist.md` paso a paso (rotar `NEXTAUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, contraseñas reales en Supabase).
3. `git commit -m 'chore(audit-2a): limpieza de credenciales y artefactos sensibles'` y push.

## Sprint 2.B · Hardening de código (hecho)

Cambios aplicados al árbol — pendientes de commit + push.

### Nuevos módulos

- **`src/lib/hashing.ts`** — `BCRYPT_ROUNDS=12`, `hashPassword()`, `verifyPassword()`, `validatePasswordStrength()` con política mínima (12 chars, A/a/0/símbolo).
- **`src/lib/notifications.ts`** — extracción de `createNotification` fuera del route file. Rompe acople vía `@/app/api/notifications/route`.

### Endurecimiento de NextAuth (`src/lib/auth.ts`)

- `bcrypt.compare` → `verifyPassword` (consume helper centralizado).
- Email normalizado a `lowercase` antes del lookup.
- Mensaje `"Credenciales inválidas"` genérico (no filtra si el email existe).
- `maxAge` 30 d → 14 d.
- `updateAge: 24 * 60 * 60` para refresh suave del token.
- Cookies con `httpOnly`, `sameSite=lax`, `secure` en prod, prefijo `__Secure-` para producir cookies host-only.
- Placeholder `admin@simtech.com` → `admin@example.com`.

### Headers de seguridad (`next.config.ts`)

- `poweredByHeader: false`.
- CSP estricta (script-src `self` en prod, `unsafe-inline/eval` solo en dev).
- HSTS 1 año `includeSubDomains; preload` (solo prod).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` deshabilita `camera/microphone/geolocation/interest-cohort/payment`.
- `images.remotePatterns` para Supabase storage.

### Centralización de bcrypt (8 archivos)

Todos los call sites pasan por `hashPassword()` o (en CLI scripts) usan `12` rounds explícitos:

- `src/app/api/users/route.ts` — Zod fortalecido (12+ chars, complejidad).
- `src/app/api/users/[id]/route.ts` — `validatePasswordStrength` antes de hashear.
- `src/app/api/admin/companies/route.ts` — política aplicada al admin de la empresa nueva.
- `src/app/api/admin/companies/[id]/route.ts` — política antes de la transacción (devuelve 400 limpio en débil).
- `src/app/api/onboarding/route.ts` — Zod del trial endurecido.
- `prisma/seed.ts` — `SEED_BCRYPT_ROUNDS=12`.
- `scripts/bootstrap-superadmin.ts` — ya estaba en 12; deja de imprimir el objeto completo.
- `scripts/create-restricted-company.ts` — 10 → 12.

### Fix de autorización en customers/[id]

Antes: `getServerSession` crudo, sin permission check, sin Zod. Cualquier usuario autenticado del tenant podía editar/borrar clientes y modificar `creditLimit`.

Ahora:
- `requireOperationalPermission(['customers:manage', 'settings:manage'])`.
- Zod schema (`UpdateCustomerSchema`) con `.trim()` en strings y `coerce.number().min(0)` en `creditLimit`.
- DELETE bloqueado con 409 si el cliente tiene `balance != 0` o tiene historial (FK constraint).
- Manejo explícito de `Prisma.PrismaClientKnownRequestError` con códigos `P2025`, `P2003`, `P2014`.
- Audit log con acciones nuevas `CUSTOMER_UPDATED` y `CUSTOMER_DELETED` (extendidas en `src/lib/audit.ts`).

### `await` en createAuditLog y createNotification

Eliminado fire-and-forget en 11 endpoints (`sales`, `sales/[id]/return`, `cash-register`, `customers/[id]/payments`, `settings`, `stock-transfers`, `stock-transfers/[id]` (×2), `pos/expense`, `pos/returns`, `inventory/adjustments`, `onboarding`). Razón: en Vercel serverless las promesas dangling pueden no flushearse antes de cerrar la lambda. Costo: ~10-30 ms extra por request, aceptable.

Adicionalmente, eliminado `console.log('--- SOLICITUD DE VENTA RECIBIDA ---')` en `sales/route.ts`.

### .gitignore

Actualizado con doble patrón para `Rediseñar landing y login/` (NFC + NFD para macOS HFS+).

## Sprint 2.C · Pendiente (próxima sesión)

- **Activar RLS en Supabase** + Prisma Client Extension que setee `SET LOCAL app.tenant_id`. Requiere migration → push a Supabase. Defensa en profundidad para multi-tenant.
- **Rate limiting** en login y endpoints públicos (Upstash Ratelimit o tabla LoginAttempt).
- **Sessions con `userVersion`** para revocación inmediata (cuando se cambia password / se desactiva usuario).

## Cómo proceder ahora

1. Ejecutá `bash scripts/audit-phase-2a-cleanup.sh` y commiteá el resultado (paso 2.A).
2. Seguí `docs/audits/phase-2-rotation-checklist.md` (rotación en Supabase y Vercel) — esta parte no requiere código, solo configurar servicios.
3. Ejecutá `bash scripts/audit-phase-2b-commit.sh`. Validará typecheck/lint, hará 5 commits separados por tema, y te ofrecerá pushear a `origin/audit/phase-1-security-readonly`.
4. Cuando esté pusheado, abrí PR a `main` desde GitHub. La revisión visual del diff es más cómoda en GitHub que acá.
5. Una vez mergeado a `main`, Vercel deploya automáticamente y aplicas los nuevos headers/cookies a producción. Después de deploy, **probá el login** porque el cambio de cookies invalidará todas las sesiones existentes (esto es esperado).

Cuando quieras seguir con Sprint 2.C, decímelo. Esa fase sí toca DB y necesita un `prisma db push` planeado.
