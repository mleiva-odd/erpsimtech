# Fase 11 · Auditoría ERP por módulo + Fase 12 · Implementación de gaps

Documento generado tras la auditoría exhaustiva de cada módulo del ERP
buscando feature parity con un ERP "completo" para PYMES guatemaltecas.

## Resumen ejecutivo

- **Módulos auditados:** Inventario, Compras, Ventas, Caja, Clientes,
  Proveedores, RRHH, Finanzas, Reportes, Categorías, Configuración.
- **Hallazgos críticos:** 12 endpoints con validación insuficiente
  (sin Zod), 8 acciones del ciclo de vida sin implementar (anular
  compra, aprobar/rechazar permisos, baja de empleado, etc.), 6
  reportes gerenciales faltantes que requerían armado manual en Excel.
- **Estado post-implementación:** 100% de gaps críticos cerrados,
  lint limpio (0 errores, 0 warnings) y tsc sin errores.

## Gaps detectados y resueltos

### 1. Categorías

**Antes:** sólo POST y GET, sin endpoint para editar/eliminar.

**Implementado:**
- `PUT /api/categories/[id]` — actualización con Zod + tenant scoping.
- `DELETE /api/categories/[id]` — refuerza FK; rechaza con HTTP 409
  si la categoría tiene productos asociados.

### 2. Compras

**Antes:** validación con `isPositiveNumber()` casero, sin transacción
para anular y sin reversa de stock.

**Implementado:**
- POST migrado a `PurchaseItemSchema` / `CreatePurchaseSchema` (Zod) y
  `handleApiError`.
- `GET /api/purchases/[id]` — detalle con includes de proveedor,
  usuario, items y variantes.
- `PATCH /api/purchases/[id]` — anula la compra completada con state
  machine estricta:
  - solo se anula si `status === 'COMPLETED'`,
  - rechaza si hay `SupplierPayment` ya cobrado,
  - reversa stock con `updateMany({ where: { quantity: { gte: x } } })`
    + `count === 1` (rechaza si quedaría negativo),
  - elimina el `SupplierPayable`,
  - crea asiento contable de tipo `INCOME` "Reversa de Compras",
  - registra audit log con acción `PURCHASE_CANCELLED`.

### 3. RRHH · Empleados

**Antes:** sólo POST y GET, sin endpoints `[id]`, sin Zod.

**Implementado:**
- POST/GET migrados a `CreateEmployeeSchema` (Zod) + validación de
  branch/userId pertenecientes al tenant + verificación de unicidad de
  `userId` (Employee.userId es `@unique`).
- `GET /api/hr/employees/[id]` — detalle.
- `PUT /api/hr/employees/[id]` — actualización parcial con
  `UpdateEmployeeSchema` y validaciones de relación.
- `DELETE /api/hr/employees/[id]` — soft delete (`active=false` +
  `terminationDate=now`) que conserva históricos de payroll/asistencia.

### 4. RRHH · Asistencia

**Antes:** POST sin validación, parseaba fechas a mano.

**Implementado:**
- `AttendanceSchema` con enum `PRESENT/ABSENT/LATE/HOLIDAY`.
- Verifica que el empleado pertenezca al tenant.
- Valida que `checkOut > checkIn` cuando ambos vienen.
- Upsert por (employeeId, día) con manejo correcto de zona horaria.

### 5. RRHH · Permisos / Licencias

**Antes:** sólo POST/GET; no había forma de aprobar/rechazar.

**Implementado:**
- `GET /api/hr/leaves/[id]` — detalle.
- `PATCH /api/hr/leaves/[id]` — aprueba o rechaza:
  - solo permite transición desde `PENDING`,
  - registra `approvedById = userId`,
  - audit log `LEAVE_APPROVED` / `LEAVE_REJECTED`.
- `DELETE /api/hr/leaves/[id]` — solo si está `PENDING`; las
  aprobadas/rechazadas quedan como histórico.

### 6. Proveedores

**Antes:** PUT sin Zod; ambos handlers devolvían "Error interno"
genérico sin pasar por `handleApiError`.

**Implementado:**
- `UpdateSupplierSchema` con todos los campos opcionales.
- DELETE rechaza si el proveedor ya está inactivo.
- Manejo de errores unificado.

### 7. Reportes gerenciales (nuevos)

Estos reportes faltaban por completo y los dueños tenían que
armarlos a mano en Excel:

| Endpoint | Propósito |
|---|---|
| `GET /api/reports/customers/top` | Ranking de clientes por monto facturado (cuentas estratégicas). |
| `GET /api/reports/suppliers/top` | Ranking de proveedores por monto comprado (negociación + concentración de riesgo). |
| `GET /api/reports/sales/by-user` | Ventas por vendedor con margen y ticket promedio (comisiones). |
| `GET /api/reports/inventory/kardex` | Histórico de movimientos por producto (compras, ventas, ajustes, transferencias, devoluciones) con saldo running. |
| `GET /api/reports/inventory/slow-movers` | Productos con stock > 0 sin movimiento en N días, ordenados por capital en riesgo. |
| `GET /api/reports/accounting/profit-loss` | Estado de Resultados del período: ventas brutas/netas, COGS, margen bruto, ingresos/egresos por categoría, utilidad neta. |

Todos los reportes:
- Respetan `requirePermission('reports:view')`.
- Soportan filtros de rango (`from`/`to`) y `branchId`.
- Usan `requireBranchAccess` para usuarios sin acceso multi-sucursal.
- Devuelven JSON estructurado con `periodo`/`resumen`/`ranking`.

### 8. Caja

**Antes:** sólo se podía ver el turno activo. No había histórico para
managers.

**Implementado:**
- `GET /api/cash-register/history` — turnos cerrados con paginación,
  filtros por sucursal/usuario/rango de fechas, ventas totales del
  turno, breakdown por método de pago (CASH/CARD/TRANSFER/etc.) y
  conteos de transacciones/abonos.

### 9. Audit log

**Antes:** type `AuditAction` no tenía acciones para HR ni para anular
compra (se reusaba `STOCK_TRANSFER_CANCELLED` por error).

**Implementado:** se agregaron las acciones:
- `LEAVE_APPROVED`
- `LEAVE_REJECTED`
- `EMPLOYEE_CREATED`
- `EMPLOYEE_UPDATED`
- `EMPLOYEE_DEACTIVATED`
- `PURCHASE_CANCELLED`

## Validación post-implementación

```bash
npx tsc --noEmit       # exit 0
npx eslint .           # 0 errores, 0 warnings
```

## Tareas que quedan fuera de esta fase

- **Fase 7 · SaaS billing con Stripe** — pendiente, requiere acción del
  dueño (cuenta Stripe, pricing en USD/GTQ, webhooks).
- **Fase 8 · FEL Guatemala (Infile/Digifact)** — pendiente, requiere
  contratación con certificador y configuración de NIT emisor.
- **Fase 2.C.3 · CSP con nonces** — diferida; requiere
  `await connection()` en el root layout para que las páginas estáticas
  no rompan al cargar nonce dinámico.

## Archivos creados / modificados

```
src/app/api/categories/[id]/route.ts                 (nuevo)
src/app/api/purchases/route.ts                       (Zod + handleApiError)
src/app/api/purchases/[id]/route.ts                  (nuevo)
src/app/api/hr/employees/route.ts                    (Zod + validaciones)
src/app/api/hr/employees/[id]/route.ts               (nuevo)
src/app/api/hr/attendance/route.ts                   (Zod)
src/app/api/hr/leaves/[id]/route.ts                  (nuevo)
src/app/api/suppliers/[id]/route.ts                  (Zod)
src/app/api/reports/customers/top/route.ts           (nuevo)
src/app/api/reports/suppliers/top/route.ts           (nuevo)
src/app/api/reports/sales/by-user/route.ts           (nuevo)
src/app/api/reports/inventory/kardex/route.ts        (nuevo)
src/app/api/reports/inventory/slow-movers/route.ts   (nuevo)
src/app/api/reports/accounting/profit-loss/route.ts  (nuevo)
src/app/api/cash-register/history/route.ts           (nuevo)
src/lib/audit.ts                                     (+6 audit actions)
docs/audits/phase-11-erp-completeness.md             (este documento)
```

## Comandos para integrar a `main`

Cuando el dueño quiera promover este trabajo:

```bash
git status
git add -A
git commit -m "feat(erp): cerrar gaps de módulos + reportes gerenciales

- Categorías: PUT/DELETE con FK guard
- Compras: anulación con reversa de stock + asiento contable
- RRHH: empleados/asistencia/permisos completos con Zod + audit
- Proveedores: PUT con Zod
- Reportes nuevos: top clientes/proveedores, ventas por vendedor,
  kardex, slow movers, P&L
- Caja: histórico de turnos con breakdown por método de pago
- Audit log: 6 acciones nuevas para HR y compras"
git push origin <rama>
```
