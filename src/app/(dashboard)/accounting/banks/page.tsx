'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Landmark, Wallet, CreditCard, Edit2, ShieldAlert, Banknote, History, ArrowRightLeft, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { BankModal } from '@/components/accounting/BankModal';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { format } from 'date-fns';

interface BankRecord {
  id: string;
  name: string;
  type: string;
  accountNumber: string | null;
  currency: string;
  balance: number;
  isActive: boolean;
  _count: {
    transactions: number;
  };
}

interface LedgerTransaction {
  id: string;
  type: string;
  amount: number | string;
  reference: string | null;
  description: string | null;
  createdAt: string;
  user?: {
    name: string;
  } | null;
}

export default function BanksPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const canManageTreasury = session?.user?.role === 'SUPER_ADMIN' || session?.user?.permissions?.includes('treasury:manage');
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankRecord | null>(null);

  // Transfer State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSource, setTransferSource] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Ledger State
  const [viewingBank, setViewingBank] = useState<BankRecord | null>(null);
  const [ledgerTx, setLedgerTx] = useState<LedgerTransaction[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const fetchBanks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/accounting/banks');
      if (res.ok) {
        const data = await res.json();
        setBanks(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  const openNewBank = () => {
    setEditingBank(null);
    setIsModalOpen(true);
  };

  const openEditBank = (bank: BankRecord) => {
    setEditingBank(bank);
    setIsModalOpen(true);
  };

  const openLedger = async (bank: BankRecord) => {
    setViewingBank(bank);
    setLoadingLedger(true);
    setLedgerTx([]);
    try {
      const res = await fetch(`/api/accounting/banks/${bank.id}/transactions?limit=100`);
      if (res.ok) setLedgerTx(await res.json());
    } catch(e) { console.error(e); }
    finally { setLoadingLedger(false); }
  };

  const executeTransfer = async () => {
    if (!transferSource || !transferTarget || transferSource === transferTarget) {
      toast({ tone: 'error', message: 'Selecciona cuentas origen y destino válidas y diferentes.' });
      return;
    }
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      toast({ tone: 'error', message: 'Ingresa un monto válido.' });
      return;
    }
    
    setTransferring(true);
    try {
      const res = await fetch('/api/accounting/banks/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceBankId: transferSource,
          targetBankId: transferTarget,
          amount: parseFloat(transferAmount),
          reference: transferRef,
        })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ tone: 'success', message: 'Traslado completado con éxito!' });
      setIsTransferModalOpen(false);
      setTransferSource('');
      setTransferTarget('');
      setTransferAmount('');
      setTransferRef('');
      fetchBanks();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error en traslado' });
    } finally {
      setTransferring(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'CASH_BOX': return <Banknote className="w-6 h-6 text-emerald-600" />;
      case 'CREDIT_CARD': return <CreditCard className="w-6 h-6 text-purple-400" />;
      case 'DIGITAL_WALLET': return <Wallet className="w-6 h-6 text-pink-400" />;
      default: return <Landmark className="w-6 h-6 text-blue-600" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'CASH_BOX': return 'Caja Física';
      case 'CREDIT_CARD': return 'Tarjeta de Crédito';
      case 'DIGITAL_WALLET': return 'Billetera Digital';
      default: return 'Cuenta Bancaria';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Contabilidad', href: '/accounting' },
          { label: 'Tesorería y Bancos' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Landmark className="w-7 h-7 text-blue-500" />
            Tesorería y Bancos
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Administra cuentas bancarias reales, cajas físicas y controla los saldos conciliables.
          </p>
        </div>
        {canManageTreasury && (
          <div className="flex gap-3">
            <Button 
              onClick={() => setIsTransferModalOpen(true)}
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Trasladar Fondos
            </Button>
            <Button 
              onClick={openNewBank}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Cuenta
            </Button>
          </div>
        )}
      </div>

      {!loading && banks.length === 0 && (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Landmark className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Sin Cuentas Registradas</h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-6">
            Registra tu primera cuenta bancaria o caja para poder procesar pagos de ventas con tarjeta o transferencia.
          </p>
          {canManageTreasury && (
            <Button onClick={openNewBank} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
              Crear Primera Cuenta
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {[...Array(3)].map((_, i) => (
             <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 h-40 animate-pulse">
                <div className="flex gap-4 items-center mb-4">
                   <div className="w-12 h-12 bg-slate-50 rounded-xl"></div>
                   <div className="space-y-2 flex-1">
                     <div className="h-4 bg-slate-50 rounded w-2/3"></div>
                     <div className="h-3 bg-slate-50 rounded w-1/2"></div>
                   </div>
                </div>
             </div>
           ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banks.map((bank) => (
            <div 
              key={bank.id} 
              className={`bg-white border rounded-2xl p-6 relative group transition-all ${
                bank.isActive 
                  ? 'border-slate-200 hover:border-slate-200 hover:shadow-lg' 
                  : 'border-red-200 opacity-70'
              }`}
            >
              {!bank.isActive && (
                <div className="absolute top-0 right-0 bg-red-50 text-red-700 text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-2xl border-b border-l border-red-200 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> INACTIVA
                </div>
              )}
              
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-4 items-center">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${
                    bank.type === 'CASH_BOX' ? 'bg-emerald-50' :
                    bank.type === 'CREDIT_CARD' ? 'bg-purple-50' :
                    bank.type === 'DIGITAL_WALLET' ? 'bg-pink-50' :
                    'bg-blue-50'
                  }`}>
                    {getIcon(bank.type)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">{bank.name}</h3>
                    <p className="text-slate-500 text-xs font-medium bg-slate-100 inline-block px-2 py-0.5 rounded mt-1">
                      {getTypeName(bank.type)}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                     onClick={() => openLedger(bank)}
                     className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                     title="Ver Historial"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  {canManageTreasury && (
                    <button 
                       onClick={() => openEditBank(bank)}
                       className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                       title="Editar Cuenta"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {bank.accountNumber && (
                <div className="mb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">No. de Cuenta</p>
                  <p className="text-slate-700 font-mono text-sm">{bank.accountNumber}</p>
                </div>
              )}

              <div className="flex items-end justify-between mt-auto pt-4 border-t border-slate-200">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Saldo en Sistema</p>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">
                    {bank.currency} {bank.balance.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Transacciones</p>
                  <p className="text-sm font-medium text-slate-700">{bank._count.transactions}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && canManageTreasury && (
        <BankModal 
          bank={editingBank}
          onClose={() => setIsModalOpen(false)} 
          onSaved={() => {
            setIsModalOpen(false);
            fetchBanks();
          }} 
        />
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && canManageTreasury && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 bg-black/60 backdrop-blur-sm">
           <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
               <h3 className="text-slate-900 font-bold flex items-center gap-2">
                 <ArrowRightLeft className="w-5 h-5 text-blue-500" /> Trasladar Fondos
               </h3>
             </div>
             <div className="p-6 space-y-4">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cuenta Origen (Sale)</label>
                 <select value={transferSource} onChange={e => setTransferSource(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-4 py-3 outline-none focus:border-blue-500">
                    <option value="">Seleccione origen...</option>
                    {banks.filter(b => b.isActive).map(b => (
                      <option key={b.id} value={b.id}>{b.name} (Q{b.balance})</option>
                    ))}
                 </select>
               </div>
               <div className="flex justify-center -my-2 relative z-10"><div className="bg-slate-50 p-2 rounded-full border border-slate-200"><ArrowDownLeft className="text-slate-500 w-4 h-4" /></div></div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cuenta Destino (Entra)</label>
                 <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-4 py-3 outline-none focus:border-blue-500">
                    <option value="">Seleccione destino...</option>
                    {banks.filter(b => b.isActive && b.id !== transferSource).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                 </select>
               </div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Monto del Traslado (Q)</label>
                 <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-4 py-3 outline-none focus:border-blue-500" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Responsable / Referencia</label>
                 <input type="text" value={transferRef} onChange={e => setTransferRef(e.target.value)} placeholder="Nombre mensajero, # de boleta, etc" className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-4 py-3 outline-none focus:border-blue-500" />
               </div>
             </div>
             <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
               <Button variant="outline" className="flex-1 bg-transparent border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setIsTransferModalOpen(false)}>Cancelar</Button>
               <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={transferring} onClick={executeTransfer}>
                 {transferring ? 'Trasladando...' : 'Confirmar Traslado'}
               </Button>
             </div>
           </div>
        </div>
      )}

      {/* Ledger Modal */}
      {viewingBank && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 bg-black/60 backdrop-blur-sm">
           <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col h-[80vh] overflow-hidden">
             <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
               <div>
                 <h3 className="text-slate-900 font-bold text-lg flex items-center gap-2">
                   <History className="w-5 h-5 text-blue-500" /> Libro Mayor: {viewingBank.name}
                 </h3>
                 <p className="text-sm text-slate-500 mt-1">Saldo Actual: <span className="font-bold text-slate-900">Q{viewingBank.balance}</span></p>
               </div>
               <button onClick={() => setViewingBank(null)} className="text-slate-500 hover:text-slate-900 p-2 bg-slate-50 rounded-xl">Cerrar</button>
             </div>
             <div className="flex-1 overflow-y-auto p-6 relative">
                {loadingLedger ? (
                  <div className="flex justify-center items-center h-full"><RefreshCw className="w-6 h-6 animate-spin text-slate-500" /></div>
                ) : ledgerTx.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <Banknote className="w-12 h-12 mb-3 opacity-20" />
                    <p>No hay registro de movimientos para esta cuenta.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ledgerTx.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 hover:bg-slate-100 transition">
                         <div className="flex gap-4 items-center">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'INCOME' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                             {tx.type === 'INCOME' ? <ArrowUpRight className="w-5 h-5 text-emerald-600" /> : <ArrowDownLeft className="w-5 h-5 text-red-600" />}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-slate-900">{tx.description || tx.reference || 'Ajuste de Sistema'}</p>
                             <div className="flex gap-3 text-xs text-slate-500 mt-1">
                               <span>{format(new Date(tx.createdAt), "dd/MM/yyyy HH:mm")}</span>
                               {tx.user?.name && <span>• Op: {tx.user.name}</span>}
                             </div>
                           </div>
                         </div>
                         <div className="text-right">
                           <p className={`text-lg font-bold ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                             {tx.type === 'INCOME' ? '+' : '-'}Q{Number(tx.amount).toFixed(2)}
                           </p>
                           <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">{tx.reference}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
