'use client';

/**
 * Fase 49 · Admin SaaS: detalle de empresa.
 *
 * Drill-down desde /admin/companies. Muestra info básica, suscripción,
 * sucursales con métricas mensuales, usuarios y últimos 20 eventos de
 * auditoría. SUPER_ADMIN-only (validado server-side).
 */

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Users,
  Store,
  Activity,
  Loader2,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  Hash,
  Calendar,
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  customRoleName: string | null;
  branchName: string | null;
  active: boolean;
  createdAt: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  salesThisMonth: number;
  salesAmountThisMonth: number;
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface CompanyDetail {
  company: {
    id: string;
    name: string;
    slug: string;
    email: string;
    nit: string | null;
    phone: string | null;
    active: boolean;
    logoUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  subscription: {
    status: string;
    plan: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  branches: Branch[];
  users: User[];
  recentActivity: AuditEntry[];
}

function formatGtq(n: number): string {
  return `Q ${n.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function SubscriptionPill({ sub, trialDaysLeft }: { sub: CompanyDetail['subscription']; trialDaysLeft: number | null }) {
  if (!sub) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-600">
        Sin suscripción
      </span>
    );
  }
  if (sub.status === 'TRIAL') {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700 border border-blue-200">
        <AlertCircle className="w-4 h-4" />
        Trial · plan {sub.plan}
        {trialDaysLeft !== null && ` · ${trialDaysLeft}d restantes`}
      </span>
    );
  }
  if (sub.status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-4 h-4" />
        Activa · plan {sub.plan}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-slate-50 text-slate-600">
      {sub.status} · {sub.plan}
    </span>
  );
}

function actionLabel(a: string): string {
  // Convierte SNAKE_CASE_VARIANTS a "Snake case variants"
  return a.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export default function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/saas/companies/${id}`, {
          cache: 'no-store',
        });
        if (res.status === 401) {
          if (!aborted) setError('No autorizado. Iniciá sesión.');
          return;
        }
        if (res.status === 403) {
          if (!aborted) setError('Solo SUPER_ADMIN puede acceder a este detalle.');
          return;
        }
        if (res.status === 404) {
          if (!aborted) setError('Empresa no encontrada.');
          return;
        }
        const json = (await res.json()) as CompanyDetail;
        const now = Date.now();
        const tdl = json.subscription?.trialEndsAt
          ? Math.max(
              0,
              Math.ceil(
                (new Date(json.subscription.trialEndsAt).getTime() - now) /
                  86_400_000,
              ),
            )
          : null;
        if (!aborted) {
          setData(json);
          setTrialDaysLeft(tdl);
        }
      } catch (err) {
        if (!aborted) setError(err instanceof Error ? err.message : 'Error de red');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [id]);

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
          <h1 className="text-xl font-bold text-slate-900 mb-2">No disponible</h1>
          <p className="text-slate-600">{error}</p>
          <Link
            href="/admin/companies"
            className="inline-flex items-center gap-2 mt-6 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al directorio
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { company, subscription, branches, users, recentActivity } = data;
  const totalSalesMonth = branches.reduce((a, b) => a + b.salesAmountThisMonth, 0);
  const totalSalesCount = branches.reduce((a, b) => a + b.salesThisMonth, 0);
  const activeUsers = users.filter((u) => u.active).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <Link
          href="/admin/companies"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al directorio
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {company.name}
            </h1>
            <p className="text-slate-600 text-sm">
              <span className="font-mono">{company.slug}</span>
              {company.nit ? ` · NIT ${company.nit}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!company.active && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-red-50 text-red-700 border border-red-200">
                <XCircle className="w-4 h-4" /> Suspendida
              </span>
            )}
            <SubscriptionPill sub={subscription} trialDaysLeft={trialDaysLeft} />
          </div>
        </div>

        {/* Info básica */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs uppercase tracking-wide mb-1">
                <Mail className="w-3 h-3" />Email
              </div>
              <div className="font-medium text-slate-900 break-all">{company.email}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs uppercase tracking-wide mb-1">
                <Phone className="w-3 h-3" />Teléfono
              </div>
              <div className="font-medium text-slate-900">{company.phone ?? '—'}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs uppercase tracking-wide mb-1">
                <Hash className="w-3 h-3" />NIT
              </div>
              <div className="font-medium text-slate-900">{company.nit ?? '—'}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs uppercase tracking-wide mb-1">
                <Calendar className="w-3 h-3" />Alta
              </div>
              <div className="font-medium text-slate-900">
                {new Date(company.createdAt).toLocaleDateString('es-GT')}
              </div>
            </div>
          </div>
        </div>

        {/* Totales */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
              <Store className="w-4 h-4" /> Sucursales
            </div>
            <div className="text-3xl font-bold text-slate-900">{branches.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
              <Users className="w-4 h-4" /> Usuarios activos
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {activeUsers}
              <span className="text-base text-slate-500 font-normal"> / {users.length}</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-sm text-slate-600 mb-1">Ventas mes (cantidad)</div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums">{totalSalesCount}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-sm text-slate-600 mb-1">Ventas mes (monto)</div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {formatGtq(totalSalesMonth)}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Sucursales */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-600" />
              <h2 className="font-semibold text-slate-900">Sucursales</h2>
            </div>
            {branches.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Sin sucursales registradas.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Sucursal</th>
                    <th className="text-right px-5 py-2 font-medium">Ventas mes</th>
                    <th className="text-right px-5 py-2 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{b.name}</div>
                        <div className="text-xs text-slate-500">
                          {b.code}{b.address ? ` · ${b.address}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{b.salesThisMonth}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatGtq(b.salesAmountThisMonth)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Users */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-600" />
              <h2 className="font-semibold text-slate-900">
                Usuarios <span className="text-slate-400 font-normal">({users.length})</span>
              </h2>
            </div>
            {users.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Sin usuarios.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Usuario</th>
                    <th className="text-left px-5 py-2 font-medium">Rol</th>
                    <th className="text-right px-5 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500 break-all">{u.email}</div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-700">
                        {u.customRoleName ?? u.role}
                        {u.branchName ? (
                          <div className="text-slate-500">{u.branchName}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <XCircle className="w-3.5 h-3.5" /> Inactivo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-600" />
            <h2 className="font-semibold text-slate-900">Actividad reciente</h2>
            <span className="text-xs text-slate-500 ml-auto">últimos 20 eventos</span>
          </div>
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              Sin actividad reciente.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentActivity.map((ev) => (
                <li key={ev.id} className="px-5 py-3 text-sm flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900">{actionLabel(ev.action)}</div>
                    <div className="text-xs text-slate-500">
                      {ev.entity} · <span className="font-mono">{ev.entityId.slice(0, 8)}</span>
                      {ev.user ? ` · ${ev.user.name} (${ev.user.email})` : ' · sistema'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString('es-GT')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
