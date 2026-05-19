'use client';

/**
 * Fase 37 · Admin health dashboard.
 *
 * Página interna autenticada. Refresca cada 30s automáticamente.
 * Muestra status DB + Email + Sentry + flags de configuración +
 * info de deploy. Solo SUPER_ADMIN puede acceder (el endpoint
 * /api/admin/health hace check de role).
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Database,
  Mail,
  Bug,
  Loader2,
  ArrowLeft,
  Server,
  GitCommit,
} from 'lucide-react';

interface CheckResult {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

interface ConfigFlag {
  name: string;
  set: boolean;
  note?: string;
}

interface HealthReport {
  ts: string;
  status: 'ok' | 'degraded' | 'error';
  deploy: {
    commit?: string;
    env: string;
    url?: string;
    region?: string;
  };
  checks: {
    database: CheckResult;
    email: CheckResult;
    sentry: CheckResult;
  };
  config: ConfigFlag[];
}

const REFRESH_INTERVAL_MS = 30_000;

function StatusBadge({ status }: { status: HealthReport['status'] }) {
  const config = {
    ok: { label: 'Operacional', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    degraded: { label: 'Degradado', cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: AlertCircle },
    error: { label: 'Error', cls: 'bg-red-100 text-red-700 border-red-200', Icon: XCircle },
  }[status];
  const { Icon } = config;
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${config.cls}`}
    >
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

function CheckCard({
  Icon,
  title,
  check,
}: {
  Icon: typeof Database;
  title: string;
  check: CheckResult;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              check.ok ? 'bg-emerald-50' : 'bg-red-50'
            }`}
          >
            <Icon
              className={`w-5 h-5 ${check.ok ? 'text-emerald-600' : 'text-red-600'}`}
            />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{title}</div>
            {check.latencyMs !== undefined && (
              <div className="text-xs text-slate-500">{check.latencyMs} ms</div>
            )}
          </div>
        </div>
        {check.ok ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600" />
        )}
      </div>
      {check.detail && (
        <p className="text-sm text-slate-600 mt-2">{check.detail}</p>
      )}
    </div>
  );
}

export default function AdminHealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' });
      if (res.status === 401) {
        setError('No autorizado. Iniciá sesión.');
        return;
      }
      if (res.status === 403) {
        setError('Solo SUPER_ADMIN puede acceder a este dashboard.');
        return;
      }
      const data = await res.json();
      // 503 también devuelve body válido — lo mostramos igual.
      setReport(data);
      setError('');
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

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
            Volver a la app
          </Link>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/apps"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Health Dashboard
              </h1>
              <p className="text-slate-600">
                Status operacional de la plataforma. Refresca cada 30s.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={report.status} />
              <button
                onClick={fetchHealth}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-sm text-slate-700"
              >
                <RefreshCw className="w-4 h-4" />
                Refrescar
              </button>
            </div>
          </div>
          {lastFetch && (
            <p className="text-xs text-slate-500 mt-3">
              Última actualización: {lastFetch.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Deploy info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
            <Server className="w-4 h-4" />
            Deploy
          </div>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-slate-500 text-xs uppercase tracking-wide">Env</dt>
              <dd className="font-medium text-slate-900">{report.deploy.env}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs uppercase tracking-wide">Region</dt>
              <dd className="font-medium text-slate-900">{report.deploy.region ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500 text-xs uppercase tracking-wide">URL</dt>
              <dd className="font-medium text-slate-900 break-all">
                {report.deploy.url ?? '—'}
              </dd>
            </div>
            <div className="sm:col-span-4">
              <dt className="text-slate-500 text-xs uppercase tracking-wide flex items-center gap-1">
                <GitCommit className="w-3 h-3" /> Commit
              </dt>
              <dd className="font-mono text-xs text-slate-700 break-all">
                {report.deploy.commit ?? '—'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Checks */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <CheckCard Icon={Database} title="Base de datos" check={report.checks.database} />
          <CheckCard Icon={Mail} title="Email provider" check={report.checks.email} />
          <CheckCard Icon={Bug} title="Sentry" check={report.checks.sentry} />
        </div>

        {/* Config flags */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Variables de entorno</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Solo se muestra si están seteadas. Los valores nunca se exponen.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Variable</th>
                <th className="text-left px-5 py-2 font-medium">Estado</th>
                <th className="text-left px-5 py-2 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {report.config.map((flag) => (
                <tr key={flag.name} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-mono text-xs text-slate-800">
                    {flag.name}
                  </td>
                  <td className="px-5 py-3">
                    {flag.set ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Seteada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                        <XCircle className="w-3.5 h-3.5" /> Vacía
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">{flag.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
