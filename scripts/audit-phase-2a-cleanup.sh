#!/usr/bin/env bash
# Sprint 2.A — Limpieza de archivos sensibles y artefactos.
# Correr desde la raíz del repo, en la rama de auditoría:
#
#   bash scripts/audit-phase-2a-cleanup.sh
#
# Borra archivos que NO deberían estar en disco junto al código fuente.
# Si querés conservarlos para referencia, antes de correr el script
# moverlos a otra ubicación fuera del repo.

set -euo pipefail

cd "$(dirname "$0")/.."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != audit/* ]]; then
  echo "ERROR: estás en '$CURRENT_BRANCH'. Cambiá a una rama 'audit/*' antes de continuar."
  echo "  git checkout audit/phase-1-security-readonly"
  exit 1
fi

echo "→ Eliminando archivos sensibles / artefactos del working tree"

# Credenciales y scripts puntuales peligrosos
rm -f credentials.md
rm -f get_admin.js

# Logs de desarrollo (todos están ya en .gitignore, pero los limpiamos)
rm -f dev.log dev_server.log dev_server_3000.log dev_server_final.log
rm -f prisma_dev.log prisma_dev_bin.log prisma_dev_final.log prisma_dev_retry.log prisma_dev_stable.log
rm -f terminal.txt

# Middleware vacío (Next 16 usa proxy.ts en su lugar)
rm -f src/middleware.ts

# Envs sobrantes que NO deben estar en disco. Solo dejamos .env y .env.example.
# Si algún archivo tiene info que querés conservar, copialo antes a un gestor de secretos.
rm -f .env.temp .env2 .env.vercel.production vercel_production.env
# .env.local se mantiene si lo usás localmente — es opt-in.

# Test artifacts trackeados que deberían estar fuera de git (en caso de reaparecer)
rm -rf playwright-report test-results

# Archivos de prueba que el sandbox de Claude pudo haber dejado
rm -f .audit-write-test .audit-bash-write

# Untrackear test artifacts que estaban commiteados antes
git rm --cached -r --quiet --ignore-unmatch playwright-report/ test-results/ || true

echo "→ Stage SELECTIVO (solo cosas de limpieza, NO el código de Sprint 2.B)"
# .gitignore actualizado (cubre patrones que faltaban)
git add .gitignore
# Borrado de middleware.ts vacío (Next 16 usa proxy.ts)
git add -u src/middleware.ts 2>/dev/null || true
# Scripts de auditoría que escribió Claude
git add scripts/audit-phase-2a-cleanup.sh scripts/audit-phase-2b-commit.sh 2>/dev/null || true
# Reportes de auditoría y migración de RLS (van en el commit de limpieza/setup)
git add docs/audits/ 2>/dev/null || true
git add prisma/manual_migrations/20260509_enable_rls_all_public_tables.sql 2>/dev/null || true

echo ""
echo "✅ Limpieza terminada."
echo ""
echo "STAGED para el commit de Sprint 2.A:"
git diff --cached --stat
echo ""
echo "PENDIENTE (queda para Sprint 2.B, lo maneja el otro script):"
git status --short | grep -v "^[AMD] " | head -30
echo ""
echo "Si el staged se ve bien, commiteá con:"
echo "  git commit -m 'chore(audit-2a): limpieza de artefactos + docs de auditoría + migración RLS'"
echo ""
echo "Después corré: bash scripts/audit-phase-2b-commit.sh"
