'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { UserPlus, Edit2, Zap, Shield, ShieldOff, Loader2 } from 'lucide-react';
import { UserModal } from '@/components/users/UserModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
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
    if (session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPER_ADMIN') fetchUsers();
  }, [session]);

  if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'SUPER_ADMIN') {
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Roles y Cajeros
          </h1>
          <p className="text-sm text-slate-500 mt-1">Crea cuentas para tu personal y asígnales diferentes permisos</p>
        </div>
        <button
          onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <UserPlus className="w-5 h-5" /> Nuevo Integrante
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Cajero / Nombre</th>
                <th className="px-6 py-4 font-semibold">Correo</th>
                <th className="px-6 py-4 font-semibold text-center">Permiso</th>
                <th className="px-6 py-4 font-semibold text-center">Sucursal</th>
                <th className="px-6 py-4 font-semibold text-center">Estado</th>
                <th className="px-6 py-4 font-semibold text-center">Fecha Ingreso</th>
                <th className="px-6 py-4 font-semibold text-center">Opciones</th>
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
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      {user.name}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{user.email}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'SUPERVISOR' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      <div className="flex flex-col items-center">
                        <span className="font-medium text-slate-700">{user.branch?.name || <span className="text-slate-600 italic">No asignada</span>}</span>
                        {user.branchAccess && user.branchAccess.length > 0 && (
                          <span className="px-2 py-0.5 mt-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold border border-blue-100">
                            +{user.branchAccess.length} extras
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {user.active ? (
                        <span className="flex items-center justify-center gap-1 text-green-600 text-xs font-medium"><Zap className="w-3.5 h-3.5" /> Activo</span>
                      ) : (
                        <span className="text-red-500 text-xs font-medium line-through">Suspendido</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-slate-600">
                      {format(new Date(user.createdAt), "dd MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => { setSelectedUser(user); setIsModalOpen(true); }}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
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
