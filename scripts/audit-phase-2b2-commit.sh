#!/usr/bin/env bash
# Sprint 2.B.2 — Rate limit de login.
# Correr desde la raíz del repo, en la rama de auditoría.
#
#   bash scripts/audit-phase-2b2-commit.sh
#
# Pre-requisitos: la migración add_login_attempt_for_rate_limit ya se
# aplicó en Supabase vía MCP. El script local-dev de Prisma necesita
# regenerar el cliente.

set -euo pipefail

cd "$(dirname "$0")/.."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != audit/* ]]; then
  echo "ERROR: estás en '$CURRENT_BRANCH'. Cambiate a la rama de auditoría."
  exit 1
fi

echo "→ Regenerando Prisma Client (LoginAttempt es nuevo)"
npx prisma generate >/tmp/audit-prisma-gen.log 2>&1 || {
  echo "ERROR: prisma generate falló."
  tail -40 /tmp/audit-prisma-gen.log
  exit 1
}
echo "  ✓ prisma generate ok"

echo "→ Validando typecheck"
if ! npm run typecheck >/tmp/audit-typecheck.log 2>&1; then
  echo "ERROR: typecheck falló."
  tail -60 /tmp/audit-typecheck.log
  exit 1
fi
echo "  ✓ typecheck ok"

echo "→ Validando lint"
if ! npm run lint >/tmp/audit-lint.log 2>&1; then
  echo "WARN: lint reportó problemas."
  tail -40 /tmp/audit-lint.log
  read -r -p "¿Continuar igual? [y/N] " confirm
  if [[ "$confirm" != "y" ]]; then exit 1; fi
fi
echo "  ✓ lint ok (o aceptado)"

# Commit 1 — schema + migración
git add prisma/schema.prisma prisma/manual_migrations/20260509_add_login_attempt_for_rate_limit.sql
git commit -m "feat(rate-limit): tabla LoginAttempt para conteo de intentos

Modelo Prisma + migración SQL. La tabla registra cada intento de login
(éxito o fallo) con email, ipAddress, success y timestamp. Indexada por
(email, createdAt DESC) e (ipAddress, createdAt DESC) para conteo rápido
en ventana móvil. RLS habilitado (deny-all para anon/authenticated).

Migración ya aplicada a Supabase project cfluozcpcrqfapqwquip vía MCP." \
  || echo "  (sin cambios para este commit)"

# Commit 2 — helper + auth integration
git add src/lib/rate-limit.ts src/lib/auth.ts
git commit -m "feat(auth): rate limit de login (5/email + 20/IP por 15 min)

- src/lib/rate-limit.ts: helper con checkLoginRateLimit + recordLoginAttempt.
  Persiste en Postgres (no memoria) para que funcione en serverless con
  N lambdas concurrentes y sobreviva redeploys. Doble dimensión (email + IP)
  para balance entre seguridad y NAT corporativo.
- src/lib/auth.ts: chequea rate limit ANTES de verifyPassword (que es caro
  por bcrypt rounds=12). Mensaje genérico para no filtrar si el email
  existe. Login exitoso registra para auditoría; fallo registra para
  alimentar el contador.
- Script de commit: bash scripts/audit-phase-2b2-commit.sh." \
  || echo "  (sin cambios para este commit)"

# Commit 3 — script de commit (autocomentado)
git add scripts/audit-phase-2b2-commit.sh 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "chore(audit-2b2): script de commit"
fi

echo ""
echo "→ Resumen de commits nuevos:"
git log --oneline origin/$CURRENT_BRANCH..HEAD 2>/dev/null || git log --oneline -5

echo ""
read -r -p "¿Pushear a origin/$CURRENT_BRANCH? [y/N] " do_push
if [[ "$do_push" == "y" ]]; then
  git push origin "$CURRENT_BRANCH"
  echo "✅ Pushed."
  echo "Después: cherry-pick / merge a develop para deploy a Vercel."
fi
