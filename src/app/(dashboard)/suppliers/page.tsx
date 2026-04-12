'use client';

import { useEffect, useState } from 'react';
import { Truck, Plus, Edit2, Search, Trash2, Loader2, X, Save } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  nit: string | null;
  address: string | null;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 500);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    nit: '',
    address: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
    (s.nit && s.nit.includes(debouncedQuery))
  );

  const handleNew = () => {
    setSelectedSupplier(null);
    setFormData({ name: '', contactName: '', email: '', phone: '', nit: '', address: '' });
    setIsModalOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      nit: supplier.nit || '',
      address: supplier.address || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const url = selectedSupplier ? `/api/suppliers/${selectedSupplier.id}` : '/api/suppliers';
    const method = selectedSupplier ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchSuppliers();
      } else {
        const data = await res.json();
        alert(data.error || 'Error al guardar');
      }
    } catch {
      alert('Error de red');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSupplier || !confirm('¿Estás seguro de desactivar (borrar) este proveedor? Sus registros de compra históricos se mantendrán.')) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${selectedSupplier.id}`, { method: 'DELETE' });
      if (res.ok) {
        setIsModalOpen(false);
        fetchSuppliers();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600" />
            Directorio de Proveedores
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona tus socios logísticos y distribuidores mayoristas.
          </p>
        </div>
        <button onClick={handleNew} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Registrar Proveedor
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Empresa o NIT..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden">
        <div className="overflow-x-auto h-full">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Empresa / Razón Social</th>
                <th className="px-6 py-4 font-semibold">Contacto</th>
                <th className="px-6 py-4 font-semibold">NIT</th>
                <th className="px-6 py-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filteredSuppliers.length > 0 ? (
                filteredSuppliers.map(supplier => (
                  <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{supplier.name}</div>
                      {supplier.address && <div className="text-xs text-slate-500">{supplier.address}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800 font-medium">{supplier.contactName || '-'}</div>
                      <div className="text-xs text-slate-500">{supplier.phone || ''}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600">{supplier.nit || 'N/A'}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => handleEdit(supplier)} className="text-slate-600 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-indigo-50">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No se encontraron proveedores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-lg text-slate-800">
                {selectedSupplier ? 'Ficha del Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social / Empresa *</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" placeholder="Distribuidora S.A." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIT</label>
                  <input type="text" value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Representante de Ventas</label>
                  <input type="text" value={formData.contactName} onChange={e => setFormData({...formData, contactName: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" placeholder="Nombre visible del vendedor o contacto." />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" placeholder="ventas@empresa.com" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Registrada</label>
                  <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 mt-4 items-center">
                {selectedSupplier && (
                  <button type="button" onClick={handleDelete} className="mr-auto text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors">
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Save className="w-4 h-4" /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
