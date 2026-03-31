'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { MapPin, Plus, Edit2, Star, Loader2, Building2, Users, Package, ShoppingCart } from 'lucide-react';

interface BranchData {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  active: boolean;
  _count: { users: number; sales: number; productStocks: number };
}

export default function BranchesPage() {
  const { data: session } = useSession();
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<BranchData | null>(null);
  const [formData, setFormData] = useState({
    name: '', code: '', address: '', phone: '', isMain: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchBranches = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      if (Array.isArray(data)) setBranches(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const openModal = (branch?: BranchData) => {
    if (branch) {
      setSelectedBranch(branch);
      setFormData({
        name: branch.name,
        code: branch.code,
        address: branch.address || '',
        phone: branch.phone || '',
        isMain: branch.isMain,
      });
    } else {
      setSelectedBranch(null);
      setFormData({ name: '', code: '', address: '', phone: '', isMain: false });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const url = selectedBranch ? `/api/branches/${selectedBranch.id}` : '/api/branches';
      const method = selectedBranch ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al guardar');
        return;
      }

      setIsModalOpen(false);
      fetchBranches();
    } catch (e) {
      setError('Error de conexión');
    } finally {
      setIsSaving(false);
    }
  };

  if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-slate-600">
        <Building2 className="w-16 h-16 mb-4 opacity-30" />
        <h2 className="font-bold text-xl mb-2">Acceso Restringido</h2>
        <p>Solo administradores pueden gestionar sucursales.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Sucursales
          </h1>
          <p className="text-sm text-slate-500 mt-1">Administra las sucursales de tu negocio</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" /> Nueva Sucursal
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className={`bg-white rounded-2xl border shadow-sm p-6 flex flex-col gap-4 transition-all hover:shadow-md ${
                branch.isMain ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
              } ${!branch.active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">{branch.name}</h3>
                    {branch.isMain && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">
                        <Star className="w-3 h-3" /> PRINCIPAL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">{branch.code}</p>
                </div>
                <button
                  onClick={() => openModal(branch)}
                  className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {branch.address && (
                <div className="flex items-start gap-2 text-sm text-slate-500">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{branch.address}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-600 text-[10px] uppercase font-medium mb-1">
                    <Users className="w-3 h-3" /> Staff
                  </div>
                  <p className="text-lg font-bold text-slate-700">{branch._count.users}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-600 text-[10px] uppercase font-medium mb-1">
                    <Package className="w-3 h-3" /> Productos
                  </div>
                  <p className="text-lg font-bold text-slate-700">{branch._count.productStocks}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-600 text-[10px] uppercase font-medium mb-1">
                    <ShoppingCart className="w-3 h-3" /> Ventas
                  </div>
                  <p className="text-lg font-bold text-slate-700">{branch._count.sales}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-slate-800">
                {selectedBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-600 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  required type="text" value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                  placeholder="Sucursal Zona 5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código *</label>
                <input
                  required type="text" value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-mono"
                  placeholder="SUC-Z5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                <input
                  type="text" value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input
                  type="text" value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isMain}
                  onChange={e => setFormData({ ...formData, isMain: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Marcar como sucursal principal
              </label>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
