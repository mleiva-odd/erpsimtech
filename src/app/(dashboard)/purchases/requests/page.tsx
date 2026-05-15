'use client';

/**
 * Fase 22b · Purchase Requests (Fase 19).
 *
 * PR listing + creación + acciones Approve / Reject / Convert-to-PO.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, X, Loader2, ArrowRight, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface PRItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number | string;
  estimatedUnitCost?: number | string | null;
  product?: { id: string; name: string; sku: string };
  variant?: { id: string; name: string } | null;
  notes?: string | null;
}

interface PR {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  supplier?: { id: string; name: string } | null;
  requestedBy?: { name?: string | null };
  approvedBy?: { name?: string | null } | null;
  items: PRItem[];
  supplierId?: string | null;
  rejectionReason?: string | null;
  purchaseOrder?: { id: string; status: string } | null;
}

interface SupplierOpt { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CONVERTED_TO_PO: 'Convertida a PO',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-100',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-100',
  CONVERTED_TO_PO: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function PurchaseRequestsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [prs, setPrs] = useState<PR[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedPr, setSelectedPr] = useState<PR | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const fetchPRs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/purchases/requests');
      const data = await res.json();
      if (Array.isArray(data)) setPrs(data);
      else if (Array.isArray(data?.items)) setPrs(data.items);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPRs(); }, [fetchPRs]);

  const columns: DataTableColumn<PR>[] = [
    {
      key: 'reason',
      header: 'Solicitud',
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
      key: 'requestedBy',
      header: 'Solicitante',
      accessor: (r) => r.requestedBy?.name ?? '—',
      exportValue: (r) => r.requestedBy?.name ?? '',
    },
    {
      key: 'supplier',
      header: 'Proveedor sugerido',
      accessor: (r) => r.supplier?.name ?? '—',
      exportValue: (r) => r.supplier?.name ?? '',
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      accessor: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
      exportValue: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
    },
    {
      key: 'items',
      header: 'Ítems',
      accessor: (r) => String(r.items.length),
    },
    {
      key: 'status',
      header: 'Estado',
      filterable: true,
      filterOptions: [
        { value: 'PENDING', label: 'Pendiente' },
        { value: 'APPROVED', label: 'Aprobada' },
        { value: 'REJECTED', label: 'Rechazada' },
        { value: 'CONVERTED_TO_PO', label: 'Convertida' },
        { value: 'CANCELLED', label: 'Cancelada' },
      ],
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span
          className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border ${
            STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-500'
          }`}
        >
          {STATUS_LABEL[r.status] || r.status}
        </span>
      ),
      exportValue: (r) => STATUS_LABEL[r.status] || r.status,
    },
  ];

  const filtered = filters.status ? prs.filter((p) => p.status === filters.status) : prs;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Compras', href: '/purchases' },
          { label: 'Solicitudes (PR)' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            Solicitudes de compra
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Workflow enterprise: PR → aprobación → PO.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/purchases')}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition"
          >
            Ver Órdenes (PO)
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Nueva PR
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        getRowId={(r) => r.id}
        onRowClick={(r) => setSelectedPr(r)}
        enableCsvExport
        enablePdfExport
        exportFileName="solicitudes_compra"
        emptyMessage="No hay solicitudes de compra."
        onFilter={setFilters}
      />

      {showNew && (
        <NewPRModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void fetchPRs();
            toast({ tone: 'success', message: 'Solicitud creada.' });
          }}
        />
      )}

      {selectedPr && (
        <PRDetailModal
          pr={selectedPr}
          onClose={() => setSelectedPr(null)}
          onRefresh={() => {
            void fetchPRs();
            setSelectedPr(null);
          }}
        />
      )}
    </div>
  );
}

function NewPRModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; estimatedUnitCost: number; notes: string; productName: string; productSku: string }>>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; sku: string; cost: number | string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => setSuppliers((d.suppliers || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

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
      if (!reason.trim()) throw new Error('Razón obligatoria');
      if (items.length === 0) throw new Error('Agrega al menos un ítem');
      const res = await fetch('/api/purchases/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: supplierId || null,
          reason,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            estimatedUnitCost: i.estimatedUnitCost || null,
            notes: i.notes || null,
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
          <h3 className="text-xl font-bold text-slate-900">Nueva solicitud de compra</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-auto flex-1">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Proveedor sugerido</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
            >
              <option value="">— Sin proveedor preferido —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Motivo / Justificación</label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none resize-none text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Agregar producto</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por SKU o nombre…"
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
                        setItems((curr) => [
                          ...curr,
                          {
                            productId: p.id,
                            quantity: 1,
                            estimatedUnitCost: Number(p.cost) || 0,
                            notes: '',
                            productName: p.name,
                            productSku: p.sku,
                          },
                        ]);
                      }
                      setSearch('');
                      setResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-white transition flex justify-between items-center"
                  >
                    <span className="text-sm">{p.name}</span>
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
                  <input
                    type="number"
                    step="0.01"
                    value={it.estimatedUnitCost}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setItems(items.map((x, i) => (i === idx ? { ...x, estimatedUnitCost: v } : x)));
                    }}
                    className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
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
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-slate-900 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear PR
          </button>
        </div>
      </div>
    </div>
  );
}

function PRDetailModal({ pr, onClose, onRefresh }: { pr: PR; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [showConvert, setShowConvert] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/requests/${pr.id}/approve`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'PR aprobada.' });
      onRefresh();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/requests/${pr.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: rejectReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'PR rechazada.' });
      onRefresh();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
      setShowReject(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <div>
            <h3 className="text-xl font-bold text-slate-900">PR #{pr.id.slice(0, 8).toUpperCase()}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {STATUS_LABEL[pr.status] || pr.status} · {format(new Date(pr.createdAt), 'dd/MM/yyyy')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 overflow-auto flex-1 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Razón</p>
            <p className="text-sm">{pr.reason}</p>
          </div>
          {pr.supplier && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Proveedor sugerido</p>
              <p className="text-sm">{pr.supplier.name}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ítems</p>
            <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
              {pr.items.map((it) => (
                <div key={it.id} className="p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold">{it.product?.name || it.productId}</p>
                    <p className="text-[10px] text-slate-500">{it.product?.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{Number(it.quantity)} u.</p>
                    {it.estimatedUnitCost != null && (
                      <p className="text-[10px] text-slate-500">~Q{Number(it.estimatedUnitCost).toFixed(2)}/u</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {pr.rejectionReason && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-sm text-rose-700">
              <p className="font-bold mb-1">Motivo de rechazo:</p>
              <p>{pr.rejectionReason}</p>
            </div>
          )}
          {pr.purchaseOrder && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-700">
              Esta PR ya fue convertida a PO {pr.purchaseOrder.id.slice(0, 8).toUpperCase()} (status {pr.purchaseOrder.status}).
            </div>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 flex flex-wrap gap-2">
          {pr.status === 'PENDING' && (
            <>
              <button
                disabled={busy}
                onClick={() => setShowReject(true)}
                className="flex-1 py-3 font-bold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition"
              >
                Rechazar
              </button>
              <button
                disabled={busy}
                onClick={approve}
                className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-xl shadow-md hover:bg-blue-700 transition"
              >
                Aprobar
              </button>
            </>
          )}
          {pr.status === 'APPROVED' && !pr.purchaseOrder && (
            <button
              onClick={() => setShowConvert(true)}
              className="w-full py-3 font-bold text-white bg-emerald-600 rounded-xl shadow-md hover:bg-emerald-700 transition flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" /> Convertir a PO
            </button>
          )}
        </div>

        {showReject && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h4 className="text-lg font-bold text-slate-900 mb-4">¿Rechazar PR?</h4>
              <textarea
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo"
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReject(false)} className="flex-1 py-2 bg-slate-50 rounded-lg font-bold text-slate-500">Cancelar</button>
                <button
                  disabled={busy || !rejectReason.trim()}
                  onClick={reject}
                  className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        )}

        {showConvert && (
          <ConvertToPOModal
            pr={pr}
            onClose={() => setShowConvert(false)}
            onConverted={() => {
              setShowConvert(false);
              onRefresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function ConvertToPOModal({
  pr,
  onClose,
  onConverted,
}: {
  pr: PR;
  onClose: () => void;
  onConverted: () => void;
}) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [supplierId, setSupplierId] = useState(pr.supplierId || '');
  const [landedCost, setLandedCost] = useState(0);
  const [items, setItems] = useState(
    pr.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      quantity: Number(it.quantity),
      cost: Number(it.estimatedUnitCost ?? 0),
      taxRate: 0.12,
      productName: it.product?.name || 'Producto',
      productSku: it.product?.sku || '',
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

  const convert = async () => {
    setBusy(true);
    setError('');
    try {
      if (!supplierId) throw new Error('Proveedor obligatorio');
      if (items.some((i) => i.cost <= 0)) throw new Error('Define un costo positivo en cada línea');
      const res = await fetch(`/api/purchases/requests/${pr.id}/convert-to-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          landedCost: landedCost || 0,
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId || null,
            quantity: i.quantity,
            cost: i.cost,
            taxRate: i.taxRate,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'PR convertida a PO.' });
      onConverted();
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
          <h3 className="text-xl font-bold text-slate-900">Convertir PR a PO</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 overflow-auto flex-1 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Proveedor</label>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
            >
              <option value="">Selecciona…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Landed cost (flete + aduana, opcional)</label>
            <input
              type="number"
              step="0.01"
              value={landedCost}
              onChange={(e) => setLandedCost(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none"
            />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ítems</p>
            {items.map((it, idx) => (
              <div key={idx} className="bg-slate-50 rounded-lg p-3 flex flex-wrap gap-2 items-center">
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
                <input
                  type="number"
                  step="0.01"
                  value={it.cost}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setItems(items.map((x, i) => (i === idx ? { ...x, cost: v } : x)));
                  }}
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button
            disabled={busy}
            onClick={convert}
            className="flex-1 py-3 font-bold text-white bg-emerald-600 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear PO
          </button>
        </div>
      </div>
    </div>
  );
}
