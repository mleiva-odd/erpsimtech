'use client';

/**
 * Fase 22a · Reportes contables UI.
 *
 * 5 reportes en tabs: Balance General, P&L, Trial Balance, Libro Diario, Libro Mayor.
 * Cada uno consume el endpoint `/api/reports/accounting/*` y soporta:
 *  - Selector de período (rango de fechas).
 *  - Export CSV.
 *  - Export PDF con jsPDF + autotable.
 */

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  BarChart3, TrendingUp, FileText, BookOpen, BookText,
  RefreshCw, Download, FileText as FileTextIcon,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

type ReportTab = 'balance-sheet' | 'profit-loss' | 'trial-balance' | 'general-journal' | 'general-ledger';

const TABS: Array<{ id: ReportTab; label: string; icon: React.ReactNode; description: string }> = [
  {
    id: 'balance-sheet',
    label: 'Balance General',
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Activos, pasivos y patrimonio a una fecha de corte.',
  },
  {
    id: 'profit-loss',
    label: 'Estado de Resultados',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'Ingresos, egresos y utilidad neta del período.',
  },
  {
    id: 'trial-balance',
    label: 'Balance de Comprobación',
    icon: <FileText className="w-4 h-4" />,
    description: 'Cuentas con débitos, créditos y saldo natural.',
  },
  {
    id: 'general-journal',
    label: 'Libro Diario',
    icon: <BookOpen className="w-4 h-4" />,
    description: 'Asientos cronológicos del período.',
  },
  {
    id: 'general-ledger',
    label: 'Libro Mayor',
    icon: <BookText className="w-4 h-4" />,
    description: 'Movimientos por cuenta con saldo corriente.',
  },
];

function formatCurrency(value: unknown): string {
  const n = Number(value ?? 0);
  return `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(title: string, head: string[], body: string[][]) {
  const doc = new jsPDF({ orientation: head.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 14, 21);
  autoTable(doc, {
    head: [head],
    body,
    startY: 25,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 8 },
  });
  doc.save(`${title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function AccountingReportsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ReportTab>('balance-sheet');

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [accountCode, setAccountCode] = useState('1.1.01');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<unknown | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const qs = new URLSearchParams();
      switch (activeTab) {
        case 'balance-sheet':
          qs.set('date', dateTo);
          break;
        case 'profit-loss':
        case 'trial-balance':
        case 'general-journal':
          qs.set('from', dateFrom);
          qs.set('to', dateTo);
          break;
        case 'general-ledger':
          qs.set('from', dateFrom);
          qs.set('to', dateTo);
          qs.set('accountCode', accountCode);
          break;
      }
      const res = await fetch(`/api/reports/accounting/${activeTab}?${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ tone: 'error', message: err.error || 'Error cargando reporte.' });
        return;
      }
      setData(await res.json());
    } catch (e) {
      console.error(e);
      toast({ tone: 'error', message: 'Error de red cargando reporte.' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo, accountCode, toast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Contabilidad', href: '/accounting' },
          { label: 'Reportes' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reportes Contables</h1>
        <p className="text-sm text-slate-500">Estados financieros y libros contables</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
        {activeTab !== 'balance-sheet' && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
            {activeTab === 'balance-sheet' ? 'Fecha de corte' : 'Hasta'}
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>
        {activeTab === 'general-ledger' && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Código de cuenta</label>
            <input
              type="text"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              placeholder="1.1.01"
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none w-32"
            />
          </div>
        )}
        <button
          type="button"
          onClick={fetchReport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Cargando...' : 'Recargar'}
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 italic">{activeTabConfig.description}</p>

      {/* Report Content */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : !data ? (
          <p className="text-sm text-slate-400 text-center py-12">Sin datos para mostrar.</p>
        ) : (
          <>
            {activeTab === 'balance-sheet' && <BalanceSheetView data={data as BalanceSheetData} />}
            {activeTab === 'profit-loss' && <ProfitLossView data={data as ProfitLossData} />}
            {activeTab === 'trial-balance' && <TrialBalanceView data={data as TrialBalanceData} />}
            {activeTab === 'general-journal' && <GeneralJournalView data={data as GeneralJournalData} />}
            {activeTab === 'general-ledger' && <GeneralLedgerView data={data as GeneralLedgerData} />}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------- Views per report -------------------- */

interface AccountRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}
interface BalanceSheetData {
  cutoffDate: string;
  assets: AccountRow[];
  liabilities: AccountRow[];
  equity: AccountRow[];
  totals: { assets: number; liabilities: number; equity: number; liabilitiesPlusEquity: number };
  isBalanced: boolean;
}

function BalanceSheetView({ data }: { data: BalanceSheetData }) {
  const exportCsv = () => {
    const rows: string[][] = [['Código', 'Nombre', 'Tipo', 'Saldo']];
    [...data.assets, ...data.liabilities, ...data.equity].forEach((r) =>
      rows.push([r.code, r.name, r.type, Number(r.balance).toFixed(2)]),
    );
    rows.push(['', 'TOTAL ACTIVO', '', Number(data.totals.assets).toFixed(2)]);
    rows.push(['', 'TOTAL PASIVO + PATRIMONIO', '', Number(data.totals.liabilitiesPlusEquity).toFixed(2)]);
    downloadCsv('balance_general', rows);
  };
  const exportPdfRep = () => {
    downloadPdf(
      'Balance General',
      ['Código', 'Nombre', 'Tipo', 'Saldo'],
      [...data.assets, ...data.liabilities, ...data.equity].map((r) => [
        r.code,
        r.name,
        r.type,
        formatCurrency(r.balance),
      ]),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-500">Corte: {format(new Date(data.cutoffDate), 'dd/MM/yyyy')}</p>
          <p
            className={`text-xs font-bold ${
              data.isBalanced ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {data.isBalanced ? 'Balance cuadrado' : 'No cuadra'}
          </p>
        </div>
        <ExportButtons onCsv={exportCsv} onPdf={exportPdfRep} />
      </div>
      <SectionTable title="Activos" rows={data.assets} totalLabel="Total Activo" total={data.totals.assets} />
      <SectionTable
        title="Pasivos"
        rows={data.liabilities}
        totalLabel="Total Pasivo"
        total={data.totals.liabilities}
      />
      <SectionTable
        title="Patrimonio"
        rows={data.equity}
        totalLabel="Total Patrimonio"
        total={data.totals.equity}
      />
      <div className="border-t-2 border-slate-300 pt-3 flex justify-between font-bold text-lg">
        <span>TOTAL PASIVO + PATRIMONIO</span>
        <span>{formatCurrency(data.totals.liabilitiesPlusEquity)}</span>
      </div>
    </div>
  );
}

function SectionTable({
  title,
  rows,
  totalLabel,
  total,
}: {
  title: string;
  rows: AccountRow[];
  totalLabel: string;
  total: number;
}) {
  return (
    <div>
      <h3 className="font-bold text-slate-800 mb-2">{title}</h3>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-bold uppercase">Código</th>
              <th className="text-left px-3 py-2 font-bold uppercase">Nombre</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200">
            <tr>
              <td className="px-3 py-2 font-bold" colSpan={2}>
                {totalLabel}
              </td>
              <td className="px-3 py-2 text-right font-bold">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <div key={r.code} className="border border-slate-100 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-mono">{r.code}</p>
            <p className="text-sm font-bold text-slate-800">{r.name}</p>
            <p className="text-sm text-blue-600">{formatCurrency(r.balance)}</p>
          </div>
        ))}
        <div className="border-t pt-2 flex justify-between font-bold">
          <span>{totalLabel}</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

interface ProfitLossData {
  periodo: { desde: string; hasta: string };
  ventas: { brutas: number; netas: number; impuestos: number; descuentos: number; cantidadVentas: number };
  cogs: number;
  margenBruto: number;
  margenBrutoPct: number;
  ingresos: { total: number; porCategoria: Array<{ nombre: string; total: number; entries: number }> };
  egresos: { total: number; porCategoria: Array<{ nombre: string; total: number; entries: number }> };
  utilidadNeta: number;
}

function ProfitLossView({ data }: { data: ProfitLossData }) {
  const exportCsv = () => {
    const rows: string[][] = [['Concepto', 'Monto']];
    rows.push(['Ventas brutas', Number(data.ventas.brutas).toFixed(2)]);
    rows.push(['COGS', Number(data.cogs).toFixed(2)]);
    rows.push(['Margen Bruto', Number(data.margenBruto).toFixed(2)]);
    rows.push(['Ingresos totales', Number(data.ingresos.total).toFixed(2)]);
    data.ingresos.porCategoria.forEach((c) => rows.push([`  ${c.nombre}`, Number(c.total).toFixed(2)]));
    rows.push(['Egresos totales', Number(data.egresos.total).toFixed(2)]);
    data.egresos.porCategoria.forEach((c) => rows.push([`  ${c.nombre}`, Number(c.total).toFixed(2)]));
    rows.push(['Utilidad neta', Number(data.utilidadNeta).toFixed(2)]);
    downloadCsv('estado_resultados', rows);
  };
  const exportPdfRep = () => {
    const body: string[][] = [];
    body.push(['Ventas brutas', formatCurrency(data.ventas.brutas)]);
    body.push(['COGS', formatCurrency(data.cogs)]);
    body.push(['Margen Bruto', formatCurrency(data.margenBruto)]);
    body.push(['Ingresos totales', formatCurrency(data.ingresos.total)]);
    data.ingresos.porCategoria.forEach((c) => body.push([`  ${c.nombre}`, formatCurrency(c.total)]));
    body.push(['Egresos totales', formatCurrency(data.egresos.total)]);
    data.egresos.porCategoria.forEach((c) => body.push([`  ${c.nombre}`, formatCurrency(c.total)]));
    body.push(['Utilidad neta', formatCurrency(data.utilidadNeta)]);
    downloadPdf('Estado de Resultados', ['Concepto', 'Monto'], body);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {format(new Date(data.periodo.desde), 'dd/MM/yyyy')} —{' '}
          {format(new Date(data.periodo.hasta), 'dd/MM/yyyy')}
        </p>
        <ExportButtons onCsv={exportCsv} onPdf={exportPdfRep} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Ventas brutas" value={formatCurrency(data.ventas.brutas)} />
        <KpiCard label="COGS" value={formatCurrency(data.cogs)} tone="rose" />
        <KpiCard
          label={`Margen bruto (${((data.margenBrutoPct || 0) * 100).toFixed(1)}%)`}
          value={formatCurrency(data.margenBruto)}
          tone="emerald"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-bold text-slate-800 mb-2">Ingresos por categoría</h3>
          <CategoryList rows={data.ingresos.porCategoria} total={data.ingresos.total} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 mb-2">Egresos por categoría</h3>
          <CategoryList rows={data.egresos.porCategoria} total={data.egresos.total} />
        </div>
      </div>
      <div className="border-t-2 pt-3 flex justify-between font-bold text-lg">
        <span>UTILIDAD NETA</span>
        <span className={data.utilidadNeta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
          {formatCurrency(data.utilidadNeta)}
        </span>
      </div>
    </div>
  );
}

function CategoryList({
  rows,
  total,
}: {
  rows: Array<{ nombre: string; total: number; entries: number }>;
  total: number;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 italic">Sin movimientos.</p>;
  }
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between text-sm border-b border-slate-50 py-1">
          <span>{r.nombre}</span>
          <span className="font-bold">{formatCurrency(r.total)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone = 'blue' }: { label: string; value: string; tone?: 'blue' | 'rose' | 'emerald' }) {
  const colors = {
    blue: 'border-blue-100 text-blue-600',
    rose: 'border-rose-100 text-rose-600',
    emerald: 'border-emerald-100 text-emerald-600',
  } as const;
  return (
    <div className={`bg-white border ${colors[tone]} rounded-2xl p-4`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

interface TrialBalanceData {
  rows: Array<AccountRow & { accountId: string }>;
  totals: { debit: number; credit: number };
  isBalanced: boolean;
}

function TrialBalanceView({ data }: { data: TrialBalanceData }) {
  const exportCsv = () => {
    const rows: string[][] = [['Código', 'Cuenta', 'Tipo', 'Débito', 'Crédito', 'Saldo']];
    data.rows.forEach((r) =>
      rows.push([
        r.code,
        r.name,
        r.type,
        Number(r.debit).toFixed(2),
        Number(r.credit).toFixed(2),
        Number(r.balance).toFixed(2),
      ]),
    );
    rows.push(['', 'TOTAL', '', Number(data.totals.debit).toFixed(2), Number(data.totals.credit).toFixed(2), '']);
    downloadCsv('balance_comprobacion', rows);
  };
  const exportPdfRep = () => {
    downloadPdf(
      'Balance de Comprobación',
      ['Código', 'Cuenta', 'Tipo', 'Débito', 'Crédito', 'Saldo'],
      data.rows.map((r) => [
        r.code,
        r.name,
        r.type,
        formatCurrency(r.debit),
        formatCurrency(r.credit),
        formatCurrency(r.balance),
      ]),
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <p
          className={`text-xs font-bold ${
            data.isBalanced ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {data.isBalanced ? 'Cuadrado' : 'No cuadra'}
        </p>
        <ExportButtons onCsv={exportCsv} onPdf={exportPdfRep} />
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-bold uppercase">Código</th>
              <th className="text-left px-3 py-2 font-bold uppercase">Cuenta</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Débito</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Crédito</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.accountId}>
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.debit)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.credit)}</td>
                <td className="px-3 py-2 text-right font-bold">{formatCurrency(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 font-bold">
            <tr>
              <td colSpan={2} className="px-3 py-2">
                TOTAL
              </td>
              <td className="px-3 py-2 text-right">{formatCurrency(data.totals.debit)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(data.totals.credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="md:hidden space-y-2">
        {data.rows.map((r) => (
          <div key={r.accountId} className="border border-slate-100 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-mono">{r.code}</p>
            <p className="text-sm font-bold">{r.name}</p>
            <div className="text-xs text-slate-500 grid grid-cols-2 gap-2 mt-1">
              <span>Débito: {formatCurrency(r.debit)}</span>
              <span>Crédito: {formatCurrency(r.credit)}</span>
            </div>
            <p className="text-sm font-bold text-blue-600 mt-1">{formatCurrency(r.balance)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GeneralJournalData {
  data: Array<{
    id: string;
    date: string;
    description: string;
    referenceType: string | null;
    referenceId: string | null;
    lines: Array<{
      debit: number;
      credit: number;
      account: { code: string; name: string; type: string };
    }>;
  }>;
  total: number;
  page: number;
  totalPages: number;
}

function GeneralJournalView({ data }: { data: GeneralJournalData }) {
  const exportCsv = () => {
    const rows: string[][] = [['Fecha', 'Asiento', 'Cuenta', 'Descripción', 'Débito', 'Crédito']];
    data.data.forEach((j) => {
      j.lines.forEach((l) => {
        rows.push([
          format(new Date(j.date), 'dd/MM/yyyy'),
          j.id.slice(0, 8),
          `${l.account.code} ${l.account.name}`,
          j.description,
          Number(l.debit).toFixed(2),
          Number(l.credit).toFixed(2),
        ]);
      });
    });
    downloadCsv('libro_diario', rows);
  };
  const exportPdfRep = () => {
    const body: string[][] = [];
    data.data.forEach((j) => {
      j.lines.forEach((l) => {
        body.push([
          format(new Date(j.date), 'dd/MM/yyyy'),
          j.id.slice(0, 8),
          `${l.account.code} ${l.account.name}`,
          j.description,
          formatCurrency(l.debit),
          formatCurrency(l.credit),
        ]);
      });
    });
    downloadPdf(
      'Libro Diario',
      ['Fecha', 'Asiento', 'Cuenta', 'Descripción', 'Débito', 'Crédito'],
      body,
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <p className="text-xs text-slate-500">{data.total} asientos</p>
        <ExportButtons onCsv={exportCsv} onPdf={exportPdfRep} />
      </div>
      <div className="space-y-3">
        {data.data.map((j) => (
          <div key={j.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs text-slate-400">{format(new Date(j.date), 'dd/MM/yyyy')}</p>
                <p className="font-bold text-sm text-slate-800">{j.description}</p>
              </div>
              <p className="text-xs text-slate-400 font-mono">{j.id.slice(0, 8)}</p>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {j.lines.map((l, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="py-1 font-mono text-slate-500">{l.account.code}</td>
                    <td className="py-1">{l.account.name}</td>
                    <td className="py-1 text-right">{Number(l.debit) > 0 ? formatCurrency(l.debit) : ''}</td>
                    <td className="py-1 text-right">{Number(l.credit) > 0 ? formatCurrency(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GeneralLedgerData {
  account: { code: string; name: string; type: string };
  movements: Array<{
    journalId: string;
    date: string;
    description: string;
    referenceType: string | null;
    debit: number;
    credit: number;
    balance: number;
  }>;
  finalBalance: number;
}

function GeneralLedgerView({ data }: { data: GeneralLedgerData }) {
  const exportCsv = () => {
    const rows: string[][] = [['Fecha', 'Descripción', 'Débito', 'Crédito', 'Saldo']];
    data.movements.forEach((m) =>
      rows.push([
        format(new Date(m.date), 'dd/MM/yyyy'),
        m.description,
        Number(m.debit).toFixed(2),
        Number(m.credit).toFixed(2),
        Number(m.balance).toFixed(2),
      ]),
    );
    downloadCsv(`libro_mayor_${data.account.code}`, rows);
  };
  const exportPdfRep = () => {
    downloadPdf(
      `Libro Mayor ${data.account.code} ${data.account.name}`,
      ['Fecha', 'Descripción', 'Débito', 'Crédito', 'Saldo'],
      data.movements.map((m) => [
        format(new Date(m.date), 'dd/MM/yyyy'),
        m.description,
        formatCurrency(m.debit),
        formatCurrency(m.credit),
        formatCurrency(m.balance),
      ]),
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold">
            {data.account.code} · {data.account.name}
          </p>
          <p className="text-xs text-slate-500">
            Saldo final: <span className="font-bold">{formatCurrency(data.finalBalance)}</span>
          </p>
        </div>
        <ExportButtons onCsv={exportCsv} onPdf={exportPdfRep} />
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-bold uppercase">Fecha</th>
              <th className="text-left px-3 py-2 font-bold uppercase">Descripción</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Débito</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Crédito</th>
              <th className="text-right px-3 py-2 font-bold uppercase">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.movements.map((m, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2">{format(new Date(m.date), 'dd/MM/yyyy')}</td>
                <td className="px-3 py-2">{m.description}</td>
                <td className="px-3 py-2 text-right">{Number(m.debit) > 0 ? formatCurrency(m.debit) : ''}</td>
                <td className="px-3 py-2 text-right">{Number(m.credit) > 0 ? formatCurrency(m.credit) : ''}</td>
                <td className="px-3 py-2 text-right font-bold">{formatCurrency(m.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2">
        {data.movements.map((m, idx) => (
          <div key={idx} className="border border-slate-100 rounded-xl p-3">
            <p className="text-xs text-slate-400">{format(new Date(m.date), 'dd/MM/yyyy')}</p>
            <p className="text-sm font-bold">{m.description}</p>
            <div className="grid grid-cols-2 gap-1 text-xs mt-1">
              <span>D: {formatCurrency(m.debit)}</span>
              <span>C: {formatCurrency(m.credit)}</span>
            </div>
            <p className="text-sm font-bold text-blue-600 mt-1">Saldo: {formatCurrency(m.balance)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportButtons({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onCsv}
        className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold hover:bg-green-100 transition"
      >
        <Download className="w-3.5 h-3.5" /> CSV
      </button>
      <button
        type="button"
        onClick={onPdf}
        className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition"
      >
        <FileTextIcon className="w-3.5 h-3.5" /> PDF
      </button>
    </div>
  );
}
