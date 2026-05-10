#!/usr/bin/env bash
# Audit Sprint 2.C.2/2.C.3 + Phase 4/5 — Commit final y push.
#
# Correr desde la raíz del repo, en la rama de auditoría.
#
#   bash scripts/audit-final-push.sh
#
# Que hace:
# 1. Limpia el archivo .test-perm que Claude no pudo borrar desde su sandbox.
# 2. Corre typecheck + lint + build para validación final.
# 3. Commits separados por tema (4 commits limpios).
# 4. Pushea a origin/audit/phase-1-security-readonly.
# 5. Mergea automáticamente a develop y pushea (Vercel deploya).

set -euo pipefail

cd "$(dirname "$0")/.."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != audit/* ]]; then
  echo "ERROR: estás en '$CURRENT_BRANCH'. Cambiá a la rama de auditoría primero."
  exit 1
fi

# ── 0. Limpieza ──
echo "→ Limpiando .test-perm (residuo del sandbox)"
rm -f .test-perm

# ── 1. Validación full ──
echo ""
echo "→ Validando typecheck"
if ! npm run typecheck >/tmp/audit-final-tc.log 2>&1; then
  echo "ERROR: typecheck falló."
  tail -60 /tmp/audit-final-tc.log
  exit 1
fi
echo "  ✓ typecheck"

echo "→ Validando lint"
if ! npm run lint >/tmp/audit-final-lint.log 2>&1; then
  echo "WARN: lint reportó problemas:"
  tail -40 /tmp/audit-final-lint.log
  read -r -p "¿Continuar? [y/N] " ok
  if [[ "$ok" != "y" ]]; then exit 1; fi
fi
echo "  ✓ lint"

echo "→ Build de Next (puede tardar 1-3 min)"
if ! npm run build >/tmp/audit-final-build.log 2>&1; then
  echo "ERROR: build falló. Tail:"
  tail -60 /tmp/audit-final-build.log
  exit 1
fi
echo "  ✓ build"

# ── 2. Commits temáticos ──

# Commit 1 — CSP con nonces (Sprint 2.C.3)
git add src/proxy.ts next.config.ts
if ! git diff --cached --quiet; then
  git commit -m "feat(csp): nonces por request en script-src (Sprint 2.C.3)

proxy.ts ahora genera un nonce único por request, lo expone en x-nonce
y lo incluye en script-src 'self' 'nonce-...' 'strict-dynamic'. Esto
cierra el 'unsafe-inline' que metimos como hotfix anterior y mantiene
todas las páginas dinámicamente renderizadas (lo que ya hacíamos por
NextAuth). Estilos siguen con 'unsafe-inline' por Tailwind/recharts.

next.config.ts ya no setea CSP estática (se delega al proxy). Mantiene
HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy. poweredByHeader=false sigue activo."
fi

# Commit 2 — Policies RLS por tenant (Sprint 2.C.2)
git add \
  prisma/manual_migrations/20260509_add_tenant_isolation_policies.sql \
  src/lib/tenant-prisma.ts \
  docs/audits/phase-2c2-rls-policies.md
if ! git diff --cached --quiet; then
  git commit -m "feat(rls): policies de aislamiento por tenant (Sprint 2.C.2, dormante)

Aplicado en Supabase via MCP. 39 tablas tienen ahora una policy
tenant_isolation que filtra por current_setting('app.tenant_id', true)
para top-level (companyId directo) o por subquery EXISTS para sub-models
(SaleItem, ProductStock, Payment, etc.).

Estado: DORMANTE. postgres (owner del schema, role usado por Prisma)
bypassea RLS por default. service_role tiene BYPASSRLS. anon/authenticated
sin app.tenant_id seteado siguen viendo 0 filas (deny seguro). La app
productiva no cambia comportamiento.

Activación futura: crear role app_user, rotar DATABASE_URL en Vercel y
migrar handlers a usar forTenant(companyId).withTx(...). El runbook
está en docs/audits/phase-2c2-rls-policies.md.

Verificación post-aplicación:
  - postgres: ve todas las companies (sin cambio)
  - anon sin tenant_id: ve 0 (sin cambio respecto a deny-all anterior)
  - anon con app.tenant_id='X': ve solo lo de X (aislamiento real)

Archivos:
- prisma/manual_migrations/20260509_*.sql: SQL aplicado (referencia)
- src/lib/tenant-prisma.ts: forTenant() listo para activación futura
- docs/audits/phase-2c2-rls-policies.md: runbook completo"
fi

# Commit 3 — Handler uniforme de errores API (Phase 4)
git add src/lib/api-error.ts
if ! git diff --cached --quiet; then
  git commit -m "feat(api): handler uniforme de errores con mapeo de Prisma (Phase 4)

src/lib/api-error.ts expone:
- ApiError(status, message, details?) para cortar handlers con HTTP especifico
- handleApiError(error, requestPath?) que mapea ZodError → 400, ApiError → su
  status, Prisma P2002 → 409 (uniqueness), P2025 → 404 (not found),
  P2003/P2014 → 409 (FK / required relation), Prisma validation → 500,
  cualquier otro → 500 genérico

Mensajes al cliente NO filtran detalles técnicos (no nombres de constraints
crudos, no stack traces). Logueo a console con prefijo [api <path>] para
investigar sin exponer al usuario.

No se aplicó masivamente a todos los endpoints — adopción incremental.
Nuevos endpoints o reescrituras deben usar handleApiError en su catch."
fi

# Commit 4 — Lint cleanup (Phase 5)
git add scripts/create-restricted-company.ts scripts/diagnose-db.ts
if ! git diff --cached --quiet; then
  git commit -m "chore(lint): cleanup de warnings (Phase 5)

- create-restricted-company.ts: prefijo _ en variable user no usada,
  con void _user para confirmar al lector que es intencional.
- diagnose-db.ts: \$queryRaw<Array<{...}>> en vez de any[].

eslint . termina sin errores ni warnings ahora."
fi

# Commit 5 — script de commit (autocomentado)
git add scripts/audit-final-push.sh 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "chore(audit-final): script de commit y deploy"
fi

echo ""
echo "→ Resumen de commits nuevos:"
git log --oneline origin/$CURRENT_BRANCH..HEAD 2>/dev/null || git log --oneline -10

# ── 3. Push y merge a develop ──
echo ""
read -r -p "¿Pushear a origin/$CURRENT_BRANCH y mergear a develop? [y/N] " do_push
if [[ "$do_push" != "y" ]]; then
  echo "Listo localmente. Cuando quieras pushear: git push origin $CURRENT_BRANCH"
  exit 0
fi

git push origin "$CURRENT_BRANCH"
echo "  ✓ pushed audit branch"

git checkout develop
git pull origin develop
git merge "$CURRENT_BRANCH" --no-ff -m "Merge audit Sprint 2.C.2/2.C.3 + Phase 4/5"
git push origin develop
echo "  ✓ merged y pushed develop — Vercel deploya en ~1-2 min"

git checkout "$CURRENT_BRANCH"
echo ""
echo "Estado: deploy en marcha. Verificá vercel.com → Deployments."
echo ""
echo "Después del deploy, validar que la app sigue funcionando:"
echo "  1. Login en producción"
echo "  2. Navegar /dashboard, /pos, /sales"
echo "  3. curl -I https://erp.simtechgt.com/login (debería seguir CSP nonce visible)"
echo "  4. Hacer una venta de prueba"
