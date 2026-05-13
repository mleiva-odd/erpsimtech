'use client';

/**
 * Fase 22b · RFQs (Fase 19).
 *
 * Listado de RFQs, creación, agregar cotizaciones de proveedores y adjudicar.
 */

import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Plus, X, Loader2, Trash2, Award } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';

interface RFQItem {
  id: string;
  productId: string;
  quantity: number | string;
  specifications?: string | null;
  product?: { id: string; name: string; sku: string };
}

interface Quote {
  id: string;
  supplierId: string;
  supplier: { id: string; name: string };
  validUntil?: string | null;
  notes?: string | null;
  total: number | string;
  items?: Array<{ productId: string; quantity: number | string; unitPrice: number | string }>;
}

interface RFQ {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  items: RFQItem[];
  quotes: Quote[];
  awardedQuoteId?: string | null;
}

interface SupplierOpt { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  AWARDED: 'Adjudicada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-amber-50 text-amber-700 border-amber-100',
  AWARDED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-100',
};

export default function RFQPage() {
  const { toast } = useToast();
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<RFQ | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const fetchRFQs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/purchases/rfq');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setRfqs(list);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRFQs(); }, [fetchRFQs]);

  const columns: DataTableColumn<RFQ>[] = [
    {
      key: 'reason',
      header: 'Asunto',
      mobilePriority: 'title',
      accessor: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 truncate max-w-xs">{r.reason}</span>
          <span className="text-[11px] text-slate-500">#{r.id.slice(0, 8).toUpperCase()}</span>
        </div>
      ),
      exportValue: (r) => r.reason,
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      accessor: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
      exportValue: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
    },
    { key: 'items', header: 'Ítems', accessor: (r) => String(r.items.length) },
    { key: 'quotes', header: 'Cotizaciones', accessor: (r) => String(r.quotes.length) },
    {
      key: 'status',
      header: 'Estado',
      filterable: true,
      filterOptions: [
        { value: 'OPEN', label: 'Abierta' },
        { value: 'AWARDED', label: 'Adjudicada' },
        { value: 'CANCELLED', label: 'Cancelada' },
      ],
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span
          className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border ${
            STATUS_BADGE[r.status] || 'bg-slate-100'
          }`}
        >
          {STATUS_LABEL[r.status] || r.status}
        </span>
      ),
      exportValue: (r) => STATUS_LABEL[r.status] || r.status,
    },
  ];

  const filtered = filters.status ? rfqs.filter((r) => r.status === filters.status) : rfqs;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ScrollText className="w-6 h-6 text-blue-600" />
            Cotizaciones (RFQ)
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Solicita cotización a varios proveedores y adjudica al mejor.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nuevo RFQ
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        getRowId={(r) => r.id}
        onRowClick={(r) => setSelected(r)}
        enableCsvExport
        enablePdfExport
        exportFileName="rfqs"
        emptyMessage="No hay solicitudes de cotización."
        onFilter={setFilters}
      />

      {showNew && (
        <NewRFQModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void fetchRFQs();
            toast({ tone: 'success', message: 'RFQ creada.' });
          }}
        />
      )}

      {selected && (
        <RFQDetailModal
          rfq={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            void fetchRFQs();
          }}
        />
      )}
    </div>
  );
}

function NewRFQModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; specifications: string; productName: string; productSku: string }>>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/products?q=${encodeURIComponent(search.trim())}&limit=10`)
        .then((r) => r.json())
        .then((d) => setResults(d.products || []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!reason.trim()) throw new Error('Asunto obligatorio');
      if (items.length === 0) throw new Error('Agrega al menos un ítem');
      const res = await fetch('/api/purchases/rfq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            specifications: i.specifications || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Nuevo RFQ</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-auto flex-1">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Asunto</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Buscar producto</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SKU o nombre…"
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
            />
            {results.length > 0 && (
              <div className="mt-2 bg-slate-50 rounded-xl divide-y divide-slate-100 max-h-40 overflow-auto">
                {results.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      if (!items.find((i) => i.productId === p.id)) {
                        setItems((curr) => [...curr, { productId: p.id, quantity: 1, specifications: '', productName: p.name, productSku: p.sku }]);
                      }
                      setSearch('');
                      setResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-white"
                  >
                    <span className="text-sm">{p.name}</span>{' '}
                    <span className="text-xs text-slate-500">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {items.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="bg-white rounded-lg p-3 flex flex-wrap gap-2 items-center">
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-bold">{it.productName}</p>
                    <p className="text-[10px] text-slate-500">{it.productSku}</p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setItems(items.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                    }}
                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-slate-900 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear RFQ
          </button>
        </div>
      </div>
    </div>
  );
}

function RFQDetailModal({ rfq, onClose, onRefresh }: { rfq: RFQ; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [busy, setBusy] = useState(false);

  const award = async (quoteId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${rfq.id}/award/${quoteId}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'Cotización adjudicada.' });
      onRefresh();
      onClose();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <div>
            <h3 className="text-xl font-bold text-slate-900">RFQ #{rfq.id.slice(0, 8).toUpperCase()}</h3>
            <p className="text-xs text-slate-500 mt-1">{rfq.reason}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 overflow-auto flex-1 space-y-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ítems solicitados</p>
            <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
              {rfq.items.map((it) => (
                <div key={it.id} className="p-3 flex justify-between items-center">
                  <p className="text-sm font-bold">{it.product?.name || it.productId}</p>
                  <p className="text-sm">{Number(it.quantity)} u.</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cotizaciones recibidas</p>
              {rfq.status === 'OPEN' && (
                <button
                  onClick={() => setShowAddQuote(true)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Agregar cotización
                </button>
              )}
            </div>
            {rfq.quotes.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Sin cotizaciones aún.</p>
            ) : (
              <div className="space-y-2">
                {rfq.quotes.map((q) => (
                  <div
                    key={q.id}
                    className={`rounded-xl p-4 border ${
                      rfq.awardedQuoteId === q.id ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className="font-bold">{q.supplier.name}</p>
                        <p className="text-xs text-slate-500">
                          {q.validUntil && `Vigente al ${format(new Date(q.validUntil), 'dd/MM/yyyy')}`}
                        </p>
                        {q.notes && <p className="text-xs text-slate-600 mt-1">{q.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">Q{Number(q.total).toFixed(2)}</p>
                        {rfq.status === 'OPEN' && rfq.awardedQuoteId !== q.id && (
                          <button
                            disabled={busy}
                            onClick={() => award(q.id)}
                            className="mt-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1"
                          >
                            <Award className="w-3 h-3" /> Adjudicar
                          </button>
                        )}
                        {rfq.awardedQuoteId === q.id && (
                          <span className="inline-block mt-2 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg">
                            Adjudicada
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showAddQuote && (
          <AddQuoteModal
            rfq={rfq}
            onClose={() => setShowAddQuote(false)}
            onAdded={() => {
              setShowAddQuote(false);
              onRefresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function AddQuoteModal({ rfq, onClose, onAdded }: { rfq: RFQ; onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(
    rfq.items.map((it) => ({
      productId: it.productId,
      productName: it.product?.name || 'Producto',
      productSku: it.product?.sku || '',
      quantity: Number(it.quantity),
      unitPrice: 0,
      deliveryDays: 0,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => setSuppliers((d.suppliers || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

  const total = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!supplierId) throw new Error('Proveedor obligatorio');
      if (items.some((i) => i.unitPrice < 0)) throw new Error('Precio inválido');
      const res = await fetch(`/api/purchases/rfq/${rfq.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          validUntil: validUntil || undefined,
          notes: notes || null,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            deliveryDays: i.deliveryDays || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'Cotización agregada.' });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Agregar cotización</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Proveedor</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
              >
                <option value="">Selecciona…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Válida hasta</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Precios por ítem</p>
            {items.map((it, idx) => (
              <div key={idx} className="bg-slate-50 rounded-lg p-3 flex flex-wrap gap-2 items-center">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-bold">{it.productName}</p>
                  <p className="text-[10px] text-slate-500">{it.productSku} · {it.quantity} u.</p>
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Precio unit."
                  value={it.unitPrice}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setItems(items.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)));
                  }}
                  className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Días"
                  value={it.deliveryDays}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 0;
                    setItems(items.map((x, i) => (i === idx ? { ...x, deliveryDays: v } : x)));
                  }}
                  className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Notas</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none resize-none text-sm"
            />
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm font-bold">Total</span>
            <span className="text-xl font-bold text-blue-700">Q{total.toFixed(2)}</span>
          </div>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cotización
          </button>
        </div>
      </div>
    </div>
  );
}
