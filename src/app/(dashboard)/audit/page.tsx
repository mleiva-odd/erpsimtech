'use client';

import { useState, useEffect } from 'react';
import { Loader2, Activity, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  changes: unknown;
  createdAt: string;
  user?: { name: string, email: string } | null;
  branch?: { name: string } | null;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [page, setPage] = useState(1);

  const ACTIONS = [
    'SALE_CREATED', 'SALE_VOIDED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED',
    'PRODUCT_DELETED', 'STOCK_TRANSFER', 'USER_CREATED', 'USER_UPDATED',
    'BRANCH_CREATED', 'BRANCH_UPDATED', 'SETTINGS_UPDATED',
    'CASH_REGISTER_OPENED', 'CASH_REGISTER_CLOSED'
  ];

  const ENTITIES = [
    'Sale', 'Product', 'ProductStock', 'User', 'Branch', 'CompanySettings', 'CashRegister'
  ];

  useEffect(() => {
    let query = `/api/audit?page=${page}&limit=50`;
    if (actionFilter) query += `&action=${actionFilter}`;
    if (entityFilter) query += `&entity=${entityFilter}`;
    let active = true;

    async function loadLogs() {
      setIsLoading(true);
      try {
        const res = await fetch(query);
        const data = await res.json();
        if (!active) return;

        if (data.logs) {
          setLogs(data.logs);
          setTotal(data.total);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadLogs();

    return () => {
      active = false;
    };
  }, [page, actionFilter, entityFilter]);

  const renderChanges = (changes: unknown) => {
    if (!changes) return '-';
    let parsed = changes;
    if (typeof changes === 'string') {
      try { parsed = JSON.parse(changes); } catch { return changes; }
    }
    return (
      <pre className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded shrink-0 max-w-xs overflow-auto">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Activity className="w-6 h-6 text-indigo-600" />
          Registro de Auditoría
        </h1>
        <p className="text-sm text-slate-500 mt-1">Monitorea la actividad del sistema y los eventos operativos importantes.</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
        <Filter className="w-5 h-5 text-slate-600" />
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm bg-slate-50 min-w-[180px]"
        >
          <option value="">Todas las acciones...</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm bg-slate-50 min-w-[180px]"
        >
          <option value="">Todas las entidades...</option>
          {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Acción</th>
                <th className="px-6 py-3 font-medium">Entidad / ID</th>
                <th className="px-6 py-3 font-medium">Usuario</th>
                <th className="px-6 py-3 font-medium">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No hay registros que coincidan con los filtros.</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-500">
                      {format(new Date(log.createdAt), "dd MMM, HH:mm", { locale: es })}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">
                      {log.action}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800">{log.entity}</div>
                      <div className="text-xs text-slate-600 font-mono mt-1">{log.entityId.substring(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{log.user?.name || 'Sistema'}</div>
                      <div className="text-xs text-slate-500">{log.user?.email || ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      {renderChanges(log.changes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Basic Pagination Header */}
      {!isLoading && total > 50 && (
        <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="px-4 py-2 border rounded disabled:opacity-50">Anterior</button>
            <button onClick={() => setPage(p => p+1)} className="px-4 py-2 border rounded">Siguiente</button>
        </div>
      )}
    </div>
  );
}
