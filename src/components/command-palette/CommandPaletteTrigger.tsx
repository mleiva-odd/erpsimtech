'use client';

/**
 * Fase 22d-3 · Botón que abre el Command Palette.
 *
 * Diseño tipo Linear/Notion:
 *  - Desktop (sm+): icono Search + texto "Buscar..." + chip "⌘K" (mac) o
 *    "Ctrl K" (win/linux).
 *  - Mobile (< sm): solo el icono Search, sin texto ni chip.
 *
 * Se monta donde haya espacio en el header global. Es no-op si está
 * fuera del `CommandPaletteProvider` (devuelve null).
 */

import { useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandPalette } from './CommandPaletteProvider';

interface CommandPaletteTriggerProps {
  className?: string;
}

/**
 * Detecta si el usuario está en macOS para mostrar el chip ⌘K en lugar
 * de Ctrl K. Usa `useSyncExternalStore` (React 18+) — patrón idiomático
 * para leer APIs externas (`navigator`) sin disparar la regla
 * `react-hooks/set-state-in-effect`. El server snapshot devuelve `false`
 * para evitar mismatch de hidratación; el cliente lo corrige tras hydration.
 */
const navigatorSubscribe = () => () => {
  /* navigator no emite eventos; no hace falta suscribirse a nada. */
};

const getIsMacClient = (): boolean => {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  // navigator.platform es legacy pero el más robusto cross-browser.
  // userAgentData.platform sería ideal pero no está universalmente disponible.
  const platform =
    (nav.platform ?? '').toLowerCase() +
    ' ' +
    (nav.userAgent ?? '').toLowerCase();
  return /mac|iphone|ipad|ipod/.test(platform);
};

const getIsMacServer = (): boolean => false;

function useIsMac(): boolean {
  return useSyncExternalStore(navigatorSubscribe, getIsMacClient, getIsMacServer);
}

export function CommandPaletteTrigger({ className }: CommandPaletteTriggerProps) {
  const palette = useCommandPalette();
  const isMac = useIsMac();

  if (!palette) return null;

  const handleOpen = () => palette.setOpen(true);

  return (
    <>
      {/* Mobile (< sm): solo icono */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Abrir buscador (Cmd K)"
        className={cn(
          'sm:hidden inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700',
          className,
        )}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Desktop (sm+): icono + texto + chip */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Abrir buscador (Cmd K)"
        className={cn(
          'hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700',
          className,
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">Buscar...</span>
        <span className="ml-1 inline-flex items-center gap-0.5">
          {isMac ? (
            <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              ⌘K
            </kbd>
          ) : (
            <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              Ctrl K
            </kbd>
          )}
        </span>
      </button>
    </>
  );
}
