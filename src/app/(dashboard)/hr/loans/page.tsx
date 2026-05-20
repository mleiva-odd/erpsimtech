'use client';

/**
 * Fase 22b · Préstamos a empleados (Fase 18).
 */

import { useState, useEffect, useCallback } from 'react';
import { HandCoins, Plus, X, Loader2 } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Loan {
  id: string;
  employeeId: string;
  amount: number | string;
  monthlyDeduction: number | string;
  balance: number | string;
  status: string;
  reason?: string | null;
  approvedAt?: string | null;
  cancelledAt?: string | null;
}

interface EmployeeOpt {
  id: string;
  firstName: string;
  lastName: string;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-100',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LoansPage() {
  const { toast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<Loan | null>(null);

  const fetchLoans = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/hr/loans?pageSize=100');
      const data = await res.json();
      setLoans(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/employees');
      const data = await res.json();
      if (Array.isArray(data)) {
        setEmployees(data.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName })));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchLoans();
    void fetchEmployees();
  }, [fetchLoans, fetchEmployees]);

  const employeeName = (id: string): string => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : id.slice(0, 8);
  };

  const handleCancel = async (loan: Loan) => {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/hr/loans/${loan.id}/cancel`, { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'Préstamo cancelado.' });
      void fetchLoans();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ tone: 'error', message: msg });
    } finally {
      setIsBusy(false);
      setConfirmCancel(null);
      setSelectedLoan(null);
    }
  };

  const columns: DataTableColumn<Loan>[] = [
    {
      key: 'employee',
      header: 'Empleado',
      mobilePriority: 'title',
      accessor: (r) => <span className="font-bold">{employeeName(r.employeeId)}</span>,
      exportValue: (r) => employeeName(r.employeeId),
    },
    { key: 'amount', header: 'Monto', accessor: (r) => formatQ(r.amount), exportValue: (r) => formatQ(r.amount) },
    {
      key: 'balance',
      header: 'Saldo',
      mobilePriority: 'highlight',
      accessor: (r) => <span className="font-bold text-rose-600">{formatQ(r.balance)}</span>,
      exportValue: (r) => formatQ(r.balance),
    },
    {
      key: 'monthlyDeduction',
      header: 'Cuota mensual',
      accessor: (r) => formatQ(r.monthlyDeduction),
      exportValue: (r) => formatQ(r.monthlyDeduction),
    },
    {
      key: 'status',
      header: 'Estado',
      filterable: true,
      filterOptions: [
        { value: 'ACTIVE', label: 'Activos' },
        { value: 'COMPLETED', label: 'Completados' },
        { value: 'CANCELLED', label: 'Cancelados' },
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
  ];

  const [filters, setFilters] = useState<Record<string, string>>({});
  const filtered = filters.status ? loans.filter((l) => l.status === filters.status) : loans;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'RRHH', href: '/hr/employees' },
          { label: 'Préstamos' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <HandCoins className="w-6 h-6 text-blue-600" />
            Préstamos a empleados
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Adelantos quincenales o préstamos descontados de planilla.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nuevo préstamo
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        getRowId={(r) => r.id}
        onRowClick={(r) => r.status === 'ACTIVE' && setSelectedLoan(r)}
        enableCsvExport
        enablePdfExport
        exportFileName="prestamos"
        emptyMessage="Sin préstamos registrados."
        onFilter={setFilters}
      />

      {showNew && (
        <NewLoanModal
          employees={employees}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void fetchLoans();
            toast({ tone: 'success', message: 'Préstamo registrado.' });
          }}
        />
      )}

      {selectedLoan && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Préstamo activo</h3>
                <p className="text-xs text-slate-500 mt-1">{employeeName(selectedLoan.employeeId)}</p>
              </div>
              <button onClick={() => setSelectedLoan(null)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="space-y-2 text-sm mb-6">
              <div className="flex justify-between"><dt className="text-slate-500">Monto</dt><dd className="font-bold">{formatQ(selectedLoan.amount)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Saldo</dt><dd className="font-bold text-rose-600">{formatQ(selectedLoan.balance)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Cuota</dt><dd className="font-bold">{formatQ(selectedLoan.monthlyDeduction)}</dd></div>
              {selectedLoan.reason && <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">{selectedLoan.reason}</div>}
            </dl>
            <button
              onClick={() => setConfirmCancel(selectedLoan)}
              className="w-full py-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-bold hover:bg-rose-100 transition"
            >
              Cancelar préstamo
            </button>
          </div>
        </div>
      )}

      {confirmCancel && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmCancel(null)}
          onConfirm={() => handleCancel(confirmCancel)}
          title="¿Cancelar préstamo?"
          message="El saldo pendiente quedará registrado como cancelado. Esta acción no se puede revertir."
          confirmText="Cancelar préstamo"
          variant="danger"
          isLoading={isBusy}
        />
      )}
    </div>
  );
}

function NewLoanModal({
  employees,
  onClose,
  onCreated,
}: {
  employees: EmployeeOpt[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [amount, setAmount] = useState(0);
  const [monthlyDeduction, setMonthly] = useState(0);
  const [reason, setReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    setError('');
    try {
      const res = await fetch('/api/hr/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, amount, monthlyDeduction, reason: reason || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Nuevo préstamo</h3>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Empleado</label>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none"
            >
              <option value="">Selecciona…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Monto total</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Cuota mensual</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={monthlyDeduction}
                onChange={(e) => setMonthly(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Motivo (opcional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none resize-none text-sm"
            />
          </div>
          {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
          <button
            type="submit"
            disabled={isBusy}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar préstamo'}
          </button>
        </form>
      </div>
    </div>
  );
}
