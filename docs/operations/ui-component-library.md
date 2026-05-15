# UI Component Library · SIMTECH (Fase 22a)

Guía rápida para devs/agentes que necesiten construir UI sobre la base que
introdujo la Fase 22a. Los componentes viven en `src/components/ui/` y
`src/components/layout/`. Los hooks compartidos en `src/hooks/`.

> **Principios.**
> - Mobile-first: si no funciona en 380 px, no funciona.
> - Locale es-GT: símbolo Q, fechas DD/MM/YYYY.
> - Multi-tenant: los componentes nunca asumen tenant; reciben datos vía props.
> - Sin emojis en producción.
> - Nada de mocks: los datos siempre llegan por props desde un fetch real.

---

## 1. DataTable

`src/components/ui/data-table.tsx`

Tabla servidor con paginación, sort, filtros, search, selección, export
CSV/PDF y vista card automática en mobile.

### API mínima

```tsx
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

const columns: DataTableColumn<Product>[] = [
  { key: 'sku', header: 'SKU', mobilePriority: 'meta' },
  {
    key: 'name',
    header: 'Producto',
    sortable: true,
    mobilePriority: 'title',
  },
  {
    key: 'price',
    header: 'Precio',
    accessor: (p) => `Q${Number(p.price).toFixed(2)}`,
    exportValue: (p) => Number(p.price).toFixed(2),
    sortable: true,
    mobilePriority: 'highlight',
  },
];

<DataTable
  columns={columns}
  data={products}
  loading={loading}
  total={total}
  page={page}
  pageSize={limit}
  onPageChange={setPage}
  onPageSizeChange={setLimit}
  onSort={(k, d) => { setSortBy(k); setSortDir(d); }}
  sortKey={sortBy}
  sortDirection={sortDir}
  getRowId={(p) => p.id}
  emptyMessage="No hay productos para mostrar"
/>
```

### Slots opcionales

| Slot | Tipo | Para qué |
|------|------|----------|
| `search` | `{ value, onChange, placeholder? }` | Input de búsqueda full-width arriba |
| `filters` | `DataTableFilterDef[]` | Select/date/text/number controlados |
| `empty` | `ReactNode` | Reemplaza el mensaje default con JSX (ej. `<EmptyState />`) |
| `cardRenderer` | `(row) => ReactNode` | Render custom en mobile (< md) |
| `selection` | `{ selected: Set<string>, onSelectionChange, rowIdKey? }` | Selección controlada externa |
| `bulkActions` | `Array<{ label, onClick }>` | Toolbar con acciones cuando hay selección |
| `enableCsvExport` / `enablePdfExport` | `boolean` | Botones de export CSV/PDF |

### Mobile

Si `cardRenderer` no se provee, el componente renderiza una vista card
automática usando `column.mobilePriority`:

- `title` → texto principal arriba (uno por row).
- `highlight` → valor destacado a la derecha (uno por row).
- `meta` → grid 2×2 abajo (varios por row).
- `hidden` → no renderizar en mobile.

### Pagination

Si `total > pageSize`, aparece la barra de paginación al pie con flechas
prev/next y, si pasaste `onPageSizeChange`, un selector "20 por página".

---

## 2. useDataTable

`src/hooks/useDataTable.ts`

Hook que centraliza el state (page/limit/sort/search/filters) y dispara
fetches con cancelación + debounce. No conoce el shape de los datos.

```tsx
const table = useDataTable<Product>({
  defaultLimit: 20,
  defaultSortBy: 'createdAt',
  defaultSortDir: 'desc',
  onFetch: async ({ page, limit, search, sortBy, sortDir, filters, signal }) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search && { q: search }),
      ...(sortBy && { sortBy, sortDir: sortDir ?? 'asc' }),
    });
    const res = await fetch(`/api/products?${params}`, { signal });
    const json = await res.json();
    return { data: json.products, total: json.total };
  },
});

return (
  <DataTable
    columns={cols}
    data={table.data}
    loading={table.loading}
    total={table.pagination.total}
    page={table.pagination.page}
    pageSize={table.pagination.limit}
    onPageChange={table.pagination.onPageChange}
    onPageSizeChange={table.pagination.onLimitChange}
    sortKey={table.sort.sortBy ?? undefined}
    sortDirection={table.sort.sortDir ?? undefined}
    onSort={table.sort.onSortChange}
    search={table.search}
  />
);
```

Características:
- **Debounce search** 300 ms (configurable).
- **Reset page=1** al cambiar search / filters / sort.
- **Cancela request previo** con AbortController.
- **Errores** → toast automático.

---

## 3. Mobile drawer + Sidebar mobile

`src/components/ui/mobile-drawer.tsx` + `src/components/layout/MobileNavigation.tsx`

El layout `(dashboard)/layout.tsx` ya integra el drawer. En `< md`, hay un
header con hamburger; al click, se abre el drawer con el `ClientSidebar`
adentro. Se cierra con ESC, click en backdrop, o al navegar a un link.

Si necesitás otro drawer (panel de filtros, configuración rápida) podés
reutilizar `<MobileDrawer open onClose>`.

```tsx
<MobileDrawer open={open} onClose={() => setOpen(false)} ariaLabel="Filtros">
  <YourContent />
</MobileDrawer>
```

---

## 4. Breadcrumbs

`src/components/layout/Breadcrumbs.tsx`

```tsx
<Breadcrumbs
  items={[
    { label: 'Inicio', href: '/dashboard' },
    { label: 'Ventas', href: '/sales' },
    { label: 'Detalle' },
  ]}
/>
```

- Desktop: lista completa con separador `>`.
- Mobile: sólo última item + botón flecha Atrás (usa router.back o el href anterior).

---

## 5. EmptyState

`src/components/ui/empty-state.tsx`

```tsx
import { EmptyState } from '@/components/ui/empty-state';
import { Package } from 'lucide-react';

<EmptyState
  icon={<Package className="w-7 h-7" />}
  title="No hay productos"
  description="Crea tu primer producto para empezar a vender."
  action={<button className="...">Crear producto</button>}
/>
```

Pasalo como `empty` slot al `DataTable` para empty states ricos.

---

## 6. Skeletons

`src/components/ui/skeleton.tsx`

```tsx
<Skeleton className="h-4 w-32" />
<SkeletonRow columns={5} />
<SkeletonTable rows={10} columns={5} />
<SkeletonCard />
```

Usalos en lugar de spinners genéricos para carga inicial de listas/tablas.

---

## 7. Hooks de confirm / toast (recordatorio)

`src/components/ui/confirm-dialog.tsx` y `src/components/ui/toast.tsx`.

```tsx
const { confirm } = useConfirm();
const ok = await confirm({
  title: 'Anular factura',
  message: 'Esta acción no se puede deshacer.',
  variant: 'destructive',
  requireTyping: 'ANULAR',
});
if (ok) {
  await api.anular();
  toast({ tone: 'success', message: 'Factura anulada.' });
}
```

- `variant: 'destructive'` = botón rojo.
- `requireTyping: 'ANULAR'` = deshabilita el botón hasta que el usuario
  escriba exactamente "ANULAR".
- `toast({ tone })`: `'success' | 'error' | 'warning' | 'info'`. Default 3.8 s.

---

## 8. Reglas para Fase 22b/c/d

1. **No re-inventes una tabla custom.** Si necesitás `<table>`, primero pensá
   si el `DataTable` te resuelve.
2. **Si la página tiene paginación, sort o filtros**, usá `useDataTable`.
3. **Mobile**: probá la página a 375 px antes de marcar terminado. Si la tabla
   no tiene `cardRenderer` y los datos son largos, definí `mobilePriority`
   en las columns.
4. **Empty states**: usa `<EmptyState />` con icono + descripción + acción.
   Nunca un texto pelado "No hay datos".
5. **Loading**: nunca un spinner full-screen. Usa `<SkeletonTable />` o
   `<SkeletonCard />` para que la UI no salte.
6. **Confirmaciones destructivas**: `useConfirm` con `variant: 'destructive'`
   y `requireTyping` para acciones críticas (anular venta, eliminar branch,
   resetear inventario).
7. **Toasts**: feedback de éxito/error siempre vía `useToast`. Nunca
   `alert()` ni `confirm()` nativos.

---

## 9. Archivos creados / modificados en Fase 22a

```
src/components/ui/data-table.tsx                  (existente, expandido)
src/components/ui/data-table.helpers.ts           (nuevo · helpers puros)
src/components/ui/mobile-drawer.tsx               (existente)
src/components/ui/confirm-dialog.tsx              (mejorado · variant/requireTyping)
src/components/ui/toast.tsx                       (existente)
src/components/ui/empty-state.tsx                 (nuevo)
src/components/ui/skeleton.tsx                    (nuevo)
src/components/ui/__tests__/data-table.test.ts    (nuevo)

src/components/layout/MobileNavigation.tsx        (existente)
src/components/layout/HamburgerButton.tsx         (existente)
src/components/layout/Breadcrumbs.tsx             (nuevo)
src/components/layout/mobile-nav.helpers.ts       (nuevo)
src/components/layout/__tests__/mobile-nav.test.ts (nuevo)

src/hooks/useDataTable.ts                         (nuevo)

src/app/(dashboard)/layout.tsx                    (existente · usa MobileNavigation)
src/app/(dashboard)/pos/page.tsx                  (existente · responsive)
src/app/(dashboard)/sales/new/page.tsx            (existente · responsive)
```
