'use client';

/**
 * Fase 22a · Botón hamburguesa para mobile header.
 */

import { Menu } from 'lucide-react';

interface HamburgerButtonProps {
  onClick: () => void;
  ariaLabel?: string;
}

export function HamburgerButton({
  onClick,
  ariaLabel = 'Abrir menú',
}: HamburgerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition md:hidden"
    >
      <Menu className="w-6 h-6" />
    </button>
  );
}
