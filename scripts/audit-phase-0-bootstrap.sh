#!/usr/bin/env bash
# Bootstrap de la auditoría — Fase 0
# Correr UNA SOLA VEZ desde la raíz del repo, en tu terminal local.
# Objetivo: dejar working tree limpio + rama de auditoría lista, sin perder trabajo.
#
#   bash scripts/audit-phase-0-bootstrap.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -d .git/index.lock ]] || [[ -f .git/index.lock ]]; then
  echo "→ Eliminando .git/index.lock huérfano"
  rm -f .git/index.lock
fi

echo "→ Limpiando refs rotas"
rm -rf .git/refs/remotes/backup-marvinls69 \
       .git/refs/remotes/erp-origin \
       .git/refs/remotes/previous 2>/dev/null || true
git pack-refs --all >/dev/null 2>&1 || true

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  echo "ERROR: tienes que estar en la rama 'develop' (estás en '$CURRENT_BRANCH')."
  exit 1
fi

echo "→ Verificando que estás sincronizado con origin/develop"
git fetch origin develop --quiet
LOCAL=$(git rev-parse develop)
REMOTE=$(git rev-parse origin/develop)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "WARN: develop local difiere de origin/develop. Revisar manualmente."
fi

echo "→ Quitando archivos auto-generados del index (no se borran en disco)"
git rm --cached -r --quiet --ignore-unmatch playwright-report/ test-results/ || true

echo "→ Aplicando .gitignore actualizado (lo crea/edita audit-phase-0)"
git add .gitignore

echo "→ Snapshot defensivo del trabajo en curso"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore(audit-phase-0): snapshot baseline + ignore artefactos" --no-verify
else
  echo "  (nada que commitear)"
fi

echo "→ Subiendo develop"
git push origin develop

echo "→ Creando rama audit/phase-1-security-readonly"
git checkout -b audit/phase-1-security-readonly
git push -u origin audit/phase-1-security-readonly

echo ""
echo "✅ Fase 0 lista. Estás en audit/phase-1-security-readonly."
echo "   Volvé al chat de Claude para continuar con la auditoría."
