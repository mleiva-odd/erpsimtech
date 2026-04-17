'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, UserCircle, X, Users } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useDebounce } from '@/hooks/useDebounce';

interface Customer {
  id: string;
  name: string;
  nit: string | null;
  phone: string | null;
}

export function CustomerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { customerId, customerName, setCustomer } = useCartStore();
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery) {
      setShowResults(false);
      return;
    }

    let active = true;

    async function loadCustomers() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(debouncedQuery)}`);
        const data = await res.json();

        if (!active) return;

        setResults(data.customers ?? []);
        setShowResults(true);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const handleSelect = (customer: Customer) => {
    setCustomer(customer.id, customer.name);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  const clearCustomer = () => {
    setCustomer(null, null);
  };

  if (customerId) {
    return (
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <UserCircle className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-sm font-semibold text-blue-900">{customerName}</p>
            <p className="text-xs text-blue-600">Cliente seleccionado</p>
          </div>
        </div>
        <button onClick={clearCustomer} className="p-1 text-slate-600 hover:text-red-500 hover:bg-white rounded-lg transition">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 focus-within:bg-white transition-all">
        <Users className="w-5 h-5 text-slate-600 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Asignar cliente (Consumidor Final)..."
          className="flex-1 outline-none text-slate-800 placeholder-slate-600 text-sm bg-transparent"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="text-slate-600 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
        {isLoading && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelect(c)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <UserCircle className="w-8 h-8 text-slate-300" />
              <div className="text-left flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm truncate">{c.name}</p>
                <p className="text-xs text-slate-600 truncate">NIT: {c.nit || 'CF'} {c.phone ? `· Tel: ${c.phone}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
