'use client';

import { GripVertical } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

/**
 * Fase 22d-4 · Handle visual para drag-and-drop nativo.
 *
 * Renderiza un botón con el ícono `GripVertical`. El drag real lo dispara el
 * contenedor padre (que recibe `draggable` y los handlers del hook
 * `useDragSort`). Este componente solo aporta la pista visual + área de touch
 * grande + `aria-label`.
 *
 * Importante: NO ponemos `draggable` aquí porque el padre ya es draggable; si
 * pusiéramos draggable en el button anidado, algunos navegadores ignorarían el
 * dragstart del padre.
 */
type DragHandleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function DragHandle({ className = '', ...rest }: DragHandleProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Arrastrar para reordenar"
      className={
        'shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-600 transition p-1 rounded ' +
        className
      }
      {...rest}
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
}
