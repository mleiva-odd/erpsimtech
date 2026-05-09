'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { HandCoins, Search, RefreshCw, User } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface CustomerWithBalance {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  balance: number;
  accountPayments?: Array<{ id: string; amount: number; method: string; status: string; createdAt: string }>;
  sales: Array<{ id: string; total: number; createdAt: string }>;
}

export default function ReceivablesPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const canManageTreasury = session?.user?.role === 'SUPER_ADMIN' || session?.user?.permissions?.includes('treasury:manage');
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithBalance | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentBankAccountId, setPaymentBankAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [banks, setBanks] = useState<{id: string, name: string}[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resCust, resBank] = await Promise.all([
        fetch('/api/accounting/receivables?limit=100'),
        fetch('/api/accounting/banks?active=true')
      ]);
      const dataCust = await resCust.json();
      const dataBank = await resBank.json();
      setCustomers(dataCust.data || []);
      setBanks(dataBank.error ? [] : dataBank);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totalReceivable = customers.reduce((sum, c) => sum + Number(c.balance), 0);

  const filtered = customers.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const handlePayment = async () => {
    if (!selectedCustomer || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({ tone: 'error', message: 'Ingresa un monto válido' });
      return;
    }
    if (!paymentBankAccountId) {
      toast({ tone: 'error', message: 'Debes seleccionar el banco de destino' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/accounting/receivables/${selectedCustomer.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: parseFloat(paymentAmount), 
          method: paymentMethod,
          bankAccountId: paymentBankAccountId,
          reference: paymentReference,
          notes: paymentNotes
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast({ tone: 'success', message: 'Abono registrado correctamente' });
      setSelectedCustomer(null);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNotes('');
      loadData();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error registrando abono' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidPayment = async (paymentId: string) => {
    if (!confirm('¿Estás seguro de que deseas anular este abono? El saldo retornará a la cuenta del cliente y el dinero se restará de tesorería.')) return;
    try {
      const res = await fetch(`/api/accounting/receivables/payments/${paymentId}/reverse`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ tone: 'success', message: 'Abono anulado con éxito' });
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
            <HandCoins className="w-6 h-6 text-amber-600" /> Cuentas por Cobrar
          </h1>
          <p className="text-sm text-slate-500">Saldos pendientes de clientes</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Total KPI */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg shadow-amber-500/20">
        <p className="text-amber-100 text-xs font-bold uppercase tracking-widest">Total por Cobrar</p>
        <p className="text-3xl font-bold mt-2">Q{totalReceivable.toFixed(2)}</p>
        <p className="text-amber-200 text-sm mt-1">{customers.length} clientes con saldo</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl text-sm focus:border-blue-300 outline-none bg-white" />
      </div>

      {/* Customer list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500 text-sm">No hay clientes con saldo pendiente.</div>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 p-5 hover:border-amber-200 hover:shadow-lg hover:shadow-amber-500/5 transition">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <User className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{c.name}</h3>
                      <p className="text-xs text-slate-500">{c.phone || c.email || 'Sin contacto'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo</p>
                    <p className="text-xl font-bold text-amber-600">Q{Number(c.balance).toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">Límite: Q{Number(c.creditLimit).toFixed(2)}</p>
                  </div>
                  {canManageTreasury && (
                    <button onClick={() => { setSelectedCustomer(c); setPaymentAmount(''); }} className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold hover:bg-amber-100 transition">
                      Abonar
                    </button>
                  )}
                </div>
              </div>
              
              {/* Payment History */}
              {c.accountPayments && c.accountPayments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Últimos Abonos</p>
                  <div className="space-y-2">
                    {c.accountPayments.map(p => (
                      <div key={p.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg">
                        <div className="flex gap-2 items-center">
                          <span className={p.status === 'VOID' ? 'line-through text-slate-400' : 'text-slate-600 font-medium'}>
                            Q{Number(p.amount).toFixed(2)} - {format(new Date(p.createdAt), 'dd/MM/yyyy')}
                          </span>
                          {p.status === 'VOID' && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[9px] font-bold">ANULADO</span>}
                        </div>
                        {p.status !== 'VOID' && canManageTreasury && (
                          <button onClick={() => handleVoidPayment(p.id)} className="text-red-500 hover:text-red-700 font-medium underline">
                            Anular
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Payment Modal */}
      {selectedCustomer && canManageTreasury && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Registrar Abono</h2>
              <p className="text-sm text-slate-500 mt-1">{selectedCustomer.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-center">
                <p className="text-[10px] font-bold text-amber-500 uppercase">Saldo Pendiente</p>
                <p className="text-2xl font-bold text-amber-700">Q{Number(selectedCustomer.balance).toFixed(2)}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto del abono (Q)</label>
                <input type="number" step="0.01" min="0.01" max={Number(selectedCustomer.balance)} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Método de pago</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none">
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cuenta de Banco / Destino</label>
                <select value={paymentBankAccountId} onChange={e => setPaymentBankAccountId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm focus:border-blue-300 outline-none font-medium text-slate-800">
                  <option value="">Seleccione cuenta de destino...</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              {paymentMethod !== 'CASH' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Referencia / No. de Boleta</label>
                  <input type="text" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none" placeholder="No. de transferencia o voucher" />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notas / Observaciones</label>
                <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none h-20 resize-none" placeholder="Opcional..." />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setSelectedCustomer(null)} className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
              <button onClick={handlePayment} disabled={submitting} className="flex-1 py-3 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition disabled:opacity-50">
                {submitting ? 'Procesando...' : 'Registrar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
