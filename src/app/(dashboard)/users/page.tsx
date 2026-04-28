'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { UserPlus, Edit2, Shield, ShieldOff, Loader2, CheckCircle, Key } from 'lucide-react';
import { UserModal } from '@/components/users/UserModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  customRole?: { name: string } | null;
  active: boolean;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  branchAccess?: { branch: { id: string; name: string } }[];
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'SUPER_ADMIN' || session?.user?.permissions?.includes('settings:manage')) fetchUsers();
  }, [session]);

  if (session?.user?.role !== 'SUPER_ADMIN' && !session?.user?.permissions?.includes('settings:manage')) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 bg-red-50 text-red-600 rounded-3xl m-8">
        <ShieldOff className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="font-bold text-2xl mb-2">Acceso Restringido</h2>
        <p>Solo los Administradores pueden gestionar el personal del sistema.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            Equipo y Permisos
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Gestión administrativa de roles y acceso a sucursales</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/users/roles"
            className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-6 py-3 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2.5 transition-all active:scale-95"
          >
            <Key className="w-4 h-4 text-blue-500" /> Gestionar Roles
          </a>
          <button
            onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/10 flex items-center gap-2.5 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" /> Nuevo Integrante
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-5">Identidad</th>
                <th className="px-6 py-5">Correo Electrónico</th>
                <th className="px-6 py-5 text-center">Nivel de Acceso</th>
                <th className="px-6 py-5 text-center">Sucursal Base</th>
                <th className="px-6 py-5 text-center">Estatus</th>
                <th className="px-6 py-5 text-center">Fecha Ingreso</th>
                <th className="px-6 py-5 text-center">Opciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-600">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Cargando equipo...
                  </td>
                </tr>
              ) : users.length > 0 ? (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5 font-bold text-slate-900 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shadow-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-slate-500 font-medium">{user.email}</td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest uppercase border ${
                        user.role === 'SUPER_ADMIN' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                        (user.customRole?.name === 'Administrador' || user.customRole?.name === 'Admin') ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}>
                        {user.customRole?.name || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-slate-800">{user.branch?.name || <span className="text-slate-400 italic font-normal">Sin asignar</span>}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      {user.active ? (
                        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest border border-emerald-100"><CheckCircle className="w-3 h-3" /> Activo</span>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-500 text-[10px] font-bold uppercase tracking-widest border border-rose-100 opacity-50">Suspendido</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center text-slate-400 font-mono text-xs">
                      {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: es })}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                        <button 
                          onClick={() => { setSelectedUser(user); setIsModalOpen(true); }}
                          className="p-3 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-2xl transition-all shadow-sm hover:shadow-xl hover:shadow-blue-500/10 active:scale-90"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-600">
                    Nadie más forma parte del equipo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <UserModal
          user={selectedUser}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}
