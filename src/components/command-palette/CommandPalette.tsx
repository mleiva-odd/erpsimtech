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
  filterCommandsByPermissions,
  getAllCommands,
  searchCommands,
} from './commands';

interface CommandPaletteProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  pages: 'Páginas',
  actions: 'Acciones',
  recent: 'Recientes',
};

const CATEGORY_ORDER: CommandCategory[] = ['actions', 'pages', 'recent'];

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // 1) Universo de comandos filtrado por permisos del usuario actual.
  const visibleCommands = useMemo<Command[]>(() => {
    const all = getAllCommands();
    const role = session?.user?.role ?? null;
    const permissions = session?.user?.permissions ?? [];
    return filterCommandsByPermissions(all, { role, permissions });
  }, [session]);

  // 2) Resultados aplicando fuzzy search.
  const results = useMemo(() => {
    const scored = searchCommands(visibleCommands, query);
    return scored.map((s) => s.cmd);
  }, [visibleCommands, query]);

  // 3) Agrupado por categoría (para render). Mantiene orden por score
  //    dentro de cada grupo gracias a que `searchCommands` ya devolvió
  //    ordenado.
  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, Command[]>();
    for (const cmd of results) {
      const bucket = map.get(cmd.category) ?? [];
      bucket.push(cmd);
      map.set(cmd.category, bucket);
    }
    const ordered: { category: CommandCategory; items: Command[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = map.get(cat);
      if (items && items.length > 0) {
        ordered.push({ category: cat, items });
      }
    }
    return ordered;
  }, [results]);

  // 4) Lista plana (en el mismo orden visible) para indexar con ↑/↓.
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

  const runCommand = useCallback(
    (cmd: Command) => {
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
