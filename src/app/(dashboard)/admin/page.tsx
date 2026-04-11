'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Shield, Building2, Plus, Edit2, Users, MapPin, CreditCard, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CompanyData {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  nit: string | null;
  active: boolean;
  createdAt: string;
  _count: { branches: number; users: number; sales: number };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '', slug: '', email: '', phone: '', nit: '', plan: 'basic',
    adminName: '', adminEmail: '', adminPassword: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/companies');
      const data = await res.json();
      if (Array.isArray(data)) setCompanies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'SUPER_ADMIN') fetchCompanies();
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al registrar la empresa');
        return;
      }

      setIsModalOpen(false);
      setFormData({ 
        name: '', slug: '', email: '', phone: '', nit: '', plan: 'basic',
        adminName: '', adminEmail: '', adminPassword: '',
      });
      fetchCompanies();
    } catch (e) {
      setError('Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCompanyStatus = async (company: CompanyData) => {
    try {
      await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...company, active: !company.active }),
      });
      fetchCompanies();
    } catch (e) {
      console.error(e);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  if (session?.user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-slate-600">
        <Shield className="w-16 h-16 mb-4 opacity-30" />
        <h2 className="font-bold text-xl mb-2">Acceso Exclusivo</h2>
        <p>Solo el Super Administrador de la plataforma puede acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-500" />
            Panel de Plataforma
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestión centralizada de empresas registradas</p>
        </div>
        <button
          onClick={() => { setError(''); setIsModalOpen(true); }}
          className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" /> Nueva Empresa
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-slate-800">{companies.length}</p>
          <p className="text-xs text-slate-500 mt-1">Empresas Registradas</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{companies.filter(c => c.active).length}</p>
          <p className="text-xs text-slate-500 mt-1">Activas</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-slate-800">{companies.reduce((acc, c) => acc + c._count.users, 0)}</p>
          <p className="text-xs text-slate-500 mt-1">Usuarios Totales</p>
        </div>
      </div>

      {/* Companies Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Empresa</th>
                <th className="px-6 py-4 font-semibold">Contacto</th>
                <th className="px-6 py-4 font-semibold text-center">Sucursales</th>
                <th className="px-6 py-4 font-semibold text-center">Usuarios</th>
                <th className="px-6 py-4 font-semibold text-center">Ventas</th>
                <th className="px-6 py-4 font-semibold text-center">Plan</th>
                <th className="px-6 py-4 font-semibold text-center">Estado</th>
                <th className="px-6 py-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-600">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Cargando empresas...
                  </td>
                </tr>
              ) : companies.length > 0 ? (
                companies.map(company => (
                  <tr key={company.id} className={`hover:bg-slate-50 transition-colors ${!company.active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg">
                          {company.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{company.name}</p>
                          <p className="text-xs text-slate-600 font-mono">{company.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-600">{company.email}</p>
                      <p className="text-xs text-slate-600">{company.phone || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">{company._count.branches}</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">{company._count.users}</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">{company._count.sales}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        company.subscription?.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                        company.subscription?.status === 'TRIAL' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {company.subscription?.plan?.toUpperCase() || 'SIN PLAN'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {company.active ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                          <Check className="w-3.5 h-3.5" /> Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium">
                          <X className="w-3.5 h-3.5" /> Suspendida
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleCompanyStatus(company)}
                        className={`p-2 rounded-lg transition ${
                          company.active
                            ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-green-400 hover:text-green-600 hover:bg-green-50'
                        }`}
                        title={company.active ? 'Suspender' : 'Reactivar'}
                      >
                        {company.active ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-600">
                    No hay empresas registradas. Crea la primera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registrar Empresa Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8 border border-slate-200">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
              <h2 className="font-bold text-xl text-slate-800 flex items-center gap-3">
                <Building2 className="w-6 h-6 text-amber-600" /> Registrar Nueva Empresa
              </h2>
              <button 
                 onClick={() => setIsModalOpen(false)} 
                 className="text-slate-400 hover:text-rose-500 hover:bg-white p-2 rounded-full transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              {/* Sección 1: Información de la Empresa */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                   <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div>
                   <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Información de la Empresa</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Nombre Comercial *</label>
                    <input required type="text" value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value, slug: generateSlug(e.target.value)})}
                      className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all font-semibold text-slate-800"
                      placeholder="Ej: Inversiones Simtech S.A."
                    />
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Correo de la Empresa *</label>
                    <input required type="email" value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all font-semibold text-slate-800"
                      placeholder="info@empresa.com"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Slug (URL del Portal)</label>
                    <input type="text" value={formData.slug}
                      onChange={e => setFormData({...formData, slug: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-slate-50 bg-slate-50 text-slate-400 font-mono text-xs rounded-2xl outline-none"
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">NIT</label>
                    <input type="text" value={formData.nit}
                      onChange={e => setFormData({...formData, nit: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all font-semibold text-slate-800"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Teléfono</label>
                    <input type="text" value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all font-semibold text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Usuario Administrador */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-50">
                   <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div>
                   <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Usuario Administrador</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Nombre Completo *</label>
                    <input required type="text" value={formData.adminName}
                      onChange={e => setFormData({...formData, adminName: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-blue-50 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                      placeholder="Ej: Marvin Leiva"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Correo de Acceso *</label>
                    <input required type="email" value={formData.adminEmail}
                      onChange={e => setFormData({...formData, adminEmail: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-blue-50 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                      placeholder="personal@correo.com"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase ml-1">Contraseña *</label>
                    <input required type="password" value={formData.adminPassword}
                      onChange={e => setFormData({...formData, adminPassword: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-blue-50 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase ml-1">Plan Corporativo Inicial</label>
                <select value={formData.plan} onChange={e => setFormData({...formData, plan: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl bg-white font-black text-amber-700 outline-none focus:ring-4 focus:ring-amber-50">
                  <option value="trial">Trial (30 días de prueba)</option>
                  <option value="basic">Plan Básico (POS)</option>
                  <option value="professional">Plan Profesional (ERP)</option>
                  <option value="enterprise">Plan Enterprise (Corporativo)</option>
                </select>
              </div>

              {error && (
                <div className="bg-rose-50 text-rose-600 text-[13px] font-bold px-5 py-4 rounded-2xl border border-rose-100 flex items-center gap-3 animate-in shake duration-300">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 hover:text-slate-600 transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex-1 px-4 py-4 bg-slate-900 text-white rounded-2xl hover:bg-black disabled:opacity-50 font-black shadow-xl shadow-slate-900/10 transition-all flex items-center justify-center gap-3 active:scale-95">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Finalizar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
