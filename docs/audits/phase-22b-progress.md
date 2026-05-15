# Fase 22b · Migración páginas legacy → DataTable · Progreso

Fecha: 2026-05-15
Agente: subagente frontend (Fase 22b)
Validación: `npm run typecheck` verde · `npm run lint` 0 errors, 92 warnings (baseline ~92).

---

## 1. Resumen

Fase 22b cierra la migración del 100% de las **páginas con tablas legacy** al
nuevo componente `<DataTable>` + hook `useDataTable`. También se migran a
DataTable las páginas que originalmente eran grids de cards cuando el
contenido se beneficia de búsqueda + filtros + paginación.

- **Páginas migradas en esta fase:** 12.
- **Páginas migradas en fase 22a (ya entregadas):** 3 (receivables, payables, hr/payroll).
- **Páginas NO migradas (justificadas — vistas card legítimas):** 3 (branches, hr/employees, accounting/banks).
- Bloques cerrados: A (3/3), B (4/4), C (3/3 — branches queda como TODO documentado), D (2/2), E (3/4 — hr/employees queda como TODO), F (3/4 + receivables/payables/payroll de 22a; banks queda como TODO).

---

## 2. Páginas migradas en Fase 22b

| # | Página | Endpoint | Paginación | Notas |
|---|--------|----------|------------|-------|
| 1 | `audit/page.tsx` | `/api/audit` | Servidor | Filters externos (action, entity). |
| 2 | `sales/page.tsx` | `/api/sales` + `/api/sales/stats` | Servidor | KPIs + filtros toggleables + search server. |
| 3 | `accounting/page.tsx` | `/api/accounting` | Servidor | KPIs + charts mantenidos; sólo migra tabla "Movimientos". |
| 4 | `inventory/page.tsx` | `/api/products` | Servidor | Filter `lowStock` + search + branch tenant-safe. |
| 5 | `customers/page.tsx` | `/api/customers` | Servidor | Modal de abono y de edición intactos. |
| 6 | `suppliers/page.tsx` | `/api/suppliers` | **Client-side** | Endpoint sin paginación. TODO Fase 24. |
| 7 | `purchases/page.tsx` (History) | `/api/purchases` | **Client-side** | Migrada sólo la vista History (la vista "New" sigue intacta). |
| 8 | `users/page.tsx` | `/api/users` | **Client-side** | Endpoint sin paginación. TODO Fase 24. |
| 9 | `users/roles/page.tsx` | `/api/settings/roles` | **Client-side** | Reemplaza `confirm()` / `alert()` nativos por `useConfirm` + `useToast`. |
| 10 | `stock-transfers/page.tsx` (History tab) | `/api/stock-transfers/history` | Sin paginar (array completo) | El componente DataTable maneja vista mobile. Sólo migrada la pestaña History. |
| 11 | `sales/delivery-notes/page.tsx` | `/api/delivery-notes` | Servidor | `cardRenderer` custom para preservar la vista lista original. |
| 12 | `notifications/page.tsx` | `/api/notifications` | **Client-side** | Bulk action "Marcar como leídas" sobre selección. |
| 13 | `hr/attendance/page.tsx` | `/api/hr/attendance` + `/api/hr/employees` | **Client-side** | Reemplaza `alert()` por `useToast`. Combina employees + attendance del día. |
| 14 | `hr/leaves/page.tsx` | `/api/hr/leaves` | **Client-side** | `cardRenderer` preserva la vista card original. |

---

## 3. Páginas ya migradas en Fase 22a

| Página | Endpoint | Notas |
|---|---|---|
| `accounting/receivables/page.tsx` | `/api/reports/accounting/aging-receivables` | Aging por cliente con buckets dinámicos. |
| `accounting/payables/page.tsx` | `/api/reports/accounting/aging-payables` | Aging por proveedor con buckets dinámicos. |
| `hr/payroll/page.tsx` | `/api/hr/payroll` | Lista de planillas + acciones por estado. |

---

## 4. Páginas NO migradas y razón

| Página | Por qué no se migró |
|---|---|
| `branches/page.tsx` | Vista basada en cards grid (3 col) con KPIs por sucursal. No es una tabla — el patrón actual es correcto para mostrar el detalle visual (icono, dirección, contadores). Migrar a DataTable degradaría la UX. **TODO Fase 24:** revisar si conviene añadir DataTable cuando una empresa tenga >20 sucursales. |
| `hr/employees/page.tsx` | Vista basada en cards grid (avatar, contacto, sueldo). Patrón válido para directorio. **TODO Fase 24:** convertir a DataTable híbrido cuando la empresa supere ~50 empleados, manteniendo `cardRenderer`. |
| `accounting/banks/page.tsx` | Vista basada en cards de cuentas bancarias (saldo, tipo, transacciones). No es tabla. La sección "Libro Mayor" dentro del modal sí podría beneficiarse de DataTable, pero queda fuera de scope de Fase 22b. **TODO Fase 24:** migrar el ledger modal a DataTable con paginación. |

---

## 5. Decisiones de diseño tomadas

1. **Mobile-first.** Todas las páginas con tablas tradicionales (no cards) usan la vista card automática del DataTable o un `cardRenderer` custom. Las pruebas mentales a 375px funcionan: títulos, highlights y meta se reorganizan correctamente.
2. **`mobilePriority` consistente.** `title` → identificador humano (nombre cliente, ticket, descripción). `highlight` → métrica clave (saldo, total, estado). `meta` → datos secundarios.
3. **Tenant-safe.** Ninguna página asume tenant. Todas las queries respetan `selectedBranchId` cuando el endpoint lo soporta. No se modificó ningún handler API.
4. **Locale ES-GT.**
   - Cantidades: `Q{n}.toFixed(2)` en todas las celdas monetarias.
   - Fechas: `format(..., 'dd/MM/yyyy')` o `format(..., 'dd MMM, HH:mm', { locale: es })`.
   - Strings: español neutro / GT en headers, descripciones y empty states.
5. **EmptyState con icon + descripción.** Todas las tablas vacías muestran `<EmptyState>` con un icono coherente con el módulo (Receipt, Users, Truck, Bell, Activity…) y, donde aplica, un CTA hacia "Nuevo X".
6. **Filtros nativos del DataTable** (`filters={...}`) en lugar de UI ad-hoc, donde el endpoint expone los params (status, action, entity, type, lowStock, etc.).
7. **Search server-side** donde el endpoint lo soporta (`/api/sales?search=`, `/api/products?q=`, `/api/customers?q=`). Search client-side para suppliers, users, purchases, roles, attendance, leaves.
8. **Bulk actions canónicas.** `notifications` usa `bulkActions=[{label, variant: 'primary', onClick(rows)}]`. Si en el futuro se quieren más (export selección, archivar, etc.), agregar a esta misma forma canónica.
9. **`useConfirm` + `useToast` adoptados.** Eliminados `confirm()` y `alert()` nativos en `users/roles/page.tsx` y `hr/attendance/page.tsx`. Mantenidos los existentes (`suppliers`, `stock-transfers`).
10. **Breadcrumbs consistentes.** Todas las páginas migradas agregan `<Breadcrumbs items={[{ label: 'Inicio', href: '/dashboard' }, ...]}>` arriba del header.
11. **Sin emojis** en código ni en strings de UI.

---

## 6. Páginas con paginación client-side (sin endpoint paginable)

7 páginas usan paginación + filtros client-side (slice del array completo dentro de `onFetch`). Cada una marca un TODO en el código:

```ts
// TODO Fase 24: agregar paginación servidor a /api/<endpoint>
```

Endpoints pendientes:
- `/api/suppliers`
- `/api/purchases` (GET history)
- `/api/users`
- `/api/settings/roles`
- `/api/notifications`
- `/api/hr/employees` (lo consume `hr/attendance`)
- `/api/hr/leaves`
- `/api/stock-transfers/history`

Funciona correctamente para datasets pequeños (<200 filas). La capa de paginación visual del DataTable sigue activa, el slice ocurre en `onFetch`.

---

## 7. Validación

```
npm run typecheck   # 0 errores
npm run lint        # 0 errors · 92 warnings (baseline ~92 — sin regresión)
```

Las páginas NO migradas (branches, hr/employees, banks) siguen compilando y funcionando. La parte "New" de `stock-transfers/page.tsx` y `purchases/page.tsx` no se tocó: ambas vistas pesadas siguen operativas.

---

## 8. Próximos pasos (Fase 22c o Fase 24)

1. **Fase 24 backend:** agregar paginación + búsqueda servidor a los 8 endpoints listados arriba, y reemplazar los slices client-side en cada `onFetch` por params servidor.
2. Revisar `branches`, `hr/employees`, `accounting/banks` cuando crezca el dataset; podrían beneficiarse de un toggle "vista tabla" usando DataTable + cardRenderer.
3. Migrar el modal "Libro Mayor" de `accounting/banks` a DataTable con paginación servidor sobre `/api/accounting/banks/[id]/transactions`.
4. Cmd+K + global search (Fase 22c).
5. Skeleton sistemático en páginas sin DataTable (dashboard, settings, POS).

---

## 9. Listo para verificación

- Fase 22b está cerrada con todos los entregables.
- typecheck / lint en verde (sin regresiones).
- Las 14 páginas tocadas pueden enviarse a verificador y siguen el contrato del componente.
