#!/usr/bin/env bash
# Sesión de cierre — verificación externa, fixes adicionales, observabilidad,
# preparación de role app_user, manuales, CI.
#
#   bash scripts/audit-extras-push.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# Limpieza preventiva del lock que el sandbox de Claude pudo dejar.
rm -f .git/index.lock

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != audit/* ]]; then
  echo "ERROR: estás en '$CURRENT_BRANCH'. Cambiá a la rama de auditoría."
  exit 1
fi

# ── Validación ──
echo "→ typecheck"
if ! npm run typecheck >/tmp/audit-extras-tc.log 2>&1; then
  echo "ERROR: typecheck falló."
  tail -40 /tmp/audit-extras-tc.log
  exit 1
fi
echo "  ✓"

echo "→ lint"
if ! npm run lint >/tmp/audit-extras-lint.log 2>&1; then
  echo "WARN lint:"
  tail -20 /tmp/audit-extras-lint.log
  read -r -p "¿Continuar? [y/N] " ok
  [[ "$ok" == "y" ]] || exit 1
fi
echo "  ✓"

echo "→ build"
if ! npm run build >/tmp/audit-extras-build.log 2>&1; then
  echo "ERROR: build falló."
  tail -60 /tmp/audit-extras-build.log
  exit 1
fi
echo "  ✓"

# ── Commits temáticos ──

# 1. Logger + observability
git add src/lib/logger.ts src/lib/observability.ts
if ! git diff --cached --quiet; then
  git commit -m "feat(observability): logger estructurado + capa Sentry-ready

src/lib/logger.ts: logger sin deps externas. JSON line en prod,
texto legible en dev. Redacción automática de password/token/apikey/etc.

src/lib/observability.ts: capa stub de captureException/captureMessage
que hoy loguea a console y mañana se conecta a Sentry con un solo
'npm install @sentry/nextjs' y SENTRY_DSN env var. Permite que el
código ya use observabilidad sin atarse al vendor desde el día 1."
fi

# 2. Permission catalog (whitelist de permisos validables)
git add src/lib/permission-catalog.ts
if ! git diff --cached --quiet; then
  git commit -m "feat(authz): catálogo de permisos válidos centralizado

src/lib/permission-catalog.ts: lista canónica de permisos que un
custom role puede tener. Helpers isValidPermission() y
partitionPermissions() para validación.

Sin esto, un admin podía crear un rol con permisos arbitrarios
(p.ej. 'system:dropAllTables') que un futuro check mal escrito
podría aceptar. Ahora los endpoints de roles validan contra esta
whitelist."
fi

# 3. Fixes de Zod en endpoints encontrados por el subagente
git add \
  src/app/api/admin/system/cleanup/route.ts \
  src/app/api/notifications/route.ts \
  src/app/api/hr/leaves/route.ts \
  src/app/api/settings/roles/route.ts \
  src/app/api/accounting/banks/route.ts \
  src/app/api/accounting/categories/route.ts
if ! git diff --cached --quiet; then
  git commit -m "fix(security): Zod en endpoints que la auditoría inicial pasó por alto

Endpoints que parseaban req.json() sin validación encontrados por
revisión externa (subagente):
- admin/system/cleanup: días con rango 30-3650, types con enum.
- notifications PUT: id como uuid opcional.
- hr/leaves: schema completo + verificación de pertenencia del
  empleado al tenant antes de crear el leave (era un IDOR potencial).
- settings/roles: permissions validado contra VALID_PERMISSIONS,
  prevención de escalación a admin:all sin tener settings:manage.
- accounting/banks: type validado contra enum AccountType.
- accounting/categories: name trim + type enum INCOME|EXPENSE.

Todos usan handleApiError() para respuestas uniformes."
fi

# 4. Cleanup de logs verbosos en upload
git add src/app/api/upload/route.ts
if ! git diff --cached --quiet; then
  git commit -m "fix(upload): no loguear objetos enteros de Supabase

Loguear objetos completos puede filtrar headers/keys internas en
logs de Vercel. Ahora se loguea solo error.message."
fi

# 5. Asiento contable DENTRO de la transacción de venta (Phase 4 M-1)
git add src/app/api/sales/route.ts
if ! git diff --cached --quiet; then
  git commit -m "fix(sales): asiento contable dentro de \$transaction de venta

Antes createAccountingEntryAsync corría DESPUÉS del commit de la
venta. Si la lambda terminaba antes de que la promesa resolviera,
la venta quedaba registrada sin asiento contable (inconsistencia
para reportes financieros).

Movida adentro del \$transaction usando createAccountingEntry (sync).
Si el asiento falla, la venta entera se rollbackea — comportamiento
contable correcto: una venta sin asiento es estado inválido."
fi

# 6. CI workflow (Phase 9)
git add .github/workflows/ci.yml
if ! git diff --cached --quiet; then
  git commit -m "ci: GitHub Actions con lint, typecheck, build, prisma validate

.github/workflows/ci.yml. Jobs: lint-typecheck (rápido) → build (con
env stubs). Job e2e comentado, listo para activar cuando la infra
de testing esté estable. Concurrency cancela runs viejos."
fi

# 7. Tests E2E cross-tenant + README (Phase 5 ampliado)
git add e2e/multi-tenant-isolation.spec.ts e2e/README.md
if ! git diff --cached --quiet; then
  git commit -m "test(e2e): aislamiento cross-tenant + README de setup

Tests Playwright que validan IDOR multi-tenant: un user de A NO
puede ver/editar/borrar customers/products de B vía API.

Skipean si no hay env vars E2E_TENANT_*_EMAIL/PASSWORD para no
romper CI. e2e/README.md tiene el setup completo (Postgres local,
segunda empresa, capturar UUIDs target, env vars)."
fi

# 8. Manuales (Phase 10)
git add docs/manuales/
if ! git diff --cached --quiet; then
  git commit -m "docs: manuales de cliente, cajero, admin de empresa, runbook ops

01-onboarding-cliente.md: alta de empresa nueva desde super admin.
02-manual-administrador-empresa.md: guía del admin titular.
03-manual-cajero.md: día a día del operador POS.
04-runbook-operaciones.md: para Marvin como operador SaaS, con
respuesta a incidentes, vars de entorno, migraciones de DB."
fi

# 9. Audit Phase 4 + role app_user dormante (RLS prep)
git add \
  docs/audits/phase-4-transactions-review.md \
  prisma/manual_migrations/20260509_create_app_user_role_dormant.sql
if ! git diff --cached --quiet; then
  git commit -m "docs+migration: review Phase 4 + role app_user dormante

phase-4-transactions-review.md: audit del uso de \$transaction en
22 endpoints (cobertura buena, hallazgos menores documentados).

20260509_create_app_user_role_dormant.sql: aplicado en Supabase via
MCP. Crea role app_user con NOLOGIN y grants mínimos (SELECT/INSERT/
UPDATE/DELETE en public + USAGE en sequences). Dormante hasta que
se decida activar (ALTER ROLE app_user LOGIN PASSWORD 'X' + rotar
DATABASE_URL en Vercel). Cuando se active, las policies RLS
tenant_isolation aplicarán automáticamente."
fi

# 10. Script de commit
git add scripts/audit-extras-push.sh
if ! git diff --cached --quiet; then
  git commit -m "chore(audit-extras): script de commit y deploy"
fi

# ── Resumen y push ──
echo ""
echo "→ Resumen:"
git log --oneline origin/$CURRENT_BRANCH..HEAD 2>/dev/null || git log --oneline -10

read -r -p "¿Pushear a origin/$CURRENT_BRANCH y mergear a develop? [y/N] " do_push
if [[ "$do_push" != "y" ]]; then
  echo "Listo localmente. Cuando quieras pushear:"
  echo "  git push origin $CURRENT_BRANCH"
  exit 0
fi

git push origin "$CURRENT_BRANCH"
echo "  ✓ pushed audit branch"

git checkout develop
git pull origin develop
git merge "$CURRENT_BRANCH" --no-ff -m "Merge audit-extras: external review fixes + observability + manuales + role app_user prep"
git push origin develop
echo "  ✓ pushed develop"

git checkout "$CURRENT_BRANCH"
echo ""
echo "Vercel deploya en ~1-2 min. Después validar:"
echo "  - Login funciona."
echo "  - Una venta de prueba crea su asiento contable correctamente."
echo "  - GitHub Actions corre y pasa en el push."
