'use client';

import { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Loader2, Key, Users } from 'lucide-react';
import { RoleModal } from '@/components/users/RoleModal';

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  _count?: { users: number };
}

export default function RolesPage() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchRoles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/roles');
      const data = await res.json();
      if (Array.isArray(data)) setRoles(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este rol? Esta acción no se puede deshacer.')) return;
    
    try {
      const res = await fetch(`/api/settings/roles/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) alert(data.error);
      else fetchRoles();
    } catch (e) {
      alert('Error de conexión');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Key className="w-6 h-6 text-blue-600" />
            Roles y Privilegios
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Define quién puede hacer qué dentro de tu plataforma</p>
        </div>
        <button
          onClick={() => { setSelectedRole(null); setIsModalOpen(true); }}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-slate-500/10 flex items-center gap-2.5 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nuevo Rol
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-20" />
          </div>
        ) : roles.length > 0 ? (
          roles.map(role => (
            <div key={role.id} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setSelectedRole(role); setIsModalOpen(true); }}
                    className="p-2 hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(role.id)}
                    className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-900 mb-1">{role.name}</h3>
              <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-6 flex-1">
                {role.description || 'Sin descripción asignada.'}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-400">
                  <Users className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {role._count?.users || 0} Usuarios
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
                  {role.permissions.length} Permisos
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-medium">No has creado roles personalizados aún.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <RoleModal
          role={selectedRole}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); fetchRoles(); }}
        />
      )}
    </div>
  );
}
