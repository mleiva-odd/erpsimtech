'use client';

/**
 * Fase 22b · Command palette (Cmd+K).
 *
 * Búsqueda full-text de páginas + clientes + productos. Patrón Linear/Vercel.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Loader2 } from 'lucide-react';

interface PageEntry {
  title: string;
  href: string;
  description?: string;
}

interface CustomerEntry { id: string; name: string; nit?: string | null }
interface ProductEntry { id: string; name: string; sku: string }

const PAGES: PageEntry[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'POS', href: '/pos' },
  { title: 'Clientes', href: '/customers' },
  { title: 'Ventas', href: '/sales' },
  { title: 'Nueva venta remota', href: '/sales/new' },
  { title: 'Comisiones', href: '/sales/commissions' },
  { title: 'Reglas de comisión', href: '/sales/commission-rules' },
  { title: 'Pricing (listas / promos / cupones)', href: '/pricing' },
  { title: 'Compras', href: '/purchases' },
  { title: 'Solicitudes de compra', href: '/purchases/requests' },
  { title: 'RFQ / Cotizaciones', href: '/purchases/rfq' },
  { title: 'Inventario', href: '/inventory' },
  { title: 'Traslados', href: '/stock-transfers' },
  { title: 'Proveedores', href: '/suppliers' },
  { title: 'Contabilidad general', href: '/accounting' },
  { title: 'Bancos y tesorería', href: '/accounting/banks' },
  { title: 'Cuentas por cobrar', href: '/accounting/receivables' },
  { title: 'Cuentas por pagar', href: '/accounting/payables' },
  { title: 'Reportes contables', href: '/accounting/reports' },
  { title: 'Tipos de cambio (FX)', href: '/accounting/exchange-rates' },
  { title: 'Planillas', href: '/hr/payroll' },
  { title: 'Empleados', href: '/hr/employees' },
  { title: 'Asistencia', href: '/hr/attendance' },
  { title: 'Vacaciones y permisos', href: '/hr/leaves' },
  { title: 'Préstamos', href: '/hr/loans' },
  { title: 'Reportes', href: '/reports' },
  { title: 'Reportes de inventario', href: '/reports/inventory' },
  { title: 'Reportes de ventas', href: '/reports/sales' },
  { title: 'Reportes SAT', href: '/reports/tax' },
  { title: 'Sucursales', href: '/branches' },
  { title: 'Equipo', href: '/users' },
  { title: 'Roles y permisos', href: '/users/roles' },
  { title: 'Auditoría', href: '/audit' },
  { title: 'Ajustes generales', href: '/settings' },
  { title: 'Notificaciones', href: '/notifications' },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [products, setProducts] = useState<ProductEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((curr) => !curr);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setCustomers([]); setProducts([]); }
  }, [open]);

  // Live search clientes + productos (debounced)
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setCustomers([]);
      setProducts([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [cRes, pRes] = await Promise.all([
          fetch(`/api/customers?q=${encodeURIComponent(query)}&limit=5`).catch(() => null),
          fetch(`/api/products?q=${encodeURIComponent(query)}&limit=5`).catch(() => null),
        ]);
        if (cRes && cRes.ok) {
          const data = await cRes.json();
          setCustomers(Array.isArray(data?.customers) ? data.customers : Array.isArray(data?.data) ? data.data : []);
        }
        if (pRes && pRes.ok) {
          const data = await pRes.json();
          setProducts(Array.isArray(data?.products) ? data.products : Array.isArray(data?.data) ? data.data : []);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const matchingPages = PAGES.filter((p) =>
    !query.trim() || p.title.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8);

  const go = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/40 backdrop-blur-sm flex items-start justify-center p-4 sm:pt-32" onClick={() => setOpen(false)}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar páginas, clientes o productos…"
            className="flex-1 outline-none text-sm bg-transparent"
          />
          {searching && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {matchingPages.length > 0 && (
            <Section title="Páginas">
              {matchingPages.map((p) => (
                <Item key={p.href} onClick={() => go(p.href)} title={p.title} hint={p.href} />
              ))}
            </Section>
          )}
          {customers.length > 0 && (
            <Section title="Clientes">
              {customers.map((c) => (
                <Item
                  key={c.id}
                  onClick={() => go(`/customers?id=${c.id}`)}
                  title={c.name}
                  hint={c.nit || 'CF'}
                />
              ))}
            </Section>
          )}
          {products.length > 0 && (
            <Section title="Productos">
              {products.map((p) => (
                <Item
                  key={p.id}
                  onClick={() => go(`/inventory?id=${p.id}`)}
                  title={p.name}
                  hint={p.sku}
                />
              ))}
            </Section>
          )}
          {query && matchingPages.length === 0 && customers.length === 0 && products.length === 0 && !searching && (
            <div className="p-12 text-center text-sm text-slate-400">Sin resultados.</div>
          )}
        </div>

        <div className="p-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 flex justify-between">
          <span>↵ Abrir · esc Cerrar</span>
          <span>⌘K para alternar</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Item({ onClick, title, hint }: { onClick: () => void; title: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-blue-50/50 transition text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
        {hint && <p className="text-[10px] text-slate-400 truncate">{hint}</p>}
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
}
