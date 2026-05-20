'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Shield, Building2, Plus, Loader2, Check, X, AlertTriangle, Edit2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

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
    maxBranches: number;
    maxUsersPerBranch: number;
    price: string | number;
  } | null;
  users: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

type CompanyFormData = {
  name: string;
  slug: string;
  email: string;
  phone: string;
  nit: string;
  plan: string;
  subscriptionStatus: string;
  maxBranches: number;
  maxUsersPerBranch: number;
  price: number;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

const emptyFormData: CompanyFormData = {
  name: '',
  slug: '',
  email: '',
  phone: '',
  nit: '',
  plan: 'negocio',
  subscriptionStatus: 'ACTIVE',
  maxBranches: 1,
  maxUsersPerBranch: 1,
  price: 399, // Negocio founder default
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

export default function AdminPage() {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [formData, setFormData] = useState<CompanyFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

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
      const isEditing = Boolean(selectedCompany);
      const res = await fetch(isEditing ? `/api/admin/companies/${selectedCompany!.id}` : '/api/admin/companies', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditing
            ? {
                name: formData.name,
                slug: formData.slug,
                email: formData.email,
                phone: formData.phone,
                nit: formData.nit,
                active: selectedCompany?.active ?? true,
                subscription: {
                  plan: formData.plan,
                  status: formData.subscriptionStatus,
                  maxBranches: formData.maxBranches,
                  maxUsersPerBranch: formData.maxUsersPerBranch,
                  price: formData.price,
                },
                admin: {
                  name: formData.adminName,
                  email: formData.adminEmail,
                  password: formData.adminPassword,
                },
              }
            : formData
        ),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al registrar la empresa');
        return;
      }

      setIsModalOpen(false);
      setSelectedCompany(null);
      setFormData(emptyFormData);
      toast({ tone: 'success', message: isEditing ? 'Empresa actualizada correctamente.' : 'Empresa registrada correctamente.' });
      void fetchCompanies();
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
        body: JSON.stringify({
          name: company.name,
          slug: company.slug,
          email: company.email,
          phone: company.phone,
          nit: company.nit,
          active: !company.active,
          subscription: company.subscription,
        }),
      });
      toast({ tone: 'success', message: company.active ? 'Empresa suspendida.' : 'Empresa reactivada.' });
      void fetchCompanies();
    } catch (e) {
      console.error(e);
    }
  };

  const openCreateModal = () => {
    setSelectedCompany(null);
    setError('');
    setFormData(emptyFormData);
    setIsModalOpen(true);
  };

  const openEditModal = (company: CompanyData) => {
    setSelectedCompany(company);
    setError('');
    setFormData({
      name: company.name,
      slug: company.slug,
      email: company.email,
      phone: company.phone || '',
      nit: company.nit || '',
      plan: company.subscription?.plan || 'negocio',
      subscriptionStatus: company.subscription?.status || 'ACTIVE',
      maxBranches: company.subscription?.maxBranches || 1,
      maxUsersPerBranch: company.subscription?.maxUsersPerBranch || 3,
      price: Number(company.subscription?.price || 0),
      adminName: company.users[0]?.name || '',
      adminEmail: company.users[0]?.email || '',
      adminPassword: '',
    });
    setIsModalOpen(true);
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
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Panel Global' },
        ]}
      />

      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Shield className="w-6 h-6 text-amber-500" />
            Panel de Control Global
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Supervisión y gestión de ecosistemas de empresas</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-amber-500/20 flex items-center gap-2.5 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Registrar Empresa
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-3 text-center">Empresas</p>
          <p className="text-3xl font-bold text-slate-900 text-center tracking-tight">{companies.length}</p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-3 text-center">Activas</p>
          <p className="text-3xl font-bold text-emerald-600 text-center tracking-tight">{companies.filter(c => c.active).length}</p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-3 text-center">Usuarios Globales</p>
          <p className="text-3xl font-bold text-slate-900 text-center tracking-tight">{companies.reduce((acc, c) => acc + c._count.users, 0)}</p>
        </div>
      </div>

      {/* Companies Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-5">Identidad Empresa</th>
                <th className="px-6 py-5">Contacto Principal</th>
                <th className="px-6 py-5 text-center">Sucs.</th>
                <th className="px-6 py-5 text-center">Users</th>
                <th className="px-6 py-5 text-center">Operaciones</th>
                <th className="px-6 py-5 text-center">Estado Plan</th>
                <th className="px-6 py-5 text-center">Estatus</th>
                <th className="px-6 py-5 text-center">Acciones</th>
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
                  <tr key={company.id} className={`hover:bg-slate-50/50 transition-colors group ${!company.active ? 'opacity-40 grayscale' : ''}`}>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 font-bold text-xl shadow-sm">
                          {company.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 tracking-tight">{company.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono tracking-tighter">{company.slug}</p>
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
                    <td className="px-6 py-5 text-center">
                      <div className="flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                        <button
                          onClick={() => openEditModal(company)}
                          className="mr-2 p-3 rounded-2xl bg-sky-50 text-sky-500 transition-all shadow-sm hover:bg-sky-600 hover:text-white hover:shadow-sky-500/10 active:scale-90"
                          title="Editar empresa y suscripción"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleCompanyStatus(company)}
                          className={`p-3 rounded-2xl transition-all shadow-sm hover:shadow-xl active:scale-90 ${
                            company.active
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white hover:shadow-rose-500/10'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white hover:shadow-emerald-500/10'
                          }`}
                          title={company.active ? 'Suspender Operación' : 'Reactivar Empresa'}
                        >
                          {company.active ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                      </div>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-amber-50/30">
              <h2 className="font-bold text-xl text-slate-800 flex items-center gap-3">
                <Building2 className="w-6 h-6 text-amber-600" /> {selectedCompany ? 'Editar Empresa' : 'Registro de Nueva Empresa'}
              </h2>
              <button 
                 onClick={() => setIsModalOpen(false)} 
                 className="text-slate-500 hover:text-rose-500 hover:bg-white p-2 rounded-full transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col max-h-[85vh]">
              <div className="p-8 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                  
                  {/* Columna 1: Empresa */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                       <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
                       <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Información de la Empresa</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Nombre Comercial *</label>
                        <input required type="text" value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value, slug: generateSlug(e.target.value)})}
                          className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all font-semibold text-slate-800 text-sm"
                          placeholder="Ej: Inversiones Simtech S.A."
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Correo de la Empresa *</label>
                          <input required type="email" value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                            className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all font-semibold text-slate-800 text-sm"
                            placeholder="info@empresa.com"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Slug (URL del Portal)</label>
                          <input type="text" value={formData.slug}
                            onChange={e => setFormData({...formData, slug: e.target.value})}
                            className="w-full px-4 py-2 border-2 border-slate-50 bg-slate-50 text-slate-500 font-mono text-[11px] rounded-xl outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">NIT</label>
                          <input type="text" value={formData.nit}
                            onChange={e => setFormData({...formData, nit: e.target.value})}
                            className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none text-sm font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Teléfono</label>
                          <input type="text" value={formData.phone}
                            onChange={e => setFormData({...formData, phone: e.target.value})}
                            className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none text-sm font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Columna 2: Usuario e Inversión */}
                  <div className="space-y-8">
                    {/* Usuario */}
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                         <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                         <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Usuario Administrador</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Nombre Completo *</label>
                          <input required type="text" value={formData.adminName}
                            onChange={e => setFormData({...formData, adminName: e.target.value})}
                            className="w-full px-4 py-2.5 border-2 border-blue-50 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 text-sm"
                            placeholder="Ej: Marvin Leiva"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Correo de Acceso *</label>
                            <input required type="email" value={formData.adminEmail}
                              onChange={e => setFormData({...formData, adminEmail: e.target.value})}
                              className="w-full px-4 py-2.5 border-2 border-blue-50 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 text-sm"
                              placeholder="personal@correo.com"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">
                              Contraseña {selectedCompany ? '(opcional)' : '*'}
                            </label>
                            <input required={!selectedCompany} type="password" value={formData.adminPassword}
                              onChange={e => setFormData({...formData, adminPassword: e.target.value})}
                              className="w-full px-4 py-2.5 border-2 border-blue-50 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none font-semibold text-sm"
                              placeholder={selectedCompany ? 'Dejar en blanco para conservarla' : '••••••••'}
                            />
                          </div>
                        </div>
                        {selectedCompany && (
                          <p className="text-xs text-slate-500">
                            Si cambias la contraseña aquí, se reemplaza inmediatamente para el administrador principal de la empresa.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Plan */}
                    <div className="pt-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase ml-1">Plan Corporativo Inicial</label>
                      <select value={formData.plan} onChange={e => setFormData({...formData, plan: e.target.value})}
                        className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl bg-white font-bold text-amber-700 outline-none focus:ring-4 focus:ring-amber-50 text-sm cursor-pointer shadow-sm">
                        <option value="trial">Trial (30 días de prueba)</option>
                        <option value="negocio">Negocio (Q399 founder · Q599 regular · 1 sucursal · 1 usuario)</option>
                        <option value="comercial">Comercial (Q999 founder · Q1.299 regular · 2 sucursales · 5 usuarios)</option>
                        <option value="enterprise">Empresarial (cotización a medida)</option>
                      </select>
                    </div>

                    {selectedCompany && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase ml-1">Estado de Suscripción</label>
                          <select
                            value={formData.subscriptionStatus}
                            onChange={e => setFormData({ ...formData, subscriptionStatus: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl bg-white font-bold text-slate-700 outline-none focus:ring-4 focus:ring-amber-50 text-sm"
                          >
                            <option value="TRIAL">TRIAL</option>
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="PAST_DUE">PAST_DUE</option>
                            <option value="SUSPENDED">SUSPENDED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Sucursales Máx.</label>
                          <input type="number" min={1} value={formData.maxBranches} onChange={e => setFormData({ ...formData, maxBranches: Number(e.target.value) })} className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none text-sm font-semibold" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Usuarios por Sucursal</label>
                          <input type="number" min={1} value={formData.maxUsersPerBranch} onChange={e => setFormData({ ...formData, maxUsersPerBranch: Number(e.target.value) })} className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none text-sm font-semibold" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase ml-1">Precio del Plan</label>
                          <input type="number" step="0.01" min={0} value={formData.price} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none text-sm font-semibold" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="mt-8 bg-rose-50 text-rose-600 text-[12px] font-bold px-5 py-3 rounded-2xl border border-rose-100 flex items-center gap-3 animate-in shake duration-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              {/* Footer Fijo */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4 justify-end">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="px-8 py-3 bg-white border-2 border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 hover:border-slate-300 hover:text-slate-600 transition-all text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving}
                  className="px-10 py-3 bg-blue-600 text-white rounded-2xl hover:bg-black disabled:opacity-50 font-bold shadow-xl shadow-slate-900/10 transition-all flex items-center justify-center gap-3 active:scale-95 text-sm">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {selectedCompany ? 'Guardar Cambios' : 'Finalizar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
