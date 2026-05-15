# Phase 22a · Verification Report (Foundation UI)

Fecha: 2026-05-15
Auditor: subagente verificador independiente (no participó en la implementación).
Modo: READ-ONLY sobre `src/`, `docs/`, tests. Sólo se escribe este informe.

Alcance: validar la **Fase 22a — Foundation UI** del ERP SIMTECH antes
de habilitar push y comenzar Fase 22b (migración de las 33 páginas a la
nueva base).

## Veredicto: APROBADO

La Fase 22a entrega una base UI coherente y suficientemente robusta para
que la Fase 22b/c/d se construya encima sin reescribir nada. Compila
limpio, tests existen y son adecuados a la API pública, la documentación
es operativa, y no se detectaron regresiones en las 33 páginas restantes.

Las observaciones encontradas son menores (cosméticas o de superficie de
API) y no bloquean el push.

---

## V1-V15 (tabla)

| # | Validación | Resultado | Notas |
|---|------------|-----------|-------|
| V1 | `npm run typecheck` verde, `npm run lint` 0 errors | OK | typecheck pasa sin output; lint: **92 warnings, 0 errors** (== baseline declarado). |
| V2 | DataTable API completa (`columns`, `data`, `loading`, `pagination`, `sort`, `search`, `filters`, `selection`, `bulkActions`, `empty`, `cardRenderer`) + helpers + tipos exportados | OK | Todas las props presentes (`data-table.tsx:84-147`). Helpers `flattenForExport`, `nextSortDirection`, `calcTotalPages` exportados desde `data-table.helpers.ts` y re-exportados por `data-table.tsx:33`. Tipos `DataTableColumn<T>`, `DataTableFilterDef`, `DataTableBulkAction<T>` exportados. |
| V3 | DataTable mobile vs desktop (table en md+, cards/cardRenderer en `< md`, sort icons, checkboxes) | OK | Vista desktop: `data-table.tsx:426-534` con `<thead>` clickeable, `ChevronUp/Down`, checkbox select-all. Vista mobile: `data-table.tsx:537-641` con cardRenderer override o vista auto por `mobilePriority`. Fallback a `overflow-x-auto` dentro del bloque desktop (correcto). |
| V4 | Skeleton + EmptyState | OK | `skeleton.tsx`: `Skeleton`, `SkeletonRow`, `SkeletonTable`, `SkeletonCard` con `role="status"` y `aria-label="Cargando"`. `empty-state.tsx`: props `icon`, `title`, `description`, `action`, `size: sm|md|lg` (`empty-state.tsx:21-34`). |
| V5 | ConfirmDialog mejorado (`variant: 'destructive'`, `requireTyping`, compat) | OK | `confirm-dialog.tsx:19-26` agrega `variant` + `requireTyping`. `resolveTone()` mapea `'destructive' → 'danger'`. Backward-compat verificada: `stock-transfers/page.tsx:176` y `suppliers/page.tsx` siguen usando `tone: 'warning'` sin cambios. Input de typing con `font-mono` y disabled del botón hasta match exacto (`confirm-dialog.tsx:113-127, 140`). |
| V6 | Mobile drawer + sidebar replicado, ESC/backdrop/link cierran, hamburger funcional | OK | `mobile-drawer.tsx:36-55` maneja ESC y bloquea scroll body. Backdrop como `<button>` (accesible). `MobileNavigation.tsx:46-54` renderiza header `md:hidden` con `<HamburgerButton>`. Cierre al click en link delegado a helper puro `shouldCloseDrawer` (`mobile-nav.helpers.ts`), testeado. |
| V7 | POS responsive (grid mobile, cart bottom-sheet, search full-width) | OK | `pos/page.tsx:144` usa `min-h-screen md:h-screen` y `md:overflow-hidden`. `:161` cambia `flex-col md:flex-row`. Cart desktop `hidden md:flex w-96` (`:240`); cart mobile full-screen modal `:280` con sticky bottom-trigger `:222`. Search row `flex-col sm:flex-row` (`:207`). El grid concreto está dentro de `ProductGrid` (no auditado aquí pero el contenedor pasa `flex-1 overflow-hidden`). |
| V8 | Sales/new responsive | OK | `sales/new/page.tsx:153` cart desktop `hidden md:flex w-96`. Mobile sticky-bottom trigger `:135-148` con `Q{total}` y contador de items. Cart-modal mobile full-screen `:192-227` con botón "Volver". Misma forma que POS (consistencia visual). |
| V9 | `useDataTable` (paginación, sort, filters, search, debounce 300 ms, AbortController, reset page=1, toast error) | OK | `useDataTable.ts:96-239`. Debounce vía `useDebounce(searchValue, 300)`. AbortController por fetch (`:133-137`) y cleanup al cambiar deps (`:170-172`). Reset `page=1` con `firstResetRun` guard contra el primer render (`:181-188`). Error → `toast({ tone: 'error' })` (`:159`). Retorna `{ data, loading, pagination, sort, search, filters, setFilter, clearFilters, refetch }` (V9 pedía estos + `refetch`, todos presentes). |
| V10 | Breadcrumbs (`items`, separator desktop, último + back en mobile) | OK | `Breadcrumbs.tsx:54-105`. Mobile (`< md`): botón `ArrowLeft` que llama `router.back()` o navega al `previous.href` si está disponible (mejor UX que back genérico). Desktop: `<ol>` con `ChevronRight` y `aria-current="page"` en el último. |
| V11 | Tests mínimos | OK | `data-table.test.ts`: **13** `it()` cubriendo `flattenForExport` (6 casos), `nextSortDirection` (4 casos), `calcTotalPages` (3 casos). `mobile-nav.test.ts`: **5** `it()` cubriendo link directo, link ancestro, `data-close-drawer`, target sin match, target nulo. Ambos por encima del mínimo (≥6 y ≥3). |
| V12 | Documentación `ui-component-library.md` | OK | 284 líneas con guía rápida por componente, API/props, ejemplos copy-paste y reglas para Fase 22b/c/d (sección §8). Ejemplos correctos (firma de `useDataTable.onFetch` coincide con la implementación). |
| V13 | No regresiones (33 páginas siguen compilando; APIs no tocadas) | OK | Typecheck pasa sobre las 40 `page.tsx` detectadas en `(dashboard)`. `git diff --stat` muestra **4 archivos modificados** (`sales/new/page.tsx`, `MobileNavigation.tsx`, `confirm-dialog.tsx`, `data-table.tsx`) y archivos nuevos sólo en `src/components/ui/`, `src/components/layout/`, `src/hooks/`, `docs/`. **Cero archivo bajo `src/app/api/` tocado.** El POS (`pos/page.tsx`) y `layout.tsx` ya tenían la estructura responsive desde commits anteriores; la Fase 22a no los reabre. |
| V14 | Convenciones (sin emojis, ES-GT, Q con 2 decimales, paleta slate/blue/red) | OK | Búsqueda de emojis en los archivos nuevos/tocados retorna 0. Strings en español ES-GT (`"Sin datos para mostrar."`, `"Página X de Y · N registros"`, `"Migas de pan"`, `"Cargando"`). Q + `toFixed(2)` en POS y sales/new. Paleta consistente: slate/blue/rose/amber/sky (rose como destructivo del confirm, alineado al patrón existente). |
| V15 | Mobile usability a 380 px | OK (revisión estática) | Layout root usa `h-screen ... overflow-hidden` pero `MobileNavigation` envuelve el main en `overflow-auto` y header sticky → scroll natural funciona. Drawer respeta `max-w-[85vw]` para no tapar el contenido. POS y sales/new se transforman a 1 columna con cart full-screen modal — no hay riesgo de overflow horizontal. Breadcrumbs en mobile colapsa al último item + back, sin wrap raro. **Caveat:** no se pudo verificar con browser real; revisión hecha sólo sobre clases Tailwind y estructura del DOM. |

---

## Observaciones

### Severidad BAJA

1. **`DataTableBulkAction<TRow>` está exportado pero la prop `bulkActions` del componente NO lo usa.**
   `data-table.tsx:52-57` define el tipo con `variant: 'default'|'destructive'|'primary'` y `onClick(selected: TRow[])`. Pero `data-table.tsx:101-105` redeclara inline `bulkActions: Array<{ label, onClick: (selectedIds: string[]) => void, variant: 'default'|'danger' }>`. Hay drift entre:
   - el tipo público (`destructive|primary`, recibe rows enteros)
   - el tipo realmente consumido (`danger`, recibe sólo ids)

   No bloquea — la Fase 22b puede usar el inline shape. Pero si alguien construye un `DataTableBulkAction<T>` siguiendo el tipo exportado, va a tener errores. Recomendación: unificar en Fase 22b cuando se migre la primera tabla con bulk-actions.

2. **`useMemo` del contextValue en `ConfirmProvider` con deps vacías.**
   `confirm-dialog.tsx:75`: `const contextValue = useMemo(() => ({ confirm }), []);` — la función `confirm` no está en deps. Funciona porque `setPending`/`setTypedValue` son estables, pero ESLint debería marcarlo con `react-hooks/exhaustive-deps` (la regla parece deshabilitada localmente o no advierte por la captura). Sugerencia: documentar con eslint-disable comment o pasar `confirm` por ref para que sea explícito.

3. **`clearFilters` depende de `defaultFilters` por identidad.**
   `useDataTable.ts:209-211`: `useCallback(() => setFilters(defaultFilters), [defaultFilters])`. Si el caller pasa `defaultFilters: {}` inline, la identidad cambia en cada render → `clearFilters` se recrea. No es bug, pero el doc no advierte del memo necesario en el caller. Agregar nota a `ui-component-library.md` §2.

4. **`MobileDrawer` no implementa focus trap completo.**
   `mobile-drawer.tsx:49` hace `drawerRef.current?.focus()` al abrir, pero no atrapa el Tab dentro del drawer ni restituye el foco al elemento previo al cerrar. Para la mayoría de casos (sidebar mobile) basta — pero si alguien lo usa para un drawer crítico (filtros largos, formularios), se va a notar. Documentar limitación o agregar trap en Fase 22b cuando se use en filtros.

5. **`useDataTable` no devuelve `setSort`/`setSearch` explícitos.**
   El hook expone `sort.onSortChange(key, dir)` y `search.onChange(value)`, lo cual está bien para pasarlos directo al DataTable. Pero si alguien quiere setear sort programáticamente (ej. al cambiar de tab), no hay API directa — tiene que llamar a `onSortChange` con un par válido. No bloqueante.

### Severidad MEDIA

6. **El typecheck no garantiza render de las 33 páginas en runtime.**
   `tsc --noEmit` pasa, pero hay páginas (ej. `accounting/payables`, `users/roles`) que llaman `confirm()`/`alert()` nativos detectados por el discovery (sección 6.1). La Fase 22a **no migró estos archivos** (declarado fuera de scope) y eso es correcto. Sin embargo, si el push se hace y luego un dev asume que `useConfirm.variant: 'destructive'` reemplaza el `confirm()` nativo, hay que dejar claro en Fase 22b qué archivos migrar (5 pendientes). Recomendación: agregar checklist a la fase 22b en `ui-component-library.md` o en el plan maestro.

7. **Tests de runtime React (render, sort UI, paginación clickeable) no existen.**
   Los tests cubren la lógica pura de helpers (correcto y necesario). Pero la integración del DataTable como JSX no se prueba — sólo el typecheck garantiza que las props compilen. Cuando llegue testing-library en Fase 25 (declarado), recién ahí tendremos cobertura de UI. Por ahora aceptable porque la implementación se valida con el ojo + 22b va a ejercitarla.

8. **No se pudo correr `vitest` en el entorno linux del verificador.**
   El runner falla por `@rollup/rollup-linux-arm64-gnu` (problema NPM con optional deps en cross-arch). NO es un problema del código de Fase 22a — los tests, leídos, son coherentes y compilarían. Pero la verificación queda incompleta en este aspecto: no se ejecutaron, sólo se inspeccionaron. Recomendación: el implementador debe correr `npm test` en su mac local antes del push y reportar el resultado.

### Severidad ALTA

Ninguna detectada.

---

## Discrepancia menor entre doc y código

El doc `ui-component-library.md` §9 declara que la Fase 22a tocó
`src/app/(dashboard)/layout.tsx` y `src/app/(dashboard)/pos/page.tsx`.
`git diff` actual muestra que **estos dos archivos NO están modificados**
en el working tree de la fase. La estructura responsive del POS y el
layout que invoca `<MobileNavigation>` provienen de commits anteriores
(verificado con `git log -- pos/page.tsx`, el último cambio relevante fue
`1472f55`, "Company.costMethod...", y antes `b76864e` "Reduce frontend
and API lint noise").

Esto NO es un defecto — la responsive del POS y del layout ya estaba
hecha y la 22a sólo verifica que la base nueva (drawer + hamburger)
conviva con ella. El doc está describiendo "archivos que conforman la
foundation UI", no "archivos que la fase tocó". Recomendación: aclarar
la sección §9 con la diferencia (existían vs. tocados ahora).

---

## Detalles adicionales

### Cobertura de los tests

`data-table.test.ts` (13 casos):
- `flattenForExport`: header desde columns, exportValue, accessor string, fallback a row[key], null/undefined → `''`, 0 filas.
- `nextSortDirection`: primer click → asc, asc → desc, desc → asc, cambio de columna → asc.
- `calcTotalPages`: 0 → 1, redondeo (25/10=3, 100/20=5, 101/20=6), pageSize=0 protegido.

`mobile-nav.test.ts` (5 casos):
- Link directo, link ancestro, `data-close-drawer`, sin match, target null.

Ambos archivos tipan correctamente sus mocks (interfaces locales para no acoplar a DOM real). Tests son determinísticos, no hay timeouts ni await racing.

### API del DataTable contra `useDataTable`

El ejemplo del doc §2 muestra el cableado completo `useDataTable → DataTable`. Verifiqué que los nombres calzan:
- `table.pagination.page` ↔ prop `page` ✓
- `table.pagination.limit` ↔ prop `pageSize` ✓ (renaming intencional)
- `table.pagination.total` ↔ prop `total` ✓
- `table.pagination.onPageChange` ↔ prop `onPageChange` ✓
- `table.pagination.onLimitChange` ↔ prop `onPageSizeChange` ✓
- `table.sort.sortBy` ↔ prop `sortKey` ✓ (renaming intencional)
- `table.sort.sortDir` ↔ prop `sortDirection` ✓
- `table.sort.onSortChange` ↔ prop `onSort` ✓
- `table.search` ↔ prop `search` ✓ (shape `{value, onChange}` calza directo)

No detecté ningún mismatch. El caller en 22b puede hacer spread casi directo.

### Estado del git

```
Modificados:
 src/app/(dashboard)/sales/new/page.tsx     | 102 +++++++++---
 src/components/layout/MobileNavigation.tsx |   5 +-
 src/components/ui/confirm-dialog.tsx       |  67 ++++++++-
 src/components/ui/data-table.tsx           | 223 ++++++++++++++++++++++++-----

Nuevos:
 docs/operations/ui-component-library.md
 src/components/layout/Breadcrumbs.tsx
 src/components/layout/__tests__/mobile-nav.test.ts
 src/components/layout/mobile-nav.helpers.ts
 src/components/ui/__tests__/data-table.test.ts
 src/components/ui/data-table.helpers.ts
 src/components/ui/empty-state.tsx
 src/components/ui/skeleton.tsx
 src/hooks/useDataTable.ts
```

**Cero modificación bajo `src/app/api/`, `prisma/`, `scripts/`.** Riesgo de regresión de backend = 0.

### Convenciones — auditoría detallada

- Símbolo Q: `pos/page.tsx:271, 309` y `sales/new/page.tsx:184, 222` → `Q{value.toFixed(2)}`. Consistente.
- Sin emojis: confirmado por grep sobre los 10 archivos críticos.
- Tono: `slate-` neutro, `blue-` primario, `rose-` destructivo (confirm), `amber-` warning, `sky-` info. Coherente con la paleta declarada (rose en lugar de red para tonos del confirm es un pequeño cambio respecto del legacy `red-50/600`, pero alineado a Tailwind v4 y al estilo del implementador).
- ES-GT: todos los strings auditados están en español. `es-GT` se usa correctamente en `toLocaleDateString` y `jsPDF.text(Generado: ...).toLocaleString('es-GT')` (`data-table.tsx:251`).

### Accesibilidad

Auditoría puntual:
- `MobileDrawer`: `role="dialog"`, `aria-modal="true"`, `aria-label`
  configurable. Backdrop es un `<button>` con `aria-label="Cerrar menú"` —
  correcto para keyboards.
- `HamburgerButton`: `aria-label` configurable, default "Abrir menú".
- `ConfirmDialog`: el botón `X` tiene `aria-label="Cerrar"`. El input de
  typing tiene su `aria-label` derivado del string requerido. Falta
  `role="dialog"` y `aria-modal` en el wrapper externo — observación
  menor, no listada en V1-V15.
- `DataTable`: search input con `aria-label="Buscar"`. Headers ordenables
  son `<th>` con `cursor-pointer`, pero NO usan `role="button"` ni
  `aria-sort` — observación menor de a11y que conviene cerrar en 22b
  cuando se ejercite con usuarios reales.
- `EmptyState`: `role="status"`. Bien.
- `SkeletonTable`/`SkeletonCard`: `role="status"` + `aria-label="Cargando"`.
- `Breadcrumbs`: `aria-label="Migas de pan"` (`<nav>`), último item con
  `aria-current="page"`. Bien.

A11y baseline aceptable. Recomendación: agregar `aria-sort` a headers
ordenables del DataTable en 22b (no bloqueante).

### Mobile usability — análisis estático

A 380 px de ancho:
- Layout: el sidebar queda detrás del `hidden md:flex` y aparece el header `md:hidden h-16` con hamburger. Drawer slide-in desde la izquierda con backdrop. Click en cualquier `<Link>` interno cierra automáticamente (testeado en el helper).
- POS: catálogo full-width, cart oculto, sticky bottom-trigger con `bg-blue-600 py-4` (target táctil de 48 px+, OK). Al tap, modal full-screen.
- Sales/new: idéntico patrón al POS, color púrpura.
- DataTable: en mobile renderiza tarjetas (auto via `mobilePriority` o `cardRenderer`). Selección y bulk actions también funcionan en vista card (`data-table.tsx:582-595`).
- Breadcrumbs: en mobile sólo el último item + ArrowLeft. No hay riesgo de wrap.
- ConfirmDialog: `max-w-md` con padding `p-4` del contenedor → bien encuadrado a 380 px.

Sin overflow horizontal raro detectado en el código.

---

## Conclusión

**¿Listo para push y Fase 22b? Sí.**

La Fase 22a entrega un foundation UI sólido, testeado en su superficie pura,
documentado, y sin regresiones detectables sobre los 33 archivos de
`src/app/(dashboard)/`. El typecheck/lint están limpios y la API entre
`useDataTable` ↔ `DataTable` calza sin fricciones.

Las observaciones (8 en total, todas BAJA o MEDIA) son superficie de API y
documentación que se pueden cerrar dentro de Fase 22b o en un follow-up
del implementador (1-2 horas total). Ninguna requiere reabrir la
implementación.

**Recomendación firme:** correr `npm test` en una máquina mac local
(el container linux falla por arch mismatch de rollup) y confirmar
verde antes del merge. Si verde, push y abrir Fase 22b.

**Plan sugerido para arrancar 22b:**
1. Migrar primero las 3 páginas con paginación servidor ya implementada
   (`audit`, `sales`, `accounting`) al `useDataTable + DataTable` —
   menos riesgo, mayor ROI de testing.
2. Después, las 14 sin paginación (`inventory`, `customers`, `suppliers`,
   `users`, `branches`, etc.) — aquí se ejercita el contrato real.
3. Cerrar observaciones #1 y #6 de este informe al pasar.
