'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Store, Package, Users, BarChart3, Building2, Settings, ArrowRightLeft, Shield, Activity, LogOut } from 'lucide-react';
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
    { name: 'Punto de Venta', icon: <Store className="w-10 h-10 text-white" />, href: '/pos', color: 'bg-[#00A09D]' },
    { name: 'Inventario', icon: <Package className="w-10 h-10 text-white" />, href: '/inventory', color: 'bg-[#E36460]' },
    { name: 'Traslados', icon: <ArrowRightLeft className="w-10 h-10 text-white" />, href: '/stock-transfers', color: 'bg-[#986ECA]', show: isSupervisor },
    { name: 'Clientes', icon: <Users className="w-10 h-10 text-white" />, href: '/customers', color: 'bg-[#40A4D5]' },
    { name: 'Métricas', icon: <BarChart3 className="w-10 h-10 text-white" />, href: '/dashboard', color: 'bg-[#F2A65A]' },
    { name: 'Sucursales', icon: <Building2 className="w-10 h-10 text-white" />, href: '/branches', color: 'bg-[#5173B3]', show: isAdmin },
    { name: 'Equipo', icon: <Users className="w-10 h-10 text-white" />, href: '/users', color: 'bg-[#D6579E]', show: isAdmin },
    { name: 'Configuración', icon: <Settings className="w-10 h-10 text-white" />, href: '/settings', color: 'bg-[#737F8E]', show: isAdmin },
    { name: 'Auditoría', icon: <Activity className="w-10 h-10 text-white" />, href: '/audit', color: 'bg-[#3AA876]', show: isAdmin },
    { name: 'SaaS Global', icon: <Shield className="w-10 h-10 text-white" />, href: '/admin', color: 'bg-[#2B3A4A]', show: isSuperAdmin },
  ];

  const visibleApps = apps.filter(app => app.show !== false);

  return (
    <div className="min-h-screen w-full bg-[#f4f6f9] flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      
      {/* Top Right Logout */}
      <button 
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors shadow-sm text-sm font-bold"
      >
        <LogOut className="w-4 h-4" /> Cerrar Sesión
      </button>

      {/* Decorative Odoo-style subtle top background */}
      <div className="absolute top-0 right-0 w-full h-96 bg-gradient-to-b from-slate-200/50 to-transparent -z-10 pointer-events-none"></div>

      <div className="w-full max-w-5xl z-10 flex flex-col items-center mt-[-4rem]">
        
        <div className="mb-14 text-center">
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">SIMTECH</h1>
          <p className="text-slate-500 font-bold text-sm tracking-widest mt-1">SISTEMA EMPRESARIAL</p>
        </div>
        
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-6 gap-y-10 justify-items-center w-full max-w-4xl px-4">
          {visibleApps.map(app => (
            <button
              key={app.name}
              onClick={() => router.push(app.href)}
              className="group flex flex-col items-center gap-3 w-[110px] outline-none"
            >
               <div className={`w-[85px] h-[85px] rounded-2xl flex items-center justify-center shadow-md transition-all duration-200 group-hover:scale-105 group-active:scale-95 group-active:shadow-inner border border-black/5 ${app.color}`}>
                 {app.icon}
               </div>
               <span className="text-[13px] font-bold text-slate-700 text-center leading-tight group-hover:text-black transition-colors w-full">
                 {app.name}
               </span>
            </button>
          ))}
        </div>

      </div>
      
      {/* User Info Footer inside Launcher */}
      <div className="absolute bottom-10 text-center flex flex-col items-center gap-1">
         <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 font-bold text-xs shadow-inner">
           {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
         </div>
         <p className="text-xs font-bold text-slate-500 mt-1">
            Conectado como <span className="text-slate-700">{session?.user?.name}</span>
         </p>
      </div>

    </div>
  );
}
