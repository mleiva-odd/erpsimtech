'use client';

import { useState } from 'react';
import { X, Loader2, ShieldCheck, Info } from 'lucide-react';
import { AVAILABLE_PERMISSIONS } from '@/constants/permissions';

interface RoleModalProps {
  role: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function RoleModal({ role, onClose, onSuccess }: RoleModalProps) {
  const [formData, setFormData] = useState({
    name: role?.name || '',
    description: role?.description || '',
    permissions: role?.permissions || [] as string[],
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePermissionToggle = (permId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const url = role ? `/api/settings/roles/${role.id}` : '/api/settings/roles';
      const method = role ? 'PUT' : 'POST';

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

      onSuccess();
    } catch (e) {
      setError('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100">
        <div className="px-8 pt-8 pb-4 flex justify-between items-start bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {role ? 'Editar Rol' : 'Nuevo Rol Personalizado'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Configuración de Privilegios</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-8 py-6 custom-scrollbar flex-1">
          <form id="roleForm" onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Nombre del Rol (Ej: Cajero Nocturno)</label>
                <input 
                  required 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="Nombre identificador..."
                  className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Descripción Breve</label>
                <input 
                  type="text" 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  placeholder="¿Qué funciones desempeña?"
                  className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" 
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800">Matriz de Permisos</h3>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {AVAILABLE_PERMISSIONS.map((cat) => (
                  <div key={cat.category} className="space-y-4">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 py-1.5 px-3 rounded-lg w-max">{cat.category}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {cat.permissions.map((perm) => (
                        <label 
                          key={perm.id} 
                          className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer group ${
                            formData.permissions.includes(perm.id) 
                              ? 'border-blue-100 bg-blue-50/30' 
                              : 'border-slate-50 hover:border-slate-100 bg-white'
                          }`}
                        >
                          <div className="relative flex items-center justify-center mt-0.5">
                            <input 
                              type="checkbox" 
                              checked={formData.permissions.includes(perm.id)}
                              onChange={() => handlePermissionToggle(perm.id)}
                              className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer peer appearance-none checked:bg-blue-600 transition-all"
                            />
                            <div className="absolute inset-0 pointer-events-none opacity-0 peer-checked:opacity-100 flex items-center justify-center text-white">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{perm.name}</span>
                            <span className="text-[11px] text-slate-500 font-medium leading-tight">{perm.description}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end items-center gap-4">
          {error && <div className="flex items-center gap-2 text-rose-500 text-xs font-bold mr-auto"><Info className="w-4 h-4" /> {error}</div>}
          
          <button type="button" onClick={onClose} className="px-6 py-3 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm">
            Cancelar
          </button>
          <button 
            type="submit" 
            form="roleForm" 
            disabled={isLoading} 
            className="flex items-center gap-2.5 px-10 py-3.5 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 text-sm"
          >
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}
