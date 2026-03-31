'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { 
  Home, Store, Settings, Package, Users, BarChart3, 
  Building2, Shield, ArrowRightLeft, Activity, 
  ChevronLeft, ChevronRight, AppWindow
} from 'lucide-react';
import { NotificationsMenu } from '@/components/layout/NotificationsMenu';
import { LogoutButton } from '@/components/layout/LogoutButton';

// Definir la interfaz de props que recibirá
interface SidebarProps {
  session: any;
  role: string;
  isAdmin: boolean;
  isSupervisor: boolean;
  isSuperAdmin: boolean;
}

export function ClientSidebar({ session, role, isAdmin, isSupervisor, isSuperAdmin }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const NavItem = ({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) => {
    const isActive = pathname === href;
    return (
      <a 
        href={href} 
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
          isActive 
            ? 'bg-blue-600/20 text-blue-400' 
            : 'text-slate-300 hover:text-white hover:bg-slate-800 shadow-sm'
        }`}
        title={isCollapsed ? label : undefined}
      >
        <div className="shrink-0">{icon}</div>
        {!isCollapsed && <span className="font-medium text-sm whitespace-nowrap">{label}</span>}
      </a>
    );
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => {
    if (isCollapsed) return <div className="my-4 border-t border-slate-800" />;
    return (
      <div className="mt-6 mb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        {children}
      </div>
    );
  };

  return (
    <aside 
      className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-slate-300 hidden md:flex flex-col relative transition-all duration-300 border-r border-slate-800 z-50`}
    >
      {/* Botón retráctil */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3.5 top-6 w-7 h-7 bg-slate-800 border-2 border-slate-900 text-slate-300 rounded-full flex items-center justify-center hover:text-white hover:bg-blue-600 transition-colors z-50 shadow-md"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Header Logo (App Launcher Return) */}
      <a 
        href="/apps" 
        className={`h-16 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} border-b border-slate-800 transition-all hover:bg-slate-800/50 cursor-pointer group`}
        title="Volver a Aplicaciones"
      >
        <div className="shrink-0 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
          <Store className="w-5 h-5 text-white" />
        </div>
        {!isCollapsed && (
          <>
            <span className="text-white font-black text-lg tracking-wide ml-3 group-hover:text-blue-400 transition-colors">SIMTECH</span>
            {isSuperAdmin && (
              <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-black tracking-wider">
                ADMIN
              </span>
            )}
          </>
        )}
      </a>
      
      {/* Navegación */}
      <nav className={`flex-1 py-4 flex flex-col gap-1 overflow-y-auto ${isCollapsed ? 'px-3 items-center' : 'px-4'} custom-scrollbar`}>
        <NavItem href="/dashboard" icon={<Home className="w-5 h-5" />} label="Métricas" />
        <NavItem href="/pos" icon={<Store className="w-5 h-5" />} label="Punto de Venta" />
        
        <SectionTitle>Operación</SectionTitle>
        <NavItem href="/inventory" icon={<Package className="w-5 h-5" />} label="Inventario" />
        <NavItem href="/customers" icon={<Users className="w-5 h-5" />} label="Clientes" />
        <NavItem href="/reports" icon={<BarChart3 className="w-5 h-5" />} label="Reportes" />
        
        {isSupervisor && (
          <NavItem href="/stock-transfers" icon={<ArrowRightLeft className="w-5 h-5" />} label="Transferencias" />
        )}

        {isAdmin && (
          <>
            <SectionTitle>Administración</SectionTitle>
            <NavItem href="/branches" icon={<Building2 className="w-5 h-5" />} label="Sucursales" />
            <NavItem href="/users" icon={<Users className="w-5 h-5" />} label="Equipo" />
            <NavItem href="/audit" icon={<Activity className="w-5 h-5" />} label="Auditoría" />
            <NavItem href="/settings" icon={<Settings className="w-5 h-5" />} label="Configuración" />
          </>
        )}

        {isSuperAdmin && (
          <>
            <SectionTitle>SaaS Global</SectionTitle>
            <NavItem href="/admin" icon={<Shield className="w-5 h-5" />} label="Empresas" />
          </>
        )}
      </nav>

      {/* Footer Info Usuario */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-3' : 'justify-between'} mb-4`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shadow-inner">
              {session?.user?.name?.charAt(0) || 'U'}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white truncate w-24">
                  {session?.user?.name || 'Usuario'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                  {role?.replace('_', ' ') || 'CAJERO'}
                </span>
              </div>
            )}
          </div>
          <div className={isCollapsed ? '' : ''}>
             <NotificationsMenu />
          </div>
        </div>
        
        {!isCollapsed && <LogoutButton />}
      </div>
    </aside>
  );
}
