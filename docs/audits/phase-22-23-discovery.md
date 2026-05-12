# Discovery Fase 22 + Fase 23 · Auditoría Frontend / UX

Fecha: 2026-05-11
Auditor: subagente frontend/UX
Alcance: estado actual del frontend antes de ejecutar Fase 22 (UI/UX completo) y Fase 23 (Configuración avanzada).
Modo: READ-ONLY (Read/Grep). No se modificó código.

---

## 1. Resumen ejecutivo

- **Mobile responsive: NO existe.** El sidebar está en `hidden md:flex`, no hay drawer ni botón hamburguesa funcional. En < 768 px el usuario sólo ve un header con logo y queda sin navegación. Ninguna tabla tiene vista card. POS y formulario de venta usan `w-96` fijo en el carrito (rompe en tablet/móvil).
- **Tablas: muy heterogéneas.** No existe componente `DataTable` reutilizable. Sólo 3 páginas implementan paginación servidor (audit, sales, accounting). El resto (inventory, customers, suppliers, users, branches, receivables, payables, notifications, hr/employees, stock-transfers, hr/attendance) carga todo con `limit=50`/`limit=100` sin paginar. Ningún header es ordenable. No hay selección múltiple, ni acciones en masa, ni export uniforme.
- **Reportes huérfanos: 8 de 9 endpoints sin UI dedicada.** Sólo `reports/sales` tiene UI (la página `/reports`, que en realidad es "historial de ventas + cierre de caja"). Los endpoints `kardex`, `slow-movers`, `valuation`, `profit-loss`, `customers/top`, `products/top`, `suppliers/top`, `sales/by-user` no tienen pantalla. A esto se suman los reportes que las fases 14-21 agregarán (balance-sheet, cash-flow, trial-balance, general-journal, general-ledger, aging CxC/CxP, libros tributarios) — ninguno tiene UI todavía. Volumen real proyectado: **~17 reportes a maquetar**.
- **Hooks reutilizables:** `useConfirm` y `useToast` existen y están bien construidos, pero el reemplazo de `confirm()`/`alert()` está a medio camino (7 archivos siguen usando los nativos).
- **`useEffectEvent`:** presente en `NotificationsMenu.tsx` (línea 22). Riesgo: API experimental de React canary; debe reemplazarse por ref + useCallback estable.
- **Volumen del rewrite frontend:** 33 páginas en `src/app/(dashboard)` + sidebar + layout + ~40 componentes. La Fase 22 implica tocar **prácticamente todas**: alta intensidad, no menor a 8-10 días-persona de trabajo bien hecho.

---

## 2. Mobile / responsive

### 2.1 Layout dashboard (`src/app/(dashboard)/layout.tsx`)

```
src/app/(dashboard)/layout.tsx:16-42
- Estructura: <div h-screen flex overflow-hidden>
- Sidebar: <ClientSidebar /> con class hidden md:flex (ClientSidebar.tsx:105)
- Mobile header: <header className="md:hidden h-16 ..."> SOLO muestra logo y nombre. Sin botón hamburguesa, sin trigger de drawer.
```

**Problema:** en < 768 px el usuario PYME pierde la navegación entera. El BranchSelector también vive dentro del sidebar oculto, por lo que en móvil no se puede cambiar sucursal.

### 2.2 POS (`src/app/(dashboard)/pos/page.tsx`)

```
linea 174: <div className="w-96 border-l ... flex flex-col p-6 ...">
linea 158: row de búsqueda usa flex-col sm:flex-row → mejor, pero el cart fijo de 384 px lo rompe.
linea 168: ProductGrid con flex-1 overflow-hidden → no escala a 1 columna en móvil.
```

`src/app/(dashboard)/sales/new/page.tsx:133` repite el mismo `w-96` fijo.

### 2.3 Tablas en móvil

19 páginas usan `overflow-x-auto` como única estrategia mobile. Cero `hidden md:table` o vista card alternativa. En móvil se hace scroll horizontal en tabla de 7 columnas (ej. `/reports`, `/sales`, `/accounting`), UX deficiente.

**Veredicto mobile:** Estado actual ≈ 1/10. Lo que promete Fase 22 (drawer + hamburger + POS responsive + tablas card) es completamente nuevo, no hay base reutilizable.

---

## 3. Tablas, paginación, ordenamiento, filtros, export

### 3.1 Componente Table reutilizable
**No existe.** Búsqueda de `DataTable|<Table |reusableTable` retornó 0 archivos. Cada página redibuja su propio `<table className="w-full ...">` con clases Tailwind inline.

### 3.2 Paginación servidor

| Página | Paginación servidor | Endpoint paginado |
|---|---|---|
| `audit` | Sí (page/limit, botones Anterior/Siguiente) | `/api/audit` |
| `sales` | Sí (page/limit + totalPages) | `/api/sales` |
| `accounting` (movimientos) | Sí | `/api/accounting` |
| `inventory` | No (limit=50 fijo) | `/api/products` (sí soporta) |
| `customers` | No | `/api/customers` (sí soporta) |
| `suppliers` | No | — |
| `users` | No | — |
| `branches` | No | — |
| `purchases` | No | `/api/purchases` (sí soporta) |
| `accounting/receivables` | No | sí soporta backend |
| `accounting/payables` | No | sí soporta backend |
| `accounting/banks` | No | — |
| `notifications` | No | — |
| `hr/employees` | No | — |
| `hr/attendance` | No | — |
| `hr/leaves` | No | — |
| `hr/payroll` | No | — |
| `stock-transfers` | No | sí soporta backend |
| `sales/delivery-notes` | No | sí soporta backend |
| `users/roles` | No | — |

20 tablas detectadas, **3 paginadas y 17 cargando "los últimos N"**. Backend ya expone paginación en varios endpoints, pero el frontend no la consume.

### 3.3 Ordenamiento por columna
Cero headers clickeables. Cero query param `sort=` enviado desde frontend. Backend tampoco lo respeta.

### 3.4 Filtros
Filtros existen pero ad-hoc por página (`statusFilter`, `dateFrom/dateTo` en `sales`; `typeFilter` en `accounting`; `actionFilter/entityFilter` en `audit`). No hay un componente `<TableFilters>` reutilizable, ni manejo uniforme de "limpiar filtros".

### 3.5 Selección múltiple + acciones masivas
No existe en ninguna tabla.

### 3.6 Export
Sólo 2 páginas exportan: `/reports` (CSV + PDF con jsPDF + autoTable) y `/accounting` (CSV/PDF). 18 tablas sin export. No hay servicio `exportTable(data, schema)` compartido.

---

## 4. Reportes huérfanos (endpoints sin UI)

Lista contrastada de `src/app/api/reports/**/route.ts` vs UI existente en `src/app/(dashboard)/`:

| Endpoint actual | UI | Estado |
|---|---|---|
| `/api/reports/sales` | `/reports` (page.tsx) | Cubierto (parcial — sólo cabecera) |
| `/api/reports/sales/by-user` | — | **HUÉRFANO** |
| `/api/reports/customers/top` | — | **HUÉRFANO** |
| `/api/reports/products/top` | — | **HUÉRFANO** |
| `/api/reports/suppliers/top` | — | **HUÉRFANO** |
| `/api/reports/inventory/kardex` | — | **HUÉRFANO** (crítico para bodega) |
| `/api/reports/inventory/slow-movers` | — | **HUÉRFANO** |
| `/api/reports/inventory/valuation` | — | **HUÉRFANO** |
| `/api/reports/accounting/profit-loss` | — | **HUÉRFANO** |

**Huérfanos hoy = 8.**

Reportes prometidos por Fases 14-17 (todavía no existen como endpoint, los agrega el sprint contable):
- `balance-sheet`, `cash-flow`, `trial-balance`, `general-journal`, `general-ledger`
- Aging CxC + Aging CxP
- Libro Ventas, Libro Compras, Libro IVA

Cuando lleguen, **sumarán ~9 endpoints más, todos requerirán UI desde cero**.

**Total estimado de pantallas de reporte a construir en Fase 22: 17.**

---

## 5. Dashboard

`src/app/(dashboard)/dashboard/page.tsx` carga `/api/dashboard` + `/api/dashboard/charts`, pinta:
- 4 KPI cards (revenueToday, salesCount, totalProducts, lowStock).
- Recharts: BarChart de ventas diarias, PieChart por método de pago, lista top productos, lista ventas por sucursal.

**Lo que NO tiene:**
- Widgets configurables (no hay registry de widget, ni drag&drop, ni preferencia de usuario).
- Drill-down: clicks en barras/pies no navegan a detalle.
- Comparativo período vs período.
- No filtros de rango: la ventana viene dura del backend.

Fase 22 promete las 3 cosas. Es construcción de cero — no hay primitivas reutilizables (panel resizable, widget container, settings de layout).

---

## 6. Forms / Modales: confirm/alert y disabled-during-submit

### 6.1 `confirm()` / `alert()` pendientes

7 archivos siguen usando los nativos del browser:

```
src/app/(dashboard)/accounting/payables/page.tsx:154   confirm()  ← anular pago proveedor
src/app/(dashboard)/accounting/receivables/page.tsx:105 confirm()  ← anular abono cliente
src/app/(dashboard)/users/roles/page.tsx:39             confirm()
src/app/(dashboard)/users/roles/page.tsx:44             alert()
src/app/(dashboard)/users/roles/page.tsx:47             alert()
src/app/(dashboard)/hr/attendance/page.tsx:64           alert('Error al marcar')
src/app/(dashboard)/hr/payroll/[id]/page.tsx:90         alert('Error al guardar')
src/app/(dashboard)/stock-transfers/page.tsx:176        await confirm({...})  ← OK ya usa useConfirm
src/app/(dashboard)/suppliers/page.tsx:109              await confirm({...})  ← OK ya usa useConfirm
```

5 archivos REALMENTE pendientes (los dos últimos ya migrados a `useConfirm`).
`useConfirm` y `useToast` están registrados en `Providers.tsx` y listos para usarse en toda la app.

### 6.2 Disabled-during-submit en modales
Sondeo: 12 modales tienen `isSaving|isSubmitting|isLoading` con disabled. Pendientes (no detectados): `CategoryModal`, `BankModal`, `ImportExcelModal`, `PrintBarcodeModal`, `DeliveryNoteModal`, `CreateDeliveryNoteModal`, `RemoteSaleWizard`. Confirmar caso por caso al ejecutar Fase 22.

### 6.3 Skeleton loaders / optimistic updates
- `animate-pulse`: sólo 3 ocurrencias (`VariantSelectionModal`, `ProductGrid`, `accounting/banks`).
- Optimistic updates: cero (todas las operaciones esperan respuesta y luego refetchean).
- La mayoría usa spinners genéricos `<div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />` repetidos inline.

---

## 7. Settings UI (estado actual)

`src/app/(dashboard)/settings/page.tsx` tiene 3 tabs:
1. **General** — storeName, NIT, address, phone, moneda, currencySymbol, receiptMsg.
2. **FEL** — felEnabled, provider (NONE|INFILE|DIGIFACT), nitEmisor, apiUser, apiKey.
3. **Pagos e Impuestos** — checkboxes de métodos de pago, taxRate, taxIncluded.

**Lo que falta para Fase 23:**
- Plantillas de factura customizables (header/footer, color, logo) → no existe.
- Logo por sucursal → no existe (Branch model probablemente sólo tiene nombre).
- Configuración de impresora térmica 58mm / 80mm → no existe.
- Numeración por serie/establecimiento → no existe.
- NIT por sucursal → el actual sólo guarda 1 NIT en CompanySettings.
- Notas configurables al pie por sucursal → no existe.
- Test de conexión FEL → no existe (placeholder).
- UI roles con matriz visual de permisos → `/users/roles` es lista + modal simple, no matriz.

Fase 23 va a tocar schema (Branch agrega nit, invoiceSeries, logoUrl, footerNote, printerConfig, templateId) más una sección entera "Plantillas" + componente preview.

---

## 8. Navegación

- **Cmd+K / búsqueda global:** no existe (cero matches a `cmdk`, `kbar`, `command palette`).
- **Breadcrumbs:** no existe (cero matches a `breadcrumb`).
- **Aviso sesión por expirar:** no existe.

Construcción de cero para los 3.

---

## 9. POS – mejoras Fase 22

Actualmente:
- "Generar Cotización" y "Cobrar" conviven en el panel del carrito (`pos/page.tsx:194-209`). No hay "suspender venta" separado de cotización.
- Descuento se aplica en `CheckoutModal` sin gate de permiso (`cartStore.discount` libre).
- Atajos de teclado F2 / F8 / F12 implementados (`pos/page.tsx:86-103`) pero no documentados en UI.
- `w-96` fijo del carrito (problema mobile, mencionado).

---

## 10. `useEffectEvent`

```
src/components/layout/NotificationsMenu.tsx:3
  import { useEffect, useEffectEvent, useState } from 'react';
src/components/layout/NotificationsMenu.tsx:22
  const fetchNotifications = useEffectEvent(async () => { ... });
```

Una sola ocurrencia. API canary, debe reemplazarse por ref de la función + cleanup pattern.

---

## 11. Validación del plan Fase 22 / Fase 23

### 11.1 Fase 22 — ¿realista?

**Sí, pero subestimada.** El plan describe 7 frentes (mobile, tablas, reportes huérfanos, dashboard, POS, configuración, navegación, forms, skeletons) y trata cada uno como un bullet. La realidad:

- **Mobile responsive completo en 33 páginas** ≈ 2-3 días por sí solo.
- **Componente DataTable reutilizable + migración de 20 tablas** ≈ 3-4 días.
- **UI para 17 reportes** (8 huérfanos hoy + 9 que llegan con fases 14-17) ≈ 4-5 días si se hace bien con filtros, export y drill-down.
- **Dashboard con widgets configurables + drill-down** ≈ 2-3 días.
- **Cmd+K + breadcrumbs + session expire warning** ≈ 1-2 días.
- **Migrar 5 archivos a useConfirm/useToast + audit de modales** ≈ 0.5 día.
- **Skeleton loaders sistemáticos + reemplazo useEffectEvent** ≈ 1 día.
- **POS mejorado (suspender vs cotización, permiso de descuento, doc atajos, responsive)** ≈ 1-2 días.

Total realista Fase 22: **14-20 días-persona**. El plan lo describe como una sola fase atómica — habría que dividirlo en 22a (mobile + tablas + forms) y 22b (reportes + dashboard + navegación) para mantener "fase atómica con tests verdes".

### 11.2 Fase 23 — ¿realista?

Sí, pero requiere:
- Migraciones nuevas: `Branch.nit?`, `Branch.invoiceSeries?`, `Branch.logoUrl?`, `Branch.footerNote?`, `Branch.printerWidth?` (58|80), `InvoiceTemplate` (model nuevo con header, footer, accentColor, layoutJson).
- Validación de unicidad de serie por establecimiento (alineado con FEL).
- Hook al render del ticket (`TicketModal.tsx`) y al PDF de factura para que respete plantilla activa por sucursal.
- Test de conexión FEL real requiere Fase 16 funcionando (dependencia ya declarada en el plan, OK).

Estimado: **5-7 días-persona**.

---

## 12. Issues nuevos encontrados (no listados en plan)

1. **`/reports` es un nombre engañoso.** Hoy esa ruta es "historial de ventas + cierre de caja". Cuando se construyan las 17 pantallas de reportes contables, hay que decidir si renombrar a `/reports/sales-history` y abrir `/reports/index` como hub. La sidebar apunta a `/reports` con label "Reportes" — confunde.
2. **`BranchSelector` vive dentro del sidebar oculto en mobile.** Aun resolviendo el drawer, hay que decidir dónde va en el mobile header (probablemente top-right).
3. **`Providers.tsx` no envuelve `<TooltipProvider>` ni `<KbdProvider>`.** Cuando se introduzca Cmd+K, hay que evaluar `cmdk` (Vercel) vs implementación propia.
4. **`useDebounce`** es el único hook propio actual. Falta `usePagination`, `useTableSort`, `useTableFilters`, `useColumnVisibility` — todos necesarios para el componente Table reutilizable.
5. **Inconsistencia de spinners.** El mismo bloque de spinner inline aparece copiado en 8+ archivos. Hay que extraer `<Spinner size="sm|md|lg" />` antes de empezar la fase 22.
6. **Carga inicial sin Suspense.** Todas las páginas son `'use client'` con `useEffect` → `setLoading(true)`. Migrar a React Server Components donde se pueda reduciría 20-30% del bundle y daría streaming gratis. Decisión arquitectónica que toca discutir antes de empezar 22.
7. **`/notifications` page** y `NotificationsMenu` son dos UIs paralelas para lo mismo. Si se va a tocar el menú para sacar `useEffectEvent`, conviene unificar.
8. **Currency hardcoded.** Aunque `settings.currency` existe, todo el UI muestra `Q` literal en lugar de leer del store/settings. Cuando llegue Fase 21 (multi-moneda) esto va a explotar.
9. **No hay error boundary global de UI** (sólo se menciona para Sentry en Fase 13). Si una página crashea, queda blanco.
10. **`overflow-hidden` en `layout.tsx`** combinado con `h-screen` impide scroll natural en mobile cuando el contenido excede. Hay que revisar al introducir drawer.

---

## 13. Recomendaciones para ejecutar Fase 22

1. **Dividir en 22a (infraestructura UI) y 22b (features).**
   - 22a: `<DataTable>`, `<Spinner>`, `<Breadcrumbs>`, `<MobileDrawer>`, hooks de tabla, replace useEffectEvent, migrar 5 archivos confirm/alert, skeleton sistematizado.
   - 22b: aplicar a las 33 páginas + 17 reportes + dashboard widgets + Cmd+K + POS.
2. **Primero el rewrite responsive del layout** (drawer + mobile header funcional). Sin esto las demás mejoras no son testeables en 375 px.
3. **DataTable antes que reportes.** Cada reporte va a tener tabla → si construyes los reportes con tabla custom, después hay que reescribirlos.
4. **Validar antes de empezar:** la fase 22 depende de las fases 14-21 que aún no existen. Si se empieza 22 antes de fase 14, los 9 reportes contables huérfanos seguirán sin endpoint que consumir. **Ejecutar 22 después de 21 como dice el plan, no antes.**
5. **Tests visuales (Playwright snapshots o Chromatic).** Imposible asegurar "no regresión" en mobile con 33 páginas sin baseline visual.

---

## 14. Recomendaciones para Fase 23

1. **Migrar schema antes de UI.** `Branch.nit`, `Branch.invoiceSeries`, `Branch.logoUrl` deben existir y los endpoints ya validarlos antes de construir formularios.
2. **Componente preview de ticket.** Construir un `<TicketPreview templateId branchId />` que renderiza con datos dummy — clave para la UX de "ver cómo va a quedar mi factura".
3. **Plantillas con JSON Schema.** El layoutJson va a ser frágil si lo hace cada quien a mano. Definir 3-4 plantillas base ("Clásica", "Compacta", "Logo grande") seleccionables y customizables vía form, no editor libre.
4. **Aislar config de impresora térmica.** La diferencia 58/80 mm afecta `TicketModal` y la generación de PDF. Hacer un `formatThermal(saleData, width)` puro y testeable.

---

## 15. Conclusión

- El frontend hoy es **funcional en desktop** y **roto en mobile**. Es un MVP de UI, no un ERP terminado.
- `useConfirm`/`useToast` están bien construidos y listos; aprovecharlos en Fase 22 es bajo costo / alto valor.
- El gap más grande no es estético — son los **17 reportes sin pantalla** (8 huérfanos + 9 que llegan con fases 14-17). Si Fase 22 no entrega esos, el ERP queda con backend rico y frontend incapaz de mostrarlo.
- Fase 22 tal como está descrita es **una fase de 14-20 días**. Recomendación firme: dividir en 22a + 22b o destinar 3 semanas reales antes de pasar a Fase 23.
- Fase 23 es ejecutable en 5-7 días una vez fase 16 (FEL) y 22a (Settings UI infra) estén listas.
