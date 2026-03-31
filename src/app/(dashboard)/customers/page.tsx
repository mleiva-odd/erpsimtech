'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Search, Plus, CreditCard, UserCircle, Edit2, ShieldAlert, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nit: string | null;
  address: string | null;
  creditLimit: number | string;
  balance: number | string;
}

export default function CustomersPage() {
  const { data: session } = useSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 400);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', nit: '', address: '', creditLimit: 0
  });

  const fetchCustomers = async (q = '') => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/customers?q=${q}`);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(debouncedSearch);
  }, [debouncedSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ name: '', email: '', phone: '', nit: '', address: '', creditLimit: 0 });
        fetchCustomers();
      } else {
        alert('Error al crear cliente');
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Control de Clientes
          </h1>
          <p className="text-sm text-slate-500 mt-1">Directorio, gestión de carteras y límites de crédito autorizado</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Nuevo Cliente
        </button>
      </div>

      {/* Buscador */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar empresa, nombre personal, NIT o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Tabla Premium */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-6 py-4 font-semibold">Identificación / NIT</th>
                <th className="px-6 py-4 font-semibold">Contacto</th>
                <th className="px-6 py-4 font-semibold text-right">Saldo (Deuda)</th>
                <th className="px-6 py-4 font-semibold text-right">Límite Autorizado</th>
                <th className="px-6 py-4 font-semibold text-center">Configurar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando directorio...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                    No se encontraron clientes registrados
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const hasDebt = Number(c.balance) > 0;
                  const nearLimit = hasDebt && (Number(c.balance) / Number(c.creditLimit)) > 0.8;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                            <UserCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{c.name}</div>
                            {c.address && <div className="text-xs text-slate-500 truncate w-32">{c.address}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium">
                          {c.nit || 'C/F'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="font-medium">{c.phone || '-'}</div>
                        <div className="text-xs text-slate-600">{c.email || 'Sin correo asociado'}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${hasDebt ? 'text-rose-600' : 'text-slate-500'}`}>
                          Q{Number(c.balance).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          {nearLimit && <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />}
                          Q{Number(c.creditLimit).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-slate-600 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Modernizado */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold">Registro de Cliente</h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-600 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="customerForm" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Comercial / Completo <span className="text-rose-500">*</span></label>
                  <input required type="text" placeholder="Ej: Supermercados La Torre" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">NIT</label>
                    <input type="text" placeholder="Ej: 1234567-8" value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Teléfono</label>
                    <input type="text" placeholder="Ej: +502 0000-0000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Dirección de Facturación</label>
                  <input type="text" placeholder="12 Calle, Zona x, Ciudad" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                  <label className="block text-sm font-bold text-slate-800 mb-1">Límite de Crédito (Q)</label>
                  <p className="text-[11px] text-slate-500 font-medium mb-2 leading-relaxed">
                    Monto máximo de fiado permitido. Si se establece en "0", el cliente solo podrá realizar compras de contado.
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-medium">Q</span>
                    <input type="number" min="0" step="100" value={formData.creditLimit} onChange={e => setFormData({...formData, creditLimit: Number(e.target.value)})} className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                form="customerForm"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
