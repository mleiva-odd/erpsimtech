'use client';

/**
 * Fase 22a · Mobile drawer.
 *
 * Drawer lateral con backdrop, esc-to-close y trap básico de focus.
 * No reemplaza un modal completo — está pensado para sidebars / paneles
 * que slide-in desde la izquierda en mobile.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** ariaLabel del drawer para lectores de pantalla. */
  ariaLabel?: string;
  /** Mostrar botón de cerrar interno (default true). */
  showCloseButton?: boolean;
  /** Ancho máximo (default w-72). */
  widthClassName?: string;
}

export function MobileDrawer({
  open,
  onClose,
  children,
  ariaLabel = 'Menú',
  showCloseButton = true,
  widthClassName = 'w-72',
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);

    // Bloquear scroll del body
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco al drawer al abrir
    drawerRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar menú"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`relative h-full ${widthClassName} max-w-[85vw] bg-slate-900 text-slate-300 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200 focus:outline-none`}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="absolute top-3 right-3 z-10 p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
