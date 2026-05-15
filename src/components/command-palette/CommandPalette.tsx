'use client';

/**
 * Fase 22d-2 · Command palette UI.
 *
 * Modal centrado tipo Spotlight/Linear/Raycast. Recibe estado controlado
 * desde el `CommandPaletteProvider`:
 *   - Cmd+K / Ctrl+K abre/cierra (registrado en el provider).
 *   - Esc cierra.
 *   - ↑/↓ navegan resultados.
 *   - Enter ejecuta el comando activo.
 *   - Click fuera cierra (handler del overlay).
 *   - Focus se mueve al input al abrir; Tab queda atrapado dentro del
 *     diálogo gracias al patrón input-único + onKeyDown a nivel raíz.
 *
 * El fuzzy search vive en `./commands.ts` para mantenerlo testeable.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, X, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type Command,
  type CommandCategory,
  type CustomerEntity,
  type ProductEntity,
  type SaleEntity,
  buildEntityCommands,
  filterCommandsByPermissions,
  getAllCommands,
  getRecentCommands,
  pushRecent,
  searchCommands,
} from './commands';

interface CommandPaletteProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  pages: 'Páginas',
  actions: 'Acciones',
  recent: 'Recientes',
  entities: 'Resultados',
};

/**
 * Orden de las categorías en el render.
 *  - Sin query: priorizamos `recent` arriba, luego páginas y acciones.
 *  - Con query: el orden es el mismo pero las entidades aparecen al final
 *    como "Resultados" (búsqueda async).
 *
 * El render computa dinámicamente cuáles van arriba según haya o no
 * query (ver `groupedCategories` abajo).
 */
const CATEGORY_ORDER_NO_QUERY: CommandCategory[] = [
  'recent',
  'actions',
  'pages',
  'entities',
];
const CATEGORY_ORDER_WITH_QUERY: CommandCategory[] = [
  'actions',
  'pages',
  'entities',
  'recent',
];

const ENTITY_DEBOUNCE_MS = 200;
const ENTITY_MIN_QUERY = 2;

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Entidades dinámicas resultantes del fetch async. Se setean desde un
  // handler de useEffect (debounce) — no es state derivado.
  const [entityCommands, setEntityCommands] = useState<Command[]>([]);

  // 1) Universo de comandos filtrado por permisos del usuario actual.
  const visibleCommands = useMemo<Command[]>(() => {
    const all = getAllCommands();
    const role = session?.user?.role ?? null;
    const permissions = session?.user?.permissions ?? [];
    return filterCommandsByPermissions(all, { role, permissions });
  }, [session]);

  // 2) Comandos recientes leídos de localStorage. Sólo válidos cuando
  //    NO hay query (al abrir el palette). Los obtenemos del catálogo
  //    filtrado por permisos para no exponer páginas a las que el usuario
  //    perdió acceso.
  const recentCommands = useMemo<Command[]>(() => {
    if (query.trim().length > 0) return [];
    return getRecentCommands(visibleCommands);
  }, [visibleCommands, query]);

  // 3) Resultados de comandos fijos (páginas/acciones) aplicando fuzzy.
  const baseResults = useMemo(() => {
    const scored = searchCommands(visibleCommands, query);
    return scored.map((s) => s.cmd);
  }, [visibleCommands, query]);

  // 4) Mezcla final: base + entidades dinámicas (sólo con query) +
  //    recientes (sólo sin query). Sin duplicar IDs.
  const results = useMemo<Command[]>(() => {
    const merged: Command[] = [];
    const seen = new Set<string>();
    const push = (cmd: Command) => {
      if (seen.has(cmd.id)) return;
      seen.add(cmd.id);
      merged.push(cmd);
    };
    for (const c of recentCommands) push(c);
    for (const c of baseResults) push(c);
    if (query.trim().length >= ENTITY_MIN_QUERY) {
      for (const c of entityCommands) push(c);
    }
    return merged;
  }, [recentCommands, baseResults, entityCommands, query]);

  // 5) Agrupado por categoría (para render). El orden de categorías
  //    cambia según haya o no query (recientes arriba sin query;
  //    resultados al fondo con query).
  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, Command[]>();
    for (const cmd of results) {
      const bucket = map.get(cmd.category) ?? [];
      bucket.push(cmd);
      map.set(cmd.category, bucket);
    }
    const order =
      query.trim().length === 0
        ? CATEGORY_ORDER_NO_QUERY
        : CATEGORY_ORDER_WITH_QUERY;
    const ordered: { category: CommandCategory; items: Command[] }[] = [];
    for (const cat of order) {
      const items = map.get(cat);
      if (items && items.length > 0) {
        ordered.push({ category: cat, items });
      }
    }
    return ordered;
  }, [results, query]);

  // 6) Lista plana (en el mismo orden visible) para indexar con ↑/↓.
  const flatList = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // safeActiveIndex deriva del state — si cambian los resultados y el
  // activeIndex queda fuera de rango, lo recortamos en render sin setState.
  // Evita el anti-pattern react-hooks/set-state-in-effect.
  const safeActiveIndex =
    flatList.length === 0 ? 0 : Math.min(activeIndex, flatList.length - 1);

  // Focus inicial al input al montar. Interactúa con DOM externo via ref,
  // NO setea state — patrón válido de useEffect.
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(id);
  }, []);

  // Auto-scroll del ítem activo dentro del contenedor con overflow.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-index="${safeActiveIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [safeActiveIndex, flatList.length]);

  // Fetch async de entidades (productos, clientes, ventas) con debounce
  // y AbortController. Se dispara recién cuando hay ≥ ENTITY_MIN_QUERY
  // caracteres. Los errores se silencian (no rompemos UX por una red caída).
  //
  // Nota sobre set-state-in-effect: el setState aquí es el patrón estándar
  // para data fetching nativo (sin librería de queries). NO está derivando
  // state — pone en state el RESULTADO de un side-effect (la red), que es
  // el caso de uso legítimo de useEffect. Cuando la query es muy corta o
  // se borra, NO limpiamos el state — las entities huérfanas se ignoran
  // en el merge (`results`) porque sólo se incluyen si la query es válida.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < ENTITY_MIN_QUERY) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void runEntityFetch(trimmed, controller.signal)
        .then((cmds) => {
          if (controller.signal.aborted) return;
          setEntityCommands(cmds);
        })
        .catch(() => {
          /* silencioso: errores de red no se muestran al usuario */
        });
    }, ENTITY_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const runCommand = useCallback(
    (cmd: Command) => {
      // Persistir como reciente sólo si NO es ya un comando "recent"
      // (que es un re-rendered de uno fijo) ni una entidad dinámica
      // (las entities no se persisten — sus IDs son volátiles).
      if (!cmd.id.startsWith('entity:')) {
        pushRecent(cmd.id);
      }
      onClose();
      // perform es síncrono y arbitrario; ejecutarlo después del
      // onClose evita parpadeos si dispara navegación.
      cmd.perform(router);
    },
    [onClose, router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((idx) =>
          flatList.length === 0 ? 0 : (idx + 1) % flatList.length,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((idx) =>
          flatList.length === 0
            ? 0
            : (idx - 1 + flatList.length) % flatList.length,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = flatList[safeActiveIndex];
        if (cmd) runCommand(cmd);
        return;
      }
      // Tab: lo dejamos para focus normal; como solo hay un input
      // dentro del diálogo, el browser lo retiene cíclicamente bien.
    },
    [safeActiveIndex, flatList, onClose, runCommand],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:pt-[12vh]"
      onMouseDown={(e) => {
        // Cerrar al clickear el overlay (no el panel).
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        style={{ maxHeight: 'min(70vh, 560px)' }}
      >
        {/* Input grande */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Buscar páginas, acciones, productos…"
            aria-label="Buscar"
            className="flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resultados */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain py-1"
          role="listbox"
          aria-label="Resultados"
        >
          {flatList.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              Sin resultados para “{query}”.
            </div>
          ) : (
            grouped.map((group) => (
              <CommandGroup key={group.category} label={CATEGORY_LABELS[group.category]}>
                {group.items.map((cmd) => {
                  const flatIdx = flatList.indexOf(cmd);
                  const isActive = flatIdx === activeIndex;
                  return (
                    <CommandItem
                      key={cmd.id}
                      cmd={cmd}
                      index={flatIdx}
                      active={isActive}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onSelect={() => runCommand(cmd)}
                    />
                  );
                })}
              </CommandGroup>
            ))
          )}
        </div>

        {/* Footer con hints */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <Hint icon={<CornerDownLeft className="h-3 w-3" />} label="Abrir" />
            <Hint
              icon={
                <span className="flex items-center">
                  <ArrowUp className="h-3 w-3" />
                  <ArrowDown className="h-3 w-3" />
                </span>
              }
              label="Navegar"
            />
            <Hint icon={<KbdLabel text="Esc" />} label="Cerrar" />
          </div>
          <div className="flex items-center gap-1">
            <KbdLabel text="⌘" />
            <KbdLabel text="K" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponentes                                                      */
/* ------------------------------------------------------------------ */

function CommandGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function CommandItem({
  cmd,
  index,
  active,
  onSelect,
  onMouseEnter,
}: {
  cmd: Command;
  index: number;
  active: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const Icon = cmd.icon;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-cmd-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        active ? 'bg-blue-50' : 'hover:bg-slate-50',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            active ? 'font-bold text-slate-900' : 'font-medium text-slate-800',
          )}
        >
          {cmd.title}
        </span>
        {cmd.description && (
          <span className="block truncate text-[11px] text-slate-500">
            {cmd.description}
          </span>
        )}
      </span>
      {cmd.shortcut && <KbdLabel text={cmd.shortcut} />}
    </button>
  );
}

function Hint({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center justify-center rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-500">
        {icon}
      </span>
      <span>{label}</span>
    </span>
  );
}

function KbdLabel({ text }: { text: string }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
      {text}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/* Fetch entidades                                                     */
/* ------------------------------------------------------------------ */

/**
 * Lanza los fetches en paralelo y devuelve la lista plana de Commands.
 * Cualquier endpoint que falle o devuelva una shape inesperada se ignora
 * (su slice queda vacío). El AbortSignal corta todas las requests cuando
 * el caller decide (cambio de query, unmount).
 *
 * Endpoints utilizados (Fase 22d-3):
 *   - GET /api/products?q={q}&limit=5     → `{ products: [...] }`
 *   - GET /api/customers?q={q}&limit=5    → `{ data: [...] }`
 *   - GET /api/sales?search={q}&limit=5   → `{ data: [...] }`
 *
 * `/api/suppliers` se omite porque su GET actual no acepta query string.
 */
async function runEntityFetch(
  q: string,
  signal: AbortSignal,
): Promise<Command[]> {
  const encoded = encodeURIComponent(q);

  const [productsResult, customersResult, salesResult] = await Promise.all([
    fetchProducts(encoded, signal),
    fetchCustomers(encoded, signal),
    fetchSales(encoded, signal),
  ]);

  return buildEntityCommands({
    products: productsResult,
    customers: customersResult,
    sales: salesResult,
  });
}

async function fetchProducts(
  encodedQuery: string,
  signal: AbortSignal,
): Promise<ProductEntity[]> {
  try {
    const res = await fetch(
      `/api/products?q=${encodedQuery}&limit=5`,
      { signal, credentials: 'same-origin' },
    );
    if (!res.ok) return [];
    const json: unknown = await res.json();
    if (
      json &&
      typeof json === 'object' &&
      Array.isArray((json as { products?: unknown }).products)
    ) {
      const raw = (json as { products: unknown[] }).products;
      return raw
        .map(toProductEntity)
        .filter((p): p is ProductEntity => p !== null);
    }
    return [];
  } catch {
    return [];
  }
}

async function fetchCustomers(
  encodedQuery: string,
  signal: AbortSignal,
): Promise<CustomerEntity[]> {
  try {
    const res = await fetch(
      `/api/customers?q=${encodedQuery}&limit=5`,
      { signal, credentials: 'same-origin' },
    );
    if (!res.ok) return [];
    const json: unknown = await res.json();
    if (
      json &&
      typeof json === 'object' &&
      Array.isArray((json as { data?: unknown }).data)
    ) {
      const raw = (json as { data: unknown[] }).data;
      return raw
        .map(toCustomerEntity)
        .filter((c): c is CustomerEntity => c !== null);
    }
    return [];
  } catch {
    return [];
  }
}

async function fetchSales(
  encodedQuery: string,
  signal: AbortSignal,
): Promise<SaleEntity[]> {
  try {
    // /api/sales usa `search` (no `q`) y devuelve `{ data: [...] }`.
    const res = await fetch(
      `/api/sales?search=${encodedQuery}&limit=5`,
      { signal, credentials: 'same-origin' },
    );
    if (!res.ok) return [];
    const json: unknown = await res.json();
    if (
      json &&
      typeof json === 'object' &&
      Array.isArray((json as { data?: unknown }).data)
    ) {
      const raw = (json as { data: unknown[] }).data;
      return raw
        .map(toSaleEntity)
        .filter((s): s is SaleEntity => s !== null);
    }
    return [];
  } catch {
    return [];
  }
}

function toProductEntity(raw: unknown): ProductEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    sku: typeof r.sku === 'string' ? r.sku : null,
  };
}

function toCustomerEntity(raw: unknown): CustomerEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    nit: typeof r.nit === 'string' ? r.nit : null,
    email: typeof r.email === 'string' ? r.email : null,
  };
}

function toSaleEntity(raw: unknown): SaleEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  let customer: { name?: string | null } | null = null;
  if (r.customer && typeof r.customer === 'object') {
    const c = r.customer as Record<string, unknown>;
    customer = {
      name: typeof c.name === 'string' ? c.name : null,
    };
  }
  let total: number | string | null = null;
  if (typeof r.total === 'number' || typeof r.total === 'string') {
    total = r.total;
  }
  return {
    id: r.id,
    invoiceNumber:
      typeof r.invoiceNumber === 'string' ? r.invoiceNumber : null,
    total,
    customer,
  };
}
