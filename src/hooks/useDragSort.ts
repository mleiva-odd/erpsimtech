import { useCallback, useState } from 'react';

/**
 * Fase 22d-4 · Hook reusable para reordenar arrays vía drag-and-drop nativo HTML5.
 *
 * Cero deps externas. La UI consumidora aplica los handlers devueltos en los
 * elementos draggable y usa `draggedIndex` / `hoveredIndex` para pintar el
 * feedback visual (opacidad, drop indicator).
 *
 * A11y: aria-grabbed / aria-dropeffect están deprecados (WAI-ARIA 1.1+). Se
 * documenta `aria-label` en el handle visual (ver `<DragHandle />`). Para una
 * solución 100% accesible habría que sumar control por teclado (flechas), pero
 * eso se difiere — el alcance de esta fase es mouse-only.
 *
 * Mobile: el drag-and-drop nativo HTML5 NO funciona bien en touch (los eventos
 * `dragstart` no se disparan en la mayoría de navegadores móviles sin
 * polyfills). Si el flujo mobile es crítico para algún formulario se debe
 * agregar fallback con flechas ↑/↓. En esta fase no se agrega — deuda.
 */
export interface DragSortHandlers {
  draggedIndex: number | null;
  hoveredIndex: number | null;
  onDragStart: (idx: number) => (e: React.DragEvent) => void;
  onDragOver: (idx: number) => (e: React.DragEvent) => void;
  onDrop: (idx: number) => (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function useDragSort<T>(
  items: T[],
  onReorder: (next: T[]) => void,
): DragSortHandlers {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const onDragStart = useCallback(
    (idx: number) => (e: React.DragEvent) => {
      setDraggedIndex(idx);
      // Algunos navegadores requieren setData para considerar el drag válido.
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const onDragOver = useCallback(
    (idx: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setHoveredIndex(idx);
    },
    [],
  );

  const onDrop = useCallback(
    (targetIdx: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const sourceIdx = draggedIndex;
      setDraggedIndex(null);
      setHoveredIndex(null);
      if (sourceIdx === null || sourceIdx === targetIdx) return;
      if (sourceIdx < 0 || sourceIdx >= items.length) return;
      if (targetIdx < 0 || targetIdx >= items.length) return;

      const next = items.slice();
      const [moved] = next.splice(sourceIdx, 1);
      // Después del splice, los índices >= sourceIdx están corridos -1. Para
      // insertar el item "antes del target original" calculamos el índice de
      // inserción ajustado.
      const insertAt = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
      next.splice(insertAt, 0, moved);
      onReorder(next);
    },
    [draggedIndex, items, onReorder],
  );

  const onDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setHoveredIndex(null);
  }, []);

  return { draggedIndex, hoveredIndex, onDragStart, onDragOver, onDrop, onDragEnd };
}
