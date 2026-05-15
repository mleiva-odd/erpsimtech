'use client';

/**
 * Fase 22b · Attendance con DataTable + useDataTable.
 *
 * Endpoint `/api/hr/attendance` recibe `date` y retorna registros del día.
 * Combinamos empleados + asistencia client-side (cada fila = empleado).
 * Paginación client-side; reemplaza `alert()` por `useToast`.
 *
 * TODO Fase 24: agregar paginación servidor a /api/hr/employees + filtro por puesto.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ClipboardCheck, Calendar, CheckCircle2, XCircle, Clock,
  AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/toast';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

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

interface AttendanceRow extends EmployeeAttendanceRecord {
  status: string;
}

export default function AttendancePage() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [employees, setEmployees] = useState<EmployeeAttendanceRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [empRes, attRes] = await Promise.all([
        fetch('/api/hr/employees'),
        fetch(`/api/hr/attendance?date=${selectedDate.toISOString().split('T')[0]}`),
      ]);
      const empData = await empRes.json();
      const attData = await attRes.json();
      if (Array.isArray(empData)) setEmployees(empData);
      if (Array.isArray(attData)) setAttendance(attData);
    } catch (e) {
      console.error(e);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const rows: AttendanceRow[] = useMemo(
    () =>
      employees.map((emp) => ({
        ...emp,
        status: attendance.find((a) => a.employeeId === emp.id)?.status || 'PENDING',
      })),
    [employees, attendance],
  );

  const table = useDataTable<AttendanceRow>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, search }) => {
      const term = search.trim().toLowerCase();
      const filtered = term
        ? rows.filter(
            (r) =>
              `${r.firstName} ${r.lastName}`.toLowerCase().includes(term) ||
              (r.position && r.position.toLowerCase().includes(term)),
          )
        : rows;
      const start = (page - 1) * limit;
      return { data: filtered.slice(start, start + limit), total: filtered.length };
    },
  });

  // Cuando llegan rows (cambio de fecha), refrescamos
  useEffect(() => {
    void table.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const handleMark = async (employeeId: string, status: string) => {
    try {
      const res = await fetch('/api/hr/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          date: selectedDate.toISOString(),
          status,
        }),
      });
      if (res.ok) {
        toast({ tone: 'success', message: 'Asistencia actualizada.' });
        void loadData();
      } else {
        const data = await res.json();
        toast({ tone: 'error', message: data.error || 'Error al marcar' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de red al marcar asistencia.' });
    }
  };

  const columns: DataTableColumn<AttendanceRow>[] = [
    {
      key: 'name',
      header: 'Colaborador',
      mobilePriority: 'title',
      accessor: (emp) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-xs">
            {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{emp.firstName} {emp.lastName}</p>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{emp.position}</p>
          </div>
        </div>
      ),
      exportValue: (emp) => `${emp.firstName} ${emp.lastName}`,
    },
    {
      key: 'status',
      header: 'Estado',
      mobilePriority: 'highlight',
      accessor: (emp) => (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
            emp.status === 'PRESENT'
              ? 'bg-emerald-50 text-emerald-600'
              : emp.status === 'ABSENT'
                ? 'bg-rose-50 text-rose-600'
                : emp.status === 'LATE'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-slate-50 text-slate-400'
          }`}
        >
          {emp.status === 'PRESENT' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
            emp.status === 'ABSENT' ? <XCircle className="w-3.5 h-3.5" /> :
              emp.status === 'LATE' ? <Clock className="w-3.5 h-3.5" /> :
                <AlertTriangle className="w-3.5 h-3.5" />}
          {emp.status === 'PRESENT' ? 'Presente' :
            emp.status === 'ABSENT' ? 'Ausente' :
              emp.status === 'LATE' ? 'Tardanza' : 'Pendiente'}
        </div>
      ),
      exportValue: (emp) => emp.status,
    },
    {
      key: 'actions',
      header: 'Acciones',
      mobilePriority: 'meta',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (emp) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleMark(emp.id, 'PRESENT')}
            className={`p-2 rounded-xl transition-all ${
              emp.status === 'PRESENT'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
            aria-label="Marcar presente"
            title="Marcar Presente"
          >
            <CheckCircle2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleMark(emp.id, 'LATE')}
            className={`p-2 rounded-xl transition-all ${
              emp.status === 'LATE'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                : 'bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600'
            }`}
            aria-label="Marcar tardanza"
            title="Marcar Tardanza"
          >
            <Clock className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleMark(emp.id, 'ABSENT')}
            className={`p-2 rounded-xl transition-all ${
              emp.status === 'ABSENT'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                : 'bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600'
            }`}
            aria-label="Marcar ausente"
            title="Marcar Ausente"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      ),
      exportValue: () => '',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'RR.HH.', href: '/hr/employees' },
          { label: 'Asistencia' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            Control de Asistencia
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Registro diario de entradas, salidas y puntualidad
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-2xl shadow-sm">
          <button
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
            aria-label="Día anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-4 flex items-center gap-2 font-bold text-slate-700 min-w-[200px] justify-center">
            <Calendar className="w-4 h-4 text-blue-500" />
            {format(selectedDate, "eeee, dd 'de' MMMM", { locale: es })}
          </div>
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
            aria-label="Día siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={table.data}
        loading={table.loading}
        total={table.pagination.total}
        page={table.pagination.page}
        pageSize={table.pagination.limit}
        onPageChange={table.pagination.onPageChange}
        onPageSizeChange={table.pagination.onLimitChange}
        getRowId={(emp) => emp.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar colaborador o puesto...',
        }}
        empty={
          <EmptyState
            icon={<ClipboardCheck className="w-7 h-7" />}
            title="Sin colaboradores"
            description="Aún no hay personal registrado para marcar asistencia."
          />
        }
      />
    </div>
  );
}
