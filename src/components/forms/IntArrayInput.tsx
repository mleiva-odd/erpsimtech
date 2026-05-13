'use client';

/**
 * Fase 22a · Input multi-número con pills.
 *
 * Pensado para campos como `agingBucketDays` que en el schema son `Int[]`.
 * El usuario puede:
 *  - Tipear un número y Enter (o coma) para agregar.
 *  - Click en la X de una pill para borrar.
 *  - Drag-and-drop NO se soporta — orden es ascendente forzado al validar.
 *
 * Valida que sean enteros positivos y los mantiene únicos.
 */

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface IntArrayInputProps {
  value: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Si está deshabilitado (ej. permisos insuficientes). */
  disabled?: boolean;
  /** id para asociar label. */
  id?: string;
  ariaLabel?: string;
}

export function IntArrayInput({
  value,
  onChange,
  placeholder = 'Agregar número y Enter',
  min = 1,
  max = 9999,
  disabled = false,
  id,
  ariaLabel,
}: IntArrayInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = parseInt(raw.trim(), 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      setError('Debe ser un número entero.');
      return;
    }
    if (parsed < min || parsed > max) {
      setError(`Debe estar entre ${min} y ${max}.`);
      return;
    }
    if (value.includes(parsed)) {
      setError('Ya está en la lista.');
      return;
    }
    setError(null);
    const next = [...value, parsed].sort((a, b) => a - b);
    onChange(next);
    setDraft('');
  };

  const removeAt = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div>
      <div
        className={`flex flex-wrap gap-2 items-center px-3 py-2 border border-slate-200 rounded-xl bg-white min-h-[3rem] ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'focus-within:ring-2 focus-within:ring-blue-100'
        }`}
      >
        {value.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-200"
          >
            {v} días
            {!disabled && (
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label={`Quitar ${v} días`}
                className="text-blue-500 hover:text-blue-800"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          aria-label={ariaLabel || 'Agregar umbral en días'}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKey}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          className="flex-1 min-w-[6rem] outline-none text-sm bg-transparent disabled:cursor-not-allowed"
        />
      </div>
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
      <p className="text-[11px] text-slate-400 mt-1">
        Umbrales superiores (días). Ej: 30, 60, 90 genera buckets 1-30, 31-60, 61-90, +90.
      </p>
    </div>
  );
}
