'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Plus, Loader2, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PayrollModal } from '@/components/hr/PayrollModal';
import { useToast } from '@/components/ui/toast';

interface PayrollSummary {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  totalDeductions: number | string;
  totalNet: number | string;
  _count?: {
    items: number;
  };
}

export default function PayrollPage() {
  const router = useRouter();
  const [payrolls, setPayrolls] = useState<PayrollSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const fetchPayrolls = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/hr/payroll');
      const data = await res.json();
      if (Array.isArray(data)) setPayrolls(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrolls();
  }, []);

  const onPayrollCreated = () => {
    setIsModalOpen(false);
    fetchPayrolls();
    toast({
      title: 'Planilla Generada',
      description: 'El ciclo de nómina se ha calculado correctamente.',
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Wallet className="w-6 h-6 text-blue-600" />
            Gestión de Planillas
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Procesamiento de nómina, bonificaciones y deducciones de ley</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-slate-500/20 flex items-center gap-2.5 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> 
          Generar Nueva Planilla
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div className="py-20 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-20" />
          </div>
        ) : payrolls.length > 0 ? (
          payrolls.map((pay) => (
            <div key={pay.id} 
                 onClick={() => router.push(`/hr/payroll/${pay.id}`)}
                 className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all flex flex-col md:flex-row items-center gap-8 cursor-pointer group">
              <div className="w-16 h-16 rounded-[1.5rem] bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Calendar className="w-8 h-8" />
              </div>
              
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-3 mb-1">
                  <h3 className="text-xl font-bold text-slate-900">{pay.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    pay.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 
                    pay.status === 'DRAFT' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {pay.status === 'PAID' ? 'Pagada' : pay.status === 'DRAFT' ? 'Borrador' : pay.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500 font-medium">
                  Periodo: {format(new Date(pay.startDate), 'dd MMM', { locale: es })} al {format(new Date(pay.endDate), 'dd MMM yyyy', { locale: es })}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-8 px-8 border-x border-slate-50 hidden lg:grid">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Colaboradores</span>
                  <span className="text-lg font-bold text-slate-700">{pay._count?.items || 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Deducciones</span>
                  <span className="text-lg font-bold text-rose-500">-Q{Number(pay.totalDeductions).toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total a Pagar</span>
                  <span className="text-lg font-bold text-emerald-600">Q{Number(pay.totalNet).toLocaleString()}</span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white rounded-2xl transition-all">
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm text-slate-300">
              <Wallet className="w-8 h-8" />
            </div>
            <p className="text-slate-400 font-medium">No has generado planillas todavía.</p>
            <p className="text-xs text-slate-400 mt-1">Comienza dando de alta a tus empleados y genera la primera planilla.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <PayrollModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={onPayrollCreated}
        />
      )}
    </div>
  );
}
