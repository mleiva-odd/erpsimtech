'use client';

/**
 * Fase 22b · Payroll dashboard (Fase 18).
 *
 * Lista de planillas con DataTable + acciones por estado (Aprobar, Pagar,
 * Recalcular, exportar IGSS / CSV).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PayrollModal } from '@/components/hr/PayrollModal';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface PayrollSummary {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  payrollType?: string;
  totalGross: number | string;
  totalDeductions: number | string;
  totalNet: number | string;
  _count?: { items: number };
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobada',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-100',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-100',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayrollListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [payrolls, setPayrolls] = useState<PayrollSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const fetchPayrolls = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void fetchPayrolls();
  }, [fetchPayrolls]);

  const onCreated = () => {
    setIsModalOpen(false);
    void fetchPayrolls();
    toast({ tone: 'success', message: 'Planilla generada y calculada.' });
  };

  const columns: DataTableColumn<PayrollSummary>[] = [
    {
      key: 'name',
      header: 'Planilla',
      mobilePriority: 'title',
      accessor: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-800">{r.name}</span>
          <span className="text-[11px] text-slate-500">{r.payrollType || 'REGULAR'}</span>
        </div>
      ),
      exportValue: (r) => r.name,
    },
    {
      key: 'period',
      header: 'Período',
      accessor: (r) =>
        `${format(new Date(r.startDate), 'dd/MM/yyyy')} - ${format(new Date(r.endDate), 'dd/MM/yyyy')}`,
      exportValue: (r) =>
        `${format(new Date(r.startDate), 'dd/MM/yyyy')} - ${format(new Date(r.endDate), 'dd/MM/yyyy')}`,
    },
    {
      key: 'status',
      header: 'Estado',
      filterable: true,
      filterOptions: [
        { value: 'DRAFT', label: 'Borrador' },
        { value: 'APPROVED', label: 'Aprobada' },
        { value: 'PAID', label: 'Pagada' },
        { value: 'CANCELLED', label: 'Cancelada' },
      ],
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
    {
      key: 'empleados',
      header: 'Empleados',
      accessor: (r) => String(r._count?.items ?? 0),
    },
    {
      key: 'totalGross',
      header: 'Devengado',
      accessor: (r) => formatQ(r.totalGross),
      exportValue: (r) => formatQ(r.totalGross),
    },
    {
      key: 'totalNet',
      header: 'Neto',
      mobilePriority: 'highlight',
      accessor: (r) => <span className="font-bold text-emerald-600">{formatQ(r.totalNet)}</span>,
      exportValue: (r) => formatQ(r.totalNet),
    },
  ];

  const filtered = activeFilters.status
    ? payrolls.filter((p) => p.status === activeFilters.status)
    : payrolls;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'RRHH', href: '/hr/employees' },
          { label: 'Planillas' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Wallet className="w-6 h-6 text-blue-600" />
            Gestión de Planillas
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Procesamiento de nómina, bonificaciones y deducciones de ley
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nueva planilla
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/hr/payroll/${r.id}`)}
        enableCsvExport
        enablePdfExport
        exportFileName="planillas"
        emptyMessage="No hay planillas registradas todavía."
        onFilter={setActiveFilters}
      />

      {isModalOpen && (
        <PayrollModal onClose={() => setIsModalOpen(false)} onSuccess={onCreated} />
      )}
    </div>
  );
}
