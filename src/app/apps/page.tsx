'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Store, Package, Users, BarChart3, Building2, Settings, ArrowRightLeft, Shield, Activity, LogOut, Truck, Inbox, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';

export default function AppLauncher() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f6f9]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const role = session?.user?.role;
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isSupervisor = role === 'SUPERVISOR' || isAdmin;
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const apps = [
    { name: 'Punto de Venta', icon: <Store className="w-10 h-10 text-white" />, href: '/pos', gradient: 'from-emerald-400 to-teal-600', shadow: 'shadow-teal-500/30' },
    { name: 'Clientes', icon: <Users className="w-10 h-10 text-white" />, href: '/customers', gradient: 'from-sky-400 to-blue-600', shadow: 'shadow-blue-500/30' },
    { name: 'Inventario', icon: <Package className="w-10 h-10 text-white" />, href: '/inventory', gradient: 'from-rose-400 to-red-600', shadow: 'shadow-red-500/30', show: isSupervisor },
    { name: 'Ingresos', icon: <Inbox className="w-10 h-10 text-white" />, href: '/purchases', gradient: 'from-fuchsia-400 to-pink-600', shadow: 'shadow-fuchsia-500/30', show: isSupervisor },
    { name: 'Proveedores', icon: <Truck className="w-10 h-10 text-white" />, href: '/suppliers', gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/30', show: isSupervisor },
    { name: 'Traslados', icon: <ArrowRightLeft className="w-10 h-10 text-white" />, href: '/stock-transfers', gradient: 'from-purple-400 to-violet-600', shadow: 'shadow-purple-500/30', show: isSupervisor },
    { name: 'Reportes', icon: <FileText className="w-10 h-10 text-white" />, href: '/reports', gradient: 'from-indigo-400 to-indigo-600', shadow: 'shadow-indigo-500/30', show: isSupervisor },
    { name: 'Métricas', icon: <BarChart3 className="w-10 h-10 text-white" />, href: '/dashboard', gradient: 'from-orange-400 to-orange-600', shadow: 'shadow-orange-500/30', show: isSupervisor },
    { name: 'Sucursales', icon: <Building2 className="w-10 h-10 text-white" />, href: '/branches', gradient: 'from-cyan-400 to-cyan-600', shadow: 'shadow-cyan-500/30', show: isAdmin },
    { name: 'Equipo', icon: <Users className="w-10 h-10 text-white" />, href: '/users', gradient: 'from-pink-400 to-pink-600', shadow: 'shadow-pink-500/30', show: isAdmin },
    { name: 'Configuración', icon: <Settings className="w-10 h-10 text-white" />, href: '/settings', gradient: 'from-slate-400 to-slate-600', shadow: 'shadow-slate-500/30', show: isAdmin },
    { name: 'Auditoría', icon: <Activity className="w-10 h-10 text-white" />, href: '/audit', gradient: 'from-teal-400 to-emerald-600', shadow: 'shadow-emerald-500/30', show: isAdmin },
    { name: 'SaaS Global', icon: <Shield className="w-10 h-10 text-white" />, href: '/admin', gradient: 'from-slate-700 to-slate-900', shadow: 'shadow-slate-900/40', show: isSuperAdmin },
  ];

  const visibleApps = apps.filter(app => app.show !== false);

  return (
    <div className="min-h-screen w-full bg-[#f4f6f9] flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      
      {/* Top Right Unified Profile Widget */}
      <div className="absolute top-6 right-6 lg:right-10 flex items-center bg-white/60 backdrop-blur-md border border-white/40 shadow-sm rounded-2xl p-1.5 z-50 transition-transform hover:bg-white/90">
        
        {/* Avatar & Info */}
        <div className="flex items-center gap-3 pl-1 pr-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-inner flex items-center justify-center text-white font-bold text-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity"></div>
            {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden sm:flex flex-col">
             <span className="text-[13px] font-bold text-slate-800 tracking-tight leading-none">{session?.user?.name || 'Usuario'}</span>
             <span className="text-[9px] font-bold text-slate-400 tracking-[0.15em] uppercase mt-1">{role?.replace('_', ' ') || 'CAJERO'}</span>
          </div>
        </div>
        
        {/* Separator */}
        <div className="w-px h-8 bg-slate-200/80 mx-1 hidden sm:block"></div>
        
        {/* Action: Logout */}
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center justify-center w-10 h-10 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-xl"
          title="Cerrar Sesión Segura"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Decorative Odoo-style subtle top background */}
      <div className="absolute top-0 right-0 w-full h-96 bg-gradient-to-b from-slate-200/50 to-transparent -z-10 pointer-events-none"></div>

      <div className="w-full max-w-5xl z-10 flex flex-col items-center mt-[-4rem]">
        
        <div className="mb-14 text-center">
          <h1 className="text-4xl font-bold text-slate-800 tracking-tight">SIMTECH</h1>
          <p className="text-slate-500 font-bold text-sm tracking-widest mt-1">SISTEMA EMPRESARIAL</p>
        </div>
        
        <div className="flex flex-wrap justify-center content-center gap-x-8 gap-y-12 w-full max-w-4xl px-4 mt-8">
          {visibleApps.map(app => (
            <button
              key={app.name}
              onClick={() => router.push(app.href)}
              className="group flex flex-col items-center gap-4 w-[120px] outline-none"
            >
               <div className={`w-[95px] h-[95px] rounded-[1.75rem] flex items-center justify-center shadow-xl ${app.shadow} transition-all duration-300 group-hover:-translate-y-2 group-hover:scale-[1.05] group-active:scale-95 group-active:shadow-inner border border-white/20 bg-gradient-to-br ${app.gradient} relative overflow-hidden backdrop-blur-sm z-10`}>
                 <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                 {app.icon}
               </div>
               <span className="text-[14px] font-bold text-slate-700 text-center leading-tight group-hover:text-black transition-colors w-full tracking-tight">
                 {app.name}
               </span>
            </button>
          ))}
        </div>

      </div>
      
    </div>
  );
}
