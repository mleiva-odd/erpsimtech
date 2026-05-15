'use client';

/**
 * Fase 22b · Detalle de empleado.
 *
 * Tabs:
 *  - Datos generales.
 *  - Saldo de vacaciones (devengadas vs gozadas).
 *  - Liquidación (simulador de indemnización + Bono14 prop + Aguinaldo prop +
 *    vacaciones no gozadas, con botón "Terminar empleado").
 */

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, User, Palmtree, FileText, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  baseSalary: number | string;
  bonusIncentive?: number | string;
  hireDate: string;
  terminationDate?: string | null;
  active?: boolean;
  documentId?: string | null;
  nit?: string | null;
}

interface Balance {
  hireDate: string;
  vacationDaysAccrued: number;
  vacationDaysTaken: number;
  vacationDaysAccruedComputed: number;
  vacationDaysAvailable: number;
}

interface LiquidationPreview {
  indemnizacion: number;
  bono14Proporcional: number;
  aguinaldoProporcional: number;
  vacacionesNoGozadas: number;
  total: number;
  yearsOfService: number;
}

type TabKey = 'general' | 'vacaciones' | 'liquidacion';

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('general');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEmployee = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/hr/employees/${id}`);
      const data = await res.json();
      if (res.ok) setEmployee(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`/api/hr/employees/${id}/balance`);
      const data = await res.json();
      if (res.ok) setBalance(data);
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  useEffect(() => {
    void fetchEmployee();
    void fetchBalance();
  }, [fetchEmployee, fetchBalance]);

  if (isLoading) {
    return (
      <div className="p-20 text-center">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-30" />
      </div>
    );
  }
  if (!employee) {
    return <div className="p-20 text-center text-slate-500">Empleado no encontrado</div>;
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'general', label: 'Datos generales', icon: <User className="w-4 h-4" /> },
    { key: 'vacaciones', label: 'Saldo de vacaciones', icon: <Palmtree className="w-4 h-4" /> },
    { key: 'liquidacion', label: 'Liquidación', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'RRHH', href: '/hr/employees' },
          { label: 'Empleados', href: '/hr/employees' },
          { label: `${employee.firstName} ${employee.lastName}` },
        ]}
        className="mb-6"
      />

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all hidden md:inline-flex"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="text-sm text-slate-500">{employee.position || 'Sin puesto'}</p>
        </div>
        {!employee.active && (
          <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-bold uppercase">
            Inactivo
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <div className="flex flex-wrap border-b border-slate-100">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 sm:px-6 py-3 text-sm font-bold transition border-b-2 ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700 bg-blue-50/30'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'general' && <GeneralTab employee={employee} />}
          {tab === 'vacaciones' && <VacationsTab balance={balance} />}
          {tab === 'liquidacion' && (
            <LiquidationTab
              employee={employee}
              balance={balance}
              onTerminated={() => {
                toast({ tone: 'success', message: 'Empleado terminado. Liquidación generada.' });
                router.push('/hr/employees');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ employee }: { employee: Employee }) {
  return (
    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <Item label="Correo" value={employee.email || '—'} />
      <Item label="Teléfono" value={employee.phone || '—'} />
      <Item label="DPI" value={employee.documentId || '—'} />
      <Item label="NIT" value={employee.nit || '—'} />
      <Item label="Salario base" value={formatQ(employee.baseSalary)} />
      <Item label="Bonificación incentivo" value={formatQ(employee.bonusIncentive ?? 0)} />
      <Item label="Fecha de contratación" value={format(new Date(employee.hireDate), 'dd/MM/yyyy')} />
      {employee.terminationDate && (
        <Item label="Fecha de terminación" value={format(new Date(employee.terminationDate), 'dd/MM/yyyy')} />
      )}
    </dl>
  );
}

function VacationsTab({ balance }: { balance: Balance | null }) {
  if (!balance) {
    return <p className="text-slate-500 text-sm">Cargando saldo…</p>;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card label="Días devengados" value={balance.vacationDaysAccruedComputed} tone="blue" />
        <Card label="Días gozados" value={balance.vacationDaysTaken} tone="rose" />
        <Card label="Disponibles" value={balance.vacationDaysAvailable} tone="emerald" />
      </div>
      <p className="text-xs text-slate-500">
        Devengados se calcula contra la fecha de contratación a hoy (15 días/año, art. 130 CT).
      </p>
    </div>
  );
}

function LiquidationTab({
  employee,
  balance,
  onTerminated,
}: {
  employee: Employee;
  balance: Balance | null;
  onTerminated: () => void;
}) {
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().slice(0, 10));
  const [averageSalary, setAverageSalary] = useState(Number(employee.baseSalary) || 0);
  const [preview, setPreview] = useState<LiquidationPreview | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reason, setReason] = useState('');

  const computePreview = () => {
    // cálculo cliente-side simplificado (consistente con lib/payroll/indemnizacion.ts)
    const hire = new Date(employee.hireDate);
    const end = new Date(terminationDate);
    if (Number.isNaN(end.getTime()) || end <= hire) {
      setPreview(null);
      return;
    }
    const ms = end.getTime() - hire.getTime();
    const years = ms / (1000 * 60 * 60 * 24 * 365.25);
    const avg = Math.max(0, averageSalary || 0);
    const base = Number(employee.baseSalary) || 0;
    const bonifIncentivo = Number(employee.bonusIncentive ?? 0);

    const indemnizacion = round2(avg * years);
    // Bono14 prop: período jul-jun, prop. de meses trabajados dentro del período actual.
    const bono14 = round2((base / 12) * Math.min(12, monthsBetween(hire, end) % 13));
    const aguinaldo = round2((base / 12) * Math.min(12, monthsBetween(hire, end) % 13));
    const accrued = balance?.vacationDaysAccruedComputed ?? 0;
    const taken = balance?.vacationDaysTaken ?? 0;
    const remaining = Math.max(0, accrued - taken);
    const daily = (base + bonifIncentivo) / 30;
    const vacacionesNoGozadas = round2(remaining * daily);
    const total = round2(indemnizacion + bono14 + aguinaldo + vacacionesNoGozadas);

    setPreview({
      indemnizacion,
      bono14Proporcional: bono14,
      aguinaldoProporcional: aguinaldo,
      vacacionesNoGozadas,
      total,
      yearsOfService: round2(years),
    });
  };

  const terminate = async () => {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/hr/employees/${employee.id}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminationDate,
          averageSalary,
          reason: reason || null,
          createPayroll: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      onTerminated();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al terminar empleado');
    } finally {
      setIsBusy(false);
      setConfirmEnd(false);
    }
  };

  if (employee.active === false) {
    return (
      <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-rose-700">
        <AlertTriangle className="w-6 h-6 mb-2" />
        <p className="font-bold">El empleado ya está marcado como inactivo.</p>
        {employee.terminationDate && (
          <p className="text-sm mt-1">
            Terminación: {format(new Date(employee.terminationDate), 'dd/MM/yyyy')}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Fecha de terminación</label>
          <input
            type="date"
            value={terminationDate}
            onChange={(e) => setTerminationDate(e.target.value)}
            className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Salario promedio últimos 6m</label>
          <input
            type="number"
            step="0.01"
            value={averageSalary}
            onChange={(e) => setAverageSalary(parseFloat(e.target.value) || 0)}
            className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={computePreview}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
          >
            Calcular preview
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
          <h4 className="font-bold text-slate-900 mb-4">Liquidación estimada · {preview.yearsOfService} años</h4>
          <dl className="space-y-2 text-sm">
            <Row label="Indemnización" value={preview.indemnizacion} />
            <Row label="Bono 14 proporcional" value={preview.bono14Proporcional} />
            <Row label="Aguinaldo proporcional" value={preview.aguinaldoProporcional} />
            <Row label="Vacaciones no gozadas" value={preview.vacacionesNoGozadas} />
          </dl>
          <div className="border-t border-slate-200 mt-4 pt-4 flex justify-between items-center">
            <span className="font-bold text-slate-700">Total</span>
            <span className="text-2xl font-bold text-emerald-600">{formatQ(preview.total)}</span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Razón (opcional)</label>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none resize-none text-sm"
        />
      </div>

      <button
        onClick={() => setConfirmEnd(true)}
        disabled={isBusy}
        className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition disabled:opacity-50"
      >
        Terminar empleado y generar planilla de indemnización
      </button>

      {confirmEnd && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmEnd(false)}
          onConfirm={terminate}
          title="¿Terminar empleado?"
          message="Se marcará como inactivo, se generará un Payroll INDEMNIZACION DRAFT y los valores quedarán pendientes de aprobación. Esta acción no se puede revertir desde la UI."
          confirmText="Terminar"
          variant="danger"
          isLoading={isBusy}
        />
      )}
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth()) +
    (b.getUTCDate() >= a.getUTCDate() ? 0 : -1)
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</dt>
      <dd className="text-slate-800 font-medium">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-bold">{formatQ(value)}</dd>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'rose' | 'emerald' }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`rounded-2xl p-5 border ${colors[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-70">{label}</div>
      <div className="text-3xl font-bold">{value.toFixed(1)}</div>
      <div className="text-xs mt-1 opacity-70">días</div>
    </div>
  );
}
