# Fase 3 — Aislamiento multi-tenant (defensa en profundidad en queries)

**Branch:** `audit/phase-1-security-readonly` (continuación de Sprint 2).
**Estado:** Primera tanda aplicada — 10 archivos, ~30 queries fortalecidas.

## Contexto y modelo de amenaza

Toda la app es multi-tenant por `companyId`. Los handlers usan `requireTenant`/`requirePermission`/`requireOperationalPermission` que devuelven `tenant.companyId`, y de ahí en adelante depende del autor del handler filtrar correctamente cada query por `companyId`.

**Riesgo concreto:** un atacante autenticado en empresa A con un UUID conocido (o adivinado) de empresa B podía:
- Modificar registros de B con `update({ where: { id } })`.
- Borrar registros de B con `delete({ where: { id } })`.
- Leer detalles de B con `findUnique({ where: { id } })` aún si la respuesta tiene scope.

El patrón seguro: **siempre incluir `companyId` en el where de `update`/`delete`/`findFirst` cuando el modelo tiene la columna**, incluso después de validar pertenencia con un `findFirst` previo. Esto convierte cualquier regresión futura (alguien remueve la validación) en error inmediato (404) en lugar de leak silencioso.

Prisma 6 soporta filtros adicionales en `update.where`/`delete.where` mientras `id` siga siendo único.

## Fixes aplicados (10 archivos)

### Críticos — endpoints donde el `where` no traía `companyId` y la validación previa era el único guardián

- **`src/app/api/dashboard/charts/route.ts`** — `prisma.product.findMany({ where: { id: { in: productIds } } })` y misma forma para branches: agregado `companyId: tenant.companyId`.
- **`src/app/api/accounting/banks/[id]/route.ts`** — `bankAccount.update` y `bankAccount.delete` por id: agregado `companyId`.
- **`src/app/api/suppliers/[id]/route.ts`** — `supplier.update` (PUT y soft-delete): agregado `companyId`.
- **`src/app/api/sales/[id]/route.ts`** — `sale.delete`, `sale.update` (en CANCEL), y todas las llamadas internas a `customer.update` y `bankAccount.update` dentro del flujo de anulación: agregado `companyId`.
- **`src/app/api/products/[id]/route.ts`** — `product.update` y soft-delete: agregado `companyId`. `tx.product.findUnique` final reemplazado por `findFirst` con scope.
- **`src/app/api/branches/[id]/route.ts`** — `branch.update`, `branch.delete`, y `sale.count` por branch: scope completo.

### Defensa en profundidad — pre-validación correcta pero `where` débil

- **`src/app/api/customers/[id]/pay/route.ts`** — `findUnique` reemplazado por `findFirst` con `companyId`.
- **`src/app/api/accounting/receivables/payments/[paymentId]/reverse/route.ts`** — `customer.update` y `bankAccount.update` ahora exigen `companyId`.
- **`src/app/api/accounting/payables/payments/[paymentId]/reverse/route.ts`** — `supplierPayable.update` y `bankAccount.update` con `companyId`.

### Mejora de specificity (no es leak pero ayuda)

- **`src/app/api/purchases/route.ts`** — `productStock.findFirst` ahora incluye `productId` además de `variantId` para que el match sea exacto. `product.update` para persistir costo: agregado `companyId`.

## Pendiente (siguientes iteraciones de Fase 3)

Sub-modelos sin `companyId` directo (heredan via relación). En Prisma, no se pueden filtrar con `companyId` en `update.where` directamente. Opciones:

1. **Validar pertenencia previa con `findFirst` que incluya la relación filtrada** — patrón actual en la mayoría de endpoints.
2. **Migrar los sub-modelos para que tengan `companyId` denormalizado** — más rápido en queries, requiere migración + triggers o lógica de inserción.
3. **Activar Prisma Client Extension que inyecte filtros automáticamente** — solución elegante pero invasiva (Sprint 2.C.2).
4. **Activar policies RLS finas con `app.tenant_id` y un role no-owner para Prisma** — defensa real en la DB, no en la app (Sprint 2.C.2).

Modelos sub a auditar más a fondo: `ProductVariant`, `ProductStock`, `Payment`, `SaleItem`, `SaleReturnItem`, `CashRegister`, `CashRegisterTransaction`, `BankTransaction`, `SupplierPayment`, `AccountPayment`, `StockTransferItem`, `DeliveryNoteItem`, `PurchaseOrderItem`, `Employee`, `Payroll`, `PayrollItem`, `Attendance`, `LeaveRequest`, `UserBranchAccess`, `SessionLog`, `LoginAttempt`.

## Próximos pasos sugeridos

1. **Tests e2e cross-tenant** (Sprint 5): crear 2 empresas demo, intentar acceder a recursos de una desde otra. Cada test que pase con 403/404 valida un fix.
2. **Sprint 2.C.2**: el approach DB-side con policies + role no-owner cubre TODOS los sub-modelos automáticamente, sin tener que auditar cada query.
3. **Lint rule personalizada**: detectar `prisma.X.update({ where: { id } })` en modelos top-level y advertir si no incluye `companyId`. Implementable con eslint custom.

## Cómo verificar después del deploy

Si tenés acceso a otra empresa demo (creá una temporalmente con `npm run seed` con env vars distintas), intentá:

```bash
# Loguéate como user de empresa A. Sacá un id de un producto/cliente/banco de A.
# Después intentá editarlo desde el endpoint pasando un id de empresa B.
# Esperás 404 / 'no encontrado' en todos los casos.
```

O esperá a Sprint 5 para tests automatizados.
