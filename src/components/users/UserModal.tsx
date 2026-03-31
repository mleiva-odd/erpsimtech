'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Info } from 'lucide-react';

interface UserModalProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    branch?: { id: string; name: string } | null;
    branchAccess?: { branch: { id: string; name: string } }[];
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

export function UserModal({ user, onClose, onSuccess }: UserModalProps) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'CASHIER',
    active: user?.active ?? true,
    branchId: user?.branch?.id || '',
    branchAccess: user?.branchAccess ? user.branchAccess.map(ba => ba.branch.id) : [] as string[],
  });
  
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch branches for assignment
  useEffect(() => {
    fetch('/api/branches')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setBranches(data);
      })
      .catch(console.error);
  }, []);

  const handleCheckbox = (branchId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      branchAccess: checked 
        ? [...prev.branchAccess, branchId]
        : prev.branchAccess.filter(id => id !== branchId)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const url = user ? `/api/users/${user.id}` : '/api/users';
      const method = user ? 'PUT' : 'POST';

      const payload: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        active: formData.active,
        branchId: formData.branchId || null,
        branchAccess: formData.branchAccess
      };

      if (formData.password) {
        payload.password = formData.password;
      }
      // Password is required for new users
      if (!user && !formData.password) {
        setError('La contraseña es obligatoria para nuevos usuarios');
        setIsLoading(false);
        return;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // The alternate branches shouldn't include the primary branch
  const alternateBranches = branches.filter(b => b.id !== formData.branchId);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-lg text-slate-800">
            {user ? 'Editar Permisos del Empleado' : 'Registrar Nuevo Integrante'}
          </h2>
          <button onClick={onClose} className="text-slate-600 hover:text-rose-500 transition-colors bg-white p-1 rounded-full shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6 custom-scrollbar flex-1">
          <form id="userForm" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Block 1: Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Información Básica</h3>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none transition-colors" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Correo Electrónico *</label>
                  <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {user ? 'Nueva Contraseña' : 'Contraseña *'}
                  </label>
                  <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder={user ? "**** (opcional)" : "Mínimo 6 caracteres"} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none transition-colors" minLength={6} />
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-slate-100" />

            {/* Block 2: Roles */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Permisología</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Rol en el Sistema *</label>
                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-800 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none font-medium">
                    <option value="CASHIER">Cajero (Operador)</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Sucursal Base (Punto de Venta)</label>
                  <select value={formData.branchId} onChange={e => setFormData({...formData, branchId: e.target.value})} className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-100 outline-none">
                    <option value="">Selecciona sucursal matriz...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Alt Branches Array */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                <div className="flex gap-2 items-start mb-3">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-medium text-slate-600 leading-tight">
                    Puedes otorgarle llaves a otras sucursales adicionales. Podrá usarlas para transferencias logísticas cruzadas o monitoreo.
                  </p>
                </div>
                
                {alternateBranches.length === 0 ? (
                 <p className="text-xs text-slate-600 italic">No hay más sucursales creadas en la red.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {alternateBranches.map(b => (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input 
                            type="checkbox" 
                            checked={formData.branchAccess.includes(b.id)}
                            onChange={(e) => handleCheckbox(b.id, e.target.checked)}
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer peer appearance-none checked:bg-blue-600 transition-all shadow-sm"
                          />
                          <div className="absolute inset-0 pointer-events-none opacity-0 peer-checked:opacity-100 flex items-center justify-center text-white">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          </div>
                        </div>
                        <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                          {b.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {user && (
              <label className="flex items-center gap-2 text-sm text-slate-600 font-bold cursor-pointer mt-4 bg-slate-100 w-max px-3 py-1.5 rounded-lg">
                <input type="checkbox" checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})} className="rounded text-green-600 focus:ring-green-500 w-4 h-4" />
                Permitir ingreso (Cuenta Activa)
              </label>
            )}
          </form>
        </div>

        <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-2xl shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)] relative z-10">
          {error && <span className="text-rose-500 text-sm font-medium absolute left-6 top-1/2 -translate-y-1/2">{error}</span>}
          
          <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition">
            Cancelar
          </button>
          <button type="submit" form="userForm" disabled={isLoading} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-95">
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : 'Guardar Llaves'}
          </button>
        </div>
      </div>
    </div>
  );
}
