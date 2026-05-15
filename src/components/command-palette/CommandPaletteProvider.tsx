'use client';

/**
 * Fase 22d-2 · Provider del Command Palette.
 *
 * Responsabilidades:
 *  - Mantener el estado `open` del palette en un solo lugar.
 *  - Registrar el listener global Cmd+K (mac) / Ctrl+K (win/linux) que
 *    abre o cierra el modal desde cualquier parte del dashboard.
 *  - Exponer un context con `open`, `setOpen`, `toggle` por si en el
 *    futuro queremos abrirlo desde un botón en la UI (ej. mobile).
 *  - Renderizar el `<CommandPalette>` controlado.
 *
 * Se monta dentro del layout del dashboard `(dashboard)/layout.tsx`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CommandPalette } from './CommandPalette';

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

/**
 * Hook utilitario para abrir el palette desde un botón externo.
 * Devuelve `null` si se usa fuera del provider, evitando crashes en
 * pruebas que monten componentes aislados.
 */
export function useCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((curr) => !curr), []);
  const close = useCallback(() => setOpen(false), []);

  // Listener global Cmd+K / Ctrl+K.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        // Evitamos chocar con el "Buscar" nativo del browser.
        e.preventDefault();
        setOpen((curr) => !curr);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {/* Monte/desmonte condicional: cada apertura es un mount fresh con
          estados iniciales vacíos. Evita el anti-pattern de setState dentro
          de un useEffect para resetear state al cambiar `open`. */}
      {open && <CommandPalette onClose={close} />}
    </CommandPaletteContext.Provider>
  );
}
