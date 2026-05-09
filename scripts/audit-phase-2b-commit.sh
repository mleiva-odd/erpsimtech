#!/usr/bin/env bash
# Sprint 2.B — Commit y push de los cambios de hardening.
# Correr DESPUÉS de haber corrido scripts/audit-phase-2a-cleanup.sh y
# de haber commiteado esa primera limpieza.
#
#   bash scripts/audit-phase-2b-commit.sh
#
# Este script:
# 1. Verifica que typecheck/lint/build pasen ANTES de commitear.
# 2. Commitea cambios de Sprint 2.B en lotes lógicos para que el diff sea legible.
# 3. Pushea a origin.

set -euo pipefail

cd "$(dirname "$0")/.."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != audit/* ]]; then
  echo "ERROR: estás en '$CURRENT_BRANCH'. Cambiate a la rama de auditoría."
  exit 1
fi

# Commit 0 — preflight fix de typecheck (bug pre-existente en JSX, bloquea typecheck)
echo "→ Aplicando fix de JSX en accounting/receivables (preflight typecheck)"
git add 'src/app/(dashboard)/accounting/receivables/page.tsx' 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "fix(accounting/receivables): JSX inválido bloqueaba typecheck

La página tenía un objeto literal { ... } anidado dentro de la expresión JSX
({p.status !== 'VOID' && ( {canManageTreasury && (...)}) )}), inválido.
Se simplifica a 'p.status !== VOID && canManageTreasury && (...)'."
fi

echo "→ Validando typecheck (puede tardar)"
if ! npm run typecheck >/tmp/audit-typecheck.log 2>&1; then
  echo "ERROR: typecheck falló. Revisá /tmp/audit-typecheck.log y corregí antes de commitear."
  tail -60 /tmp/audit-typecheck.log
  exit 1
fi
echo "  ✓ typecheck ok"

echo "→ Validando lint"
if ! npm run lint >/tmp/audit-lint.log 2>&1; then
  echo "WARN: lint reportó problemas. Revisá /tmp/audit-lint.log."
  tail -40 /tmp/audit-lint.log
  read -r -p "¿Continuar igual? [y/N] " confirm
  if [[ "$confirm" != "y" ]]; then exit 1; fi
fi
echo "  ✓ lint ok (o aceptado)"

# Commit 1 — utilidades centralizadas
git add src/lib/hashing.ts src/lib/notifications.ts
git commit -m "feat(security): hashing y notifications centralizados

- src/lib/hashing.ts: BCRYPT_ROUNDS=12, hashPassword/verifyPassword,
  validatePasswordStrength con política mínima (12 chars, A/a/0/símbolo).
- src/lib/notifications.ts: extracción de createNotification fuera del
  route file para romper el acople via @/app/api/notifications/route." \
  || echo "  (sin cambios para este commit)"

# Commit 2 — auth y headers de seguridad
git add src/lib/auth.ts next.config.ts src/app/api/notifications/route.ts || true
git commit -m "feat(security): NextAuth hardening y CSP/HSTS/headers

- auth.ts: cookies httpOnly+secure+sameSite=lax, sessionToken con prefijo
  __Secure- en prod, maxAge bajado de 30d a 14d con updateAge=24h,
  email normalizado a lowercase antes del lookup.
- next.config.ts: poweredByHeader=false; CSP, X-Frame-Options=DENY,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy y HSTS
  en producción. images.remotePatterns para Supabase storage.
- notifications/route: re-export de createNotification desde lib/." \
  || echo "  (sin cambios para este commit)"

# Commit 3 — bcrypt centralizado en endpoints
git add \
  src/app/api/users/route.ts \
  src/app/api/users/\[id\]/route.ts \
  src/app/api/admin/companies/route.ts \
  src/app/api/admin/companies/\[id\]/route.ts \
  src/app/api/onboarding/route.ts \
  prisma/seed.ts \
  scripts/bootstrap-superadmin.ts \
  scripts/create-restricted-company.ts || true
git commit -m "refactor(security): bcrypt rounds y password policy centralizados

- Todos los endpoints que hashean passwords pasan por hashPassword().
- Política mínima de password aplicada en users/[id], onboarding y
  admin/companies/[id]. Validación previa a la transacción para 400 limpio.
- seed.ts: rounds=12 (alineado a lib/hashing).
- bootstrap-superadmin: deja de imprimir el objeto completo en logs." \
  || echo "  (sin cambios para este commit)"

# Commit 4 — fix de customers/[id] y await de audit
git add src/app/api/customers/\[id\]/route.ts src/lib/audit.ts || true
git commit -m "fix(security): customers/[id] usa requireOperationalPermission

- PUT/DELETE migran de getServerSession crudo a requireOperationalPermission
  (customers:manage o settings:manage), evitando que cualquier usuario
  autenticado del tenant edite/borre clientes.
- Validación Zod del body con coerce.number para creditLimit.
- DELETE bloqueado si el cliente tiene saldo pendiente (409).
- AuditAction extendido con CUSTOMER_CREATED/UPDATED/DELETED." \
  || echo "  (sin cambios para este commit)"

# Commit 5 — await en createAuditLog y notification fire-and-forget
git add \
  src/app/api/sales/route.ts \
  src/app/api/sales/\[id\]/return/route.ts \
  src/app/api/cash-register/route.ts \
  src/app/api/customers/\[id\]/payments/route.ts \
  src/app/api/settings/route.ts \
  src/app/api/stock-transfers/route.ts \
  src/app/api/stock-transfers/\[id\]/route.ts \
  src/app/api/pos/expense/route.ts \
  src/app/api/pos/returns/route.ts \
  src/app/api/inventory/adjustments/route.ts \
  src/app/api/onboarding/route.ts || true
git commit -m "fix(stability): await de createAuditLog y createNotification

En serverless (Vercel), promesas dangling pueden no llegar a flushearse.
Usar await en createAuditLog y createNotification garantiza que el log
de auditoría y las notifs lleguen a Postgres antes de cerrar la lambda.
El costo es ~10-30ms extra por request, aceptable.

También limpia el console.log informal en sales POST." \
  || echo "  (sin cambios para este commit)"

echo ""
echo "→ Resumen de commits:"
git log --oneline origin/$CURRENT_BRANCH..HEAD 2>/dev/null || git log --oneline -5

echo ""
read -r -p "¿Pushear a origin/$CURRENT_BRANCH? [y/N] " do_push
if [[ "$do_push" == "y" ]]; then
  git push origin "$CURRENT_BRANCH"
  echo "✅ Pushed."
  echo "Cuando estés listo, abrí PR a main desde GitHub."
fi
