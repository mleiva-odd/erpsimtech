#!/usr/bin/env bash
# Sprint 3 — Aislamiento multi-tenant en queries Prisma.
# Correr desde la raíz del repo, en la rama de auditoría.
#
#   bash scripts/audit-phase-3-commit.sh
#
# Hace 1 commit con todos los fixes y ofrece pushear a develop directamente
# (porque es donde Vercel deploya).

set -euo pipefail

cd "$(dirname "$0")/.."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != audit/* ]]; then
  echo "ERROR: estás en '$CURRENT_BRANCH'. Cambiate a la rama de auditoría."
  exit 1
fi

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

# Commit único — todos los fixes son del mismo tema (tenant scoping)
git add \
  'src/app/api/dashboard/charts/route.ts' \
  'src/app/api/accounting/banks/[id]/route.ts' \
  'src/app/api/suppliers/[id]/route.ts' \
  'src/app/api/sales/[id]/route.ts' \
  'src/app/api/products/[id]/route.ts' \
  'src/app/api/branches/[id]/route.ts' \
  'src/app/api/purchases/route.ts' \
  'src/app/api/customers/[id]/pay/route.ts' \
  'src/app/api/accounting/receivables/payments/[paymentId]/reverse/route.ts' \
  'src/app/api/accounting/payables/payments/[paymentId]/reverse/route.ts' \
  docs/audits/phase-3-tenant-isolation.md \
  scripts/audit-phase-3-commit.sh \
  2>/dev/null || true

if git diff --cached --quiet; then
  echo "(sin cambios para commitear)"
  exit 0
fi

git commit -m "fix(security): forzar companyId en where de update/delete tenant-scoped

Defensa en profundidad. Todos los update/delete por id en modelos
top-level (Branch, Product, Supplier, Customer, Sale, BankAccount,
SupplierPayable) ahora exigen companyId también en el where, además
del findFirst de pre-validación que ya hacían los handlers.

Convierte una potencial regresión futura (alguien remueve la
validación previa) en un 404 inmediato en vez de un leak silencioso
cross-tenant.

Prisma 6 acepta filtros adicionales en update.where mientras id sea
único. Sub-modelos sin companyId directo (saleItem, productStock,
etc.) quedan validados por transitividad y se cubrirán completamente
con Sprint 2.C.2 (RLS policies con app.tenant_id).

Archivos afectados:
- dashboard/charts: companyId en findMany de products y branches
- accounting/banks/[id]: update + delete con companyId
- suppliers/[id]: update + soft-delete con companyId
- sales/[id]: delete + update CANCEL + customer.update + bankAccount.update
- products/[id]: update + soft-delete + findFirst final
- branches/[id]: update + delete + count de sales
- purchases: productStock con productId explícito + product.update
- customers/[id]/pay: findUnique → findFirst con companyId
- accounting/payments reverse (recv y pay): updates con companyId

Doc: docs/audits/phase-3-tenant-isolation.md"

echo ""
echo "✅ Commit hecho. Para pushear y deploy:"
echo ""
read -r -p "¿Pushear a origin/$CURRENT_BRANCH y mergear a develop? [y/N] " do_push
if [[ "$do_push" != "y" ]]; then
  echo "Nada se pusheó. Hacelo manualmente cuando quieras."
  exit 0
fi

git push origin "$CURRENT_BRANCH"
echo "  ✓ pushed audit branch"

git checkout develop
git pull origin develop
git merge "$CURRENT_BRANCH" --no-ff -m "Merge audit phase-3: tenant scoping en queries"
git push origin develop
echo "  ✓ merged y pushed develop — Vercel está deployando"

git checkout "$CURRENT_BRANCH"
echo ""
echo "Deploy en marcha. Verificá en vercel.com → Deployments."
