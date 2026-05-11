'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ClipboardCheck, Calendar, Loader2, CheckCircle2, 
  XCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface EmployeeAttendanceRecord {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
}

interface AttendanceRecord {
  employeeId: string;
  status: string;
}

export default function AttendancePage() {
  const [employees, setEmployees] = useState<EmployeeAttendanceRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        fetch('/api/hr/employees'),
        fetch(`/api/hr/attendance?date=${selectedDate.toISOString().split('T')[0]}`)
      ]);
      const empData = await empRes.json();
      const attData = await attRes.json();
      if (Array.isArray(empData)) setEmployees(empData);
      if (Array.isArray(attData)) setAttendance(attData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleMark = async (employeeId: string, status: string) => {
    try {
      const res = await fetch('/api/hr/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          date: selectedDate.toISOString(),
          status
        }),
      });
      if (res.ok) void fetchData();
    } catch (e) {
      alert('Error al marcar');
    }
  };

  const getStatus = (empId: string) => attendance.find((a) => a.employeeId === empId)?.status || 'PENDING';

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            Control de Asistencia
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Registro diario de entradas, salidas y puntualidad</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-2xl shadow-sm">
          <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-4 flex items-center gap-2 font-bold text-slate-700 min-w-[200px] justify-center">
            <Calendar className="w-4 h-4 text-blue-500" />
            {format(selectedDate, "eeee, dd 'de' MMMM", { locale: es })}
          </div>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Colaborador</th>
              <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado de Asistencia</th>
              <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones Rápidas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={3} className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-20" /></td></tr>
            ) : employees.map((emp) => {
              const status = getStatus(emp.id);
              return (
                <tr key={emp.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-xs">
                        {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{emp.firstName} {emp.lastName}</p>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{emp.position}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      status === 'PRESENT' ? 'bg-emerald-50 text-emerald-600' :
                      status === 'ABSENT' ? 'bg-rose-50 text-rose-600' :
                      status === 'LATE' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      {status === 'PRESENT' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                       status === 'ABSENT' ? <XCircle className="w-3.5 h-3.5" /> :
                       status === 'LATE' ? <Clock className="w-3.5 h-3.5" /> :
                       <AlertTriangle className="w-3.5 h-3.5" />}
                      {status === 'PRESENT' ? 'Presente' : 
                       status === 'ABSENT' ? 'Ausente' :
                       status === 'LATE' ? 'Tardanza' : 'Pendiente'}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleMark(emp.id, 'PRESENT')}
                        className={`p-2 rounded-xl transition-all ${status === 'PRESENT' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                        title="Marcar Presente"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleMark(emp.id, 'LATE')}
                        className={`p-2 rounded-xl transition-all ${status === 'LATE' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600'}`}
                        title="Marcar Tardanza"
                      >
                        <Clock className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleMark(emp.id, 'ABSENT')}
                        className={`p-2 rounded-xl transition-all ${status === 'ABSENT' ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20' : 'bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`}
                        title="Marcar Ausente"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
