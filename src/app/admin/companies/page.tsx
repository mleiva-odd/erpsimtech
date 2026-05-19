'use client';

/**
 * Fase 47 · Admin SaaS: directorio global de empresas.
 *
 * Solo SUPER_ADMIN. Permite a Marvin (dueño del SaaS) ver TODAS las
 * empresas registradas, con métricas mensuales de actividad. Útil para
 * soporte, billing y entender qué clientes están activos vs durmiendo.
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Building2,
  Users,
  Store,
  ShoppingCart,
  Wallet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  nit: string | null;
  active: boolean;
  createdAt: string;
  branches: number;
  users: number;
  salesThisMonth: number;
  payrollsThisMonth: number;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  /** Días restantes del trial pre-calculado en el cliente al recibir
   *  la data (regla react-hooks/purity prohíbe Date.now en render). */
  trialDaysLeft: number | null;
}

function StatusPill({ row }: { row: CompanyRow }) {
  if (!row.active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700 border border-red-200">
        <XCircle className="w-3 h-3" /> Suspendida
      </span>
    );
  }
  if (row.subscriptionStatus === 'TRIAL') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        <AlertCircle className="w-3 h-3" />
        Trial{row.trialDaysLeft !== null ? ` · ${row.trialDaysLeft}d` : ''}
      </span>
    );
  }
  if (row.subscriptionStatus === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Activa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-slate-50 text-slate-600 border border-slate-200">
      {row.subscriptionStatus ?? '—'}
    </span>
  );
}

function MetricCard({
  Icon,
  label,
  value,
  tone = 'default',
}: {
  Icon: typeof Building2;
  label: string;
  value: number;
  tone?: 'default' | 'blue' | 'emerald';
}) {
  const colors = {
    default: 'bg-white border-slate-200 text-slate-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 ${colors}`}>
      <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="text-3xl font-bold">{value.toLocaleString('es-GT')}</div>
    </div>
  );
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/saas/companies', {
          cache: 'no-store',
        });
        if (res.status === 401) {
          if (!aborted) setError('No autorizado. Iniciá sesión.');
          return;
        }
        if (res.status === 403) {
          if (!aborted) setError('Solo SUPER_ADMIN puede acceder a este directorio.');
          return;
        }
        const data = (await res.json()) as {
          companies: Omit<CompanyRow, 'trialDaysLeft'>[];
        };
        const now = Date.now();
        const withTrialDays: CompanyRow[] = (data.companies ?? []).map((c) => ({
          ...c,
          trialDaysLeft: c.trialEndsAt
            ? Math.max(
                0,
                Math.ceil((new Date(c.trialEndsAt).getTime() - now) / 86_400_000),
              )
            : null,
        }));
        if (!aborted) setCompanies(withTrialDays);
      } catch (err) {
        if (!aborted) setError(err instanceof Error ? err.message : 'Error de red');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.nit ?? '').toLowerCase().includes(q),
    );
  }, [companies, search]);

  const totals = useMemo(
    () => ({
      total: companies.length,
      active: companies.filter((c) => c.active).length,
      trial: companies.filter(
        (c) => c.active && c.subscriptionStatus === 'TRIAL',
      ).length,
      paying: companies.filter(
        (c) => c.active && c.subscriptionStatus === 'ACTIVE',
      ).length,
    }),
    [companies],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md text-center">
          <XCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">No autorizado</h1>
          <p className="text-slate-600">{error}</p>
          <Link
            href="/apps"
            className="inline-flex items-center gap-2 mt-6 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/apps"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Directorio de empresas
          </h1>
          <p className="text-slate-600">
            Todas las empresas registradas en SIMTECH ERP. Solo SUPER_ADMIN
            puede ver esta vista.
          </p>
        </div>

        {/* Totals */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard Icon={Building2} label="Total empresas" value={totals.total} />
          <MetricCard Icon={CheckCircle2} label="Activas" value={totals.active} tone="emerald" />
          <MetricCard Icon={AlertCircle} label="En trial" value={totals.trial} tone="blue" />
          <MetricCard Icon={Wallet} label="Pagando" value={totals.paying} tone="emerald" />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email, slug o NIT..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          {search && (
            <div className="text-xs text-slate-500 mt-2">
              {filtered.length} de {companies.length} empresas coinciden
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {search
                ? 'No hay empresas que coincidan con la búsqueda.'
                : 'No hay empresas registradas todavía.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Empresa</th>
                    <th className="text-left px-5 py-3 font-medium">Estado</th>
                    <th className="text-right px-5 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> Users
                      </span>
                    </th>
                    <th className="text-right px-5 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Store className="w-3 h-3" /> Sucursales
                      </span>
                    </th>
                    <th className="text-right px-5 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" /> Ventas mes
                      </span>
                    </th>
                    <th className="text-right px-5 py-3 font-medium">Planillas mes</th>
                    <th className="text-right px-5 py-3 font-medium">Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => {
                        window.location.href = `/admin/companies/${c.id}`;
                      }}
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/companies/${c.id}`}
                          className="font-medium text-slate-900 hover:text-blue-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {c.email}{c.nit ? ` · NIT ${c.nit}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill row={c} />
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.users}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.branches}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {c.salesThisMonth}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {c.payrollsThisMonth}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-slate-500">
                        {new Date(c.createdAt).toLocaleDateString('es-GT')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
