'use client';

/**
 * Fase 22b · Comisiones (Fase 20).
 */

import { useState, useEffect, useCallback } from 'react';
import { Award } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Commission {
  id: string;
  amount: number | string;
  status: string;
  paidAt?: string | null;
  createdAt: string;
  employee?: { id: string; firstName: string; lastName: string } | null;
  sale?: { id: string } | null;
  rule?: { id: string; name: string } | null;
}

interface EmployeeOpt { id: string; firstName: string; lastName: string }

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};
const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CommissionsPage() {
  const [data, setData] = useState<Commission[]>([]);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (employeeId) params.set('employeeId', employeeId);
      if (status) params.set('status', status);
      const res = await fetch(`/api/commissions?${params}`);
      const json = await res.json();
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [employeeId, status]);

  useEffect(() => { void fetchCommissions(); }, [fetchCommissions]);

  useEffect(() => {
    fetch('/api/hr/employees')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setEmployees(d))
      .catch(() => {});
  }, []);

  const columns: DataTableColumn<Commission>[] = [
    {
      key: 'employee',
      header: 'Empleado',
      mobilePriority: 'title',
      accessor: (r) => r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '—',
      exportValue: (r) => r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '',
    },
    {
      key: 'sale',
      header: 'Venta',
      accessor: (r) => r.sale ? <span className="font-mono text-xs">#{r.sale.id.slice(0, 8).toUpperCase()}</span> : '—',
      exportValue: (r) => r.sale?.id || '',
    },
    {
      key: 'rule',
      header: 'Regla',
      accessor: (r) => r.rule?.name || '—',
      exportValue: (r) => r.rule?.name || '',
    },
    {
      key: 'amount',
      header: 'Comisión',
      mobilePriority: 'highlight',
      accessor: (r) => <span className="font-bold text-emerald-600">{formatQ(r.amount)}</span>,
      exportValue: (r) => formatQ(r.amount),
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      accessor: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
      exportValue: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (r) => (
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border ${STATUS_BADGE[r.status] || 'bg-slate-100'}`}>
          {STATUS_LABEL[r.status] || r.status}
        </span>
      ),
      exportValue: (r) => STATUS_LABEL[r.status] || r.status,
    },
    {
      key: 'paidAt',
      header: 'Pagada',
      accessor: (r) => r.paidAt ? format(new Date(r.paidAt), 'dd/MM/yyyy') : '—',
      exportValue: (r) => r.paidAt ? format(new Date(r.paidAt), 'dd/MM/yyyy') : '',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/sales' },
          { label: 'Comisiones' },
        ]}
        className="mb-6"
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Award className="w-6 h-6 text-blue-600" /> Comisiones
        </h1>
        <p className="text-sm text-slate-500 mt-1">Reporte de comisiones generadas a partir de ventas facturadas.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
        >
          <option value="">Todos los empleados</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendientes</option>
          <option value="PAID">Pagadas</option>
          <option value="CANCELLED">Canceladas</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(r) => r.id}
        enableCsvExport
        enablePdfExport
        exportFileName="comisiones"
        emptyMessage="Sin comisiones registradas."
      />
    </div>
  );
}
