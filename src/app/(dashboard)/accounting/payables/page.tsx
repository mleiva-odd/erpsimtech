'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { CreditCard, RefreshCw, Plus, DollarSign, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface SupplierPayable {
  id: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  supplier: { name: string };
  user: { name: string };
  purchase: { id: string; reference: string } | null;
  payments: Array<{ id: string; amount: number; method: string; createdAt: string; status: string }>;
}

interface Supplier {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
  PARTIAL: { label: 'Parcial', color: 'bg-blue-100 text-blue-700', icon: <DollarSign className="w-3 h-3" /> },
  PAID: { label: 'Pagado', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  OVERDUE: { label: 'Vencido', color: 'bg-red-100 text-red-700', icon: <AlertTriangle className="w-3 h-3" /> },
};

export default function PayablesPage() {
  const { toast } = useToast();

  const [payables, setPayables] = useState<SupplierPayable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPayable, setTotalPayable] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  // New payable form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Payment form
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('TRANSFER');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  
  const [banks, setBanks] = useState<{id: string, name: string}[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const [payRes, supRes, bankRes] = await Promise.all([
        fetch(`/api/accounting/payables?${params}`),
        fetch('/api/suppliers'),
        fetch('/api/accounting/banks?active=true')
      ]);
      const payData = await payRes.json();
      const supData = await supRes.json();
      const bankData = await bankRes.json();
      setPayables(payData.data || []);
      setTotalPayable(payData.totalPayable || 0);
      setSuppliers(supData.suppliers || supData.data || []);
      setBanks(bankData.error ? [] : bankData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const createPayable = async () => {
    if (!newSupplierId || !newDescription.trim() || !newAmount) {
      toast({ tone: 'error', message: 'Proveedor, descripción y monto son obligatorios' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounting/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: newSupplierId,
          description: newDescription,
          totalAmount: parseFloat(newAmount),
          dueDate: newDueDate || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ tone: 'success', message: 'Cuenta por pagar registrada' });
      setShowNewForm(false);
      setNewDescription('');
      setNewAmount('');
      loadData();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  const makePayment = async (payableId: string) => {
    if (!payAmount || parseFloat(payAmount) <= 0) {
      toast({ tone: 'error', message: 'Monto inválido' });
      return;
    }
    if (!payBankAccountId) {
      toast({ tone: 'error', message: 'Debe elegir un Banco/Caja de origen' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/accounting/payables/${payableId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: parseFloat(payAmount), 
          method: payMethod,
          bankAccountId: payBankAccountId,
          reference: payReference,
          notes: payNotes
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ tone: 'success', message: 'Abono registrado correctamente' });
      setPayingId(null);
      setPayAmount('');
      setPayReference('');
      setPayNotes('');
      loadData();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error registrando abono' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidPayment = async (paymentId: string) => {
    if (!confirm('¿Seguro que deseas anular este pago al proveedor? El dinero se restiuirá al banco y la deuda regresará a Cuentas por Pagar.')) return;
    try {
      const res = await fetch(`/api/accounting/payables/payments/${paymentId}/reverse`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ tone: 'success', message: 'Pago anulado con éxito' });
      loadData();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error al anular' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-red-600" /> Cuentas por Pagar
          </h1>
          <p className="text-sm text-slate-500">Crédito con proveedores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4" /> Nueva Deuda
          </button>
        </div>
      </div>

      {/* Total KPI */}
      <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-500/20">
        <p className="text-red-100 text-xs font-bold uppercase tracking-widest">Total por Pagar</p>
        <p className="text-3xl font-bold mt-2">Q{totalPayable.toFixed(2)}</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: '', label: 'Todas' }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map(tab => (
          <button key={tab.value} onClick={() => setStatusFilter(tab.value)} className={`px-4 py-2 rounded-xl text-sm font-bold transition border ${statusFilter === tab.value ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Payables list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : payables.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500 text-sm">Sin cuentas por pagar.</div>
        ) : (
          payables.map(p => {
            const remaining = Number(p.totalAmount) - Number(p.paidAmount);
            const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.PENDING;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-800">{p.supplier.name}</h3>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg flex items-center gap-1 ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                    </div>
                    <p className="text-sm text-slate-600">{p.description}</p>
                    <div className="flex gap-4 text-[11px] text-slate-400 mt-2">
                      <span>{format(new Date(p.createdAt), "dd/MM/yyyy")}</span>
                      {p.dueDate && <span>Vence: {format(new Date(p.dueDate), "dd/MM/yyyy")}</span>}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all" style={{ width: `${(Number(p.paidAmount) / Number(p.totalAmount)) * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>Pagado: Q{Number(p.paidAmount).toFixed(2)}</span>
                      <span>Total: Q{Number(p.totalAmount).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="ml-4 text-right flex flex-col items-end gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Pendiente</p>
                      <p className="text-xl font-bold text-red-600">Q{remaining.toFixed(2)}</p>
                    </div>
                    {p.status !== 'PAID' && (
                      <button onClick={() => { setPayingId(p.id); setPayAmount(''); }} className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold hover:bg-green-100 transition">
                        Abonar
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment History */}
                {p.payments && p.payments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Últimos Abonos Registrados</p>
                    <div className="space-y-2">
                      {p.payments.map((pmt) => (
                        <div key={pmt.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg">
                          <div className="flex gap-2 items-center">
                            <span className={pmt.status === 'VOID' ? 'line-through text-slate-400' : 'text-slate-600 font-medium'}>
                              Q{Number(pmt.amount).toFixed(2)} - {format(new Date(pmt.createdAt), 'dd/MM/yyyy')}
                            </span>
                            {pmt.status === 'VOID' && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[9px] font-bold">ANULADO</span>}
                          </div>
                          {pmt.status !== 'VOID' && (
                            <button onClick={() => handleVoidPayment(pmt.id)} className="text-red-500 hover:text-red-700 font-medium underline">
                              Anular
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Payable Modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Nueva Cuenta por Pagar</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Proveedor</label>
                <select value={newSupplierId} onChange={e => setNewSupplierId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none">
                  <option value="">Seleccionar...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Descripción</label>
                <input value={newDescription} onChange={e => setNewDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Compra a crédito, factura #..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto (Q)</label>
                  <input type="number" step="0.01" min="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Vencimiento</label>
                  <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowNewForm(false)} className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
              <button onClick={createPayable} disabled={submitting} className="flex-1 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50">{submitting ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 border-b border-slate-100"><h2 className="text-lg font-bold text-slate-800">Registrar Abono</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto (Q)</label>
                <input type="number" step="0.01" min="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Método</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none">
                  <option value="CASH">Efectivo</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CARD">Tarjeta</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cuenta de Banco / Origen</label>
                <select value={payBankAccountId} onChange={e => setPayBankAccountId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none font-medium text-slate-800">
                  <option value="">Seleccione cuenta de origen</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              {payMethod !== 'CASH' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Referencia / No. de Boleta</label>
                  <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none" placeholder="No. de transferencia o comprobante" />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notas / Observaciones</label>
                <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none h-20 resize-none" placeholder="Opcional..." />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setPayingId(null)} className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
              <button onClick={() => makePayment(payingId)} disabled={submitting} className="flex-1 py-3 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition disabled:opacity-50">{submitting ? 'Procesando...' : 'Abonar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
