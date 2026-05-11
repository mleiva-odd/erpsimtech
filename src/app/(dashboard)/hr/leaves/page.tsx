'use client';

import { useState, useEffect } from 'react';
import { 
  Palmtree, Plus, Loader2, Info
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LeaveModal } from '@/components/hr/LeaveModal';
import { useToast } from '@/components/ui/toast';

interface LeaveRecord {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  employee: {
    firstName: string;
    lastName: string;
  };
}

export default function LeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const fetchLeaves = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/hr/leaves');
      const data = await res.json();
      if (Array.isArray(data)) setLeaves(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Palmtree className="w-6 h-6 text-emerald-600" />
            Vacaciones y Permisos
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Gestión de ausencias, descansos y justificaciones médicas</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-emerald-500/10 flex items-center gap-2.5 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Solicitar Permiso
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-emerald-500 opacity-20" />
          </div>
        ) : leaves.length > 0 ? (
          leaves.map((leave) => (
            <div key={leave.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all group flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-sm">
                    {leave.employee.firstName.charAt(0)}{leave.employee.lastName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{leave.employee.firstName} {leave.employee.lastName}</h3>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{leave.type === 'VACATION' ? 'Vacaciones' : leave.type}</span>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                  leave.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                  leave.status === 'REJECTED' ? 'bg-rose-50 text-rose-600' :
                  'bg-amber-50 text-amber-600'
                }`}>
                  {leave.status === 'APPROVED' ? 'Aprobado' : leave.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-6">
                <div className="flex-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Desde</p>
                  <p className="text-xs font-bold text-slate-700">{format(new Date(leave.startDate), 'dd MMM yyyy', { locale: es })}</p>
                </div>
                <div className="w-px h-8 bg-slate-200"></div>
                <div className="flex-1 text-right">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Hasta</p>
                  <p className="text-xs font-bold text-slate-700">{format(new Date(leave.endDate), 'dd MMM yyyy', { locale: es })}</p>
                </div>
              </div>

              <div className="flex-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Info className="w-3 h-3" /> Motivo</p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed italic line-clamp-2">
                  &ldquo;{leave.reason || 'No se proporcionó motivo.'}&rdquo;
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-medium">No hay solicitudes registradas.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <LeaveModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); fetchLeaves(); toast({ title: 'Solicitud Registrada', message: 'La solicitud se ha guardado correctamente.' }); }}
        />
      )}
    </div>
  );
}
