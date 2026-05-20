'use client';

/**
 * Fase 22d-5 · Gestión de plantillas de documentos.
 *
 * Lista DataTable con plantillas activas (todas las types). Permite filtrar
 * por type, editar nombre/descripción y desactivar (soft-delete).
 *
 * NO existe botón "Nueva" acá: las plantillas se crean desde el form de
 * origen (RFQ wizard, PR modal, etc.) con "Guardar como plantilla".
 */

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, Pencil, Power, X } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { DocumentTemplateType, TemplateItem } from '@/lib/templates/types';

interface TemplateRow {
  id: string;
  type: DocumentTemplateType;
  name: string;
  description: string | null;
  items: TemplateItem[];
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string | null } | null;
  isActive: boolean;
}

const TYPE_LABEL: Record<DocumentTemplateType, string> = {
  QUOTE: 'Cotización',
  SALE: 'Venta',
  RFQ: 'RFQ',
  PURCHASE_ORDER: 'Orden de compra',
  PURCHASE_REQUEST: 'Solicitud de compra',
};

const TYPE_BADGE: Record<DocumentTemplateType, string> = {
  QUOTE: 'bg-amber-50 text-amber-700 border-amber-100',
  SALE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  RFQ: 'bg-blue-50 text-blue-700 border-blue-100',
  PURCHASE_ORDER: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  PURCHASE_REQUEST: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function TemplatesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<DocumentTemplateType | ''>('');
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const url = typeFilter
        ? `/api/templates?type=${encodeURIComponent(typeFilter)}`
        : '/api/templates';
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Error al cargar.');
      }
      const list = Array.isArray(data?.templates) ? (data.templates as TemplateRow[]) : [];
      setRows(list);
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al cargar plantillas.',
      });
    } finally {
      setLoading(false);
    }
  }, [typeFilter, toast]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleDeactivate = async (tpl: TemplateRow) => {
    if (!confirm(`¿Desactivar la plantilla "${tpl.name}"?`)) return;
    try {
      const res = await fetch(`/api/templates/${tpl.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Error al desactivar.');
      }
      toast({ tone: 'success', message: 'Plantilla desactivada.' });
      void fetchAll();
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al desactivar.',
      });
    }
  };

  const columns: DataTableColumn<TemplateRow>[] = [
    {
      key: 'name',
      header: 'Nombre',
      mobilePriority: 'title',
      accessor: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 truncate max-w-xs">{r.name}</span>
          {r.description && (
            <span className="text-[11px] text-slate-500 truncate max-w-xs">{r.description}</span>
          )}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    {
      key: 'type',
      header: 'Tipo',
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span
          className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border ${
            TYPE_BADGE[r.type] || 'bg-slate-100 text-slate-500'
          }`}
        >
          {TYPE_LABEL[r.type] || r.type}
        </span>
      ),
      exportValue: (r) => TYPE_LABEL[r.type] || r.type,
    },
    {
      key: 'items',
      header: 'Ítems',
      accessor: (r) => String(Array.isArray(r.items) ? r.items.length : 0),
      exportValue: (r) => String(Array.isArray(r.items) ? r.items.length : 0),
    },
    {
      key: 'createdBy',
      header: 'Creada por',
      accessor: (r) => r.createdBy?.name ?? '—',
      exportValue: (r) => r.createdBy?.name ?? '',
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      accessor: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
      exportValue: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
    },
    {
      key: 'actions',
      header: 'Acciones',
      accessor: (r) => (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(r);
            }}
            aria-label={`Editar plantilla ${r.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleDeactivate(r);
            }}
            aria-label={`Desactivar plantilla ${r.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Plantillas' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            Plantillas de documentos
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Reusá items y configuración entre cotizaciones, ventas, RFQ y compras.
          </p>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DocumentTemplateType | '')}
          aria-label="Filtrar por tipo"
          className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
        >
          <option value="">Todas las plantillas</option>
          {(Object.keys(TYPE_LABEL) as DocumentTemplateType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        getRowId={(r) => r.id}
        emptyMessage="No hay plantillas registradas. Guardá una desde el form de origen (Compras → Nueva PR, RFQ, etc.)."
      />

      {editing && (
        <EditTemplateModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void fetchAll();
          }}
        />
      )}
    </div>
  );
}

interface EditTemplateModalProps {
  template: TemplateRow;
  onClose: () => void;
  onSaved: () => void;
}

function EditTemplateModal({ template, onClose, onSaved }: EditTemplateModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!name.trim()) {
      toast({ tone: 'error', message: 'Nombre obligatorio.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 409
            ? 'Ya existe otra plantilla activa con ese nombre.'
            : typeof data?.error === 'string'
              ? data.error
              : 'Error al guardar.';
        throw new Error(msg);
      }
      toast({ tone: 'success', message: 'Plantilla actualizada.' });
      onSaved();
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar plantilla"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex justify-between items-start">
          <h3 className="text-lg font-bold text-slate-900">Editar plantilla</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={busy}
            className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm"
              aria-label="Nombre"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">
              Descripción
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm resize-none"
              aria-label="Descripción"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Los ítems no se editan acá: para cambiar la composición, eliminá esta
            plantilla y guardá una nueva desde el form correspondiente.
          </p>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
