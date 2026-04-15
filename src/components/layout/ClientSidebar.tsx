'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  Home, Store, Settings, Package, Users, BarChart3, 
  Building2, Shield, ArrowRightLeft, Activity, 
  ChevronLeft, ChevronRight, Truck, Inbox
} from 'lucide-react';
import { NotificationsMenu } from '@/components/layout/NotificationsMenu';
import { LogoutButton } from '@/components/layout/LogoutButton';
import { BranchSelector } from '@/components/layout/BranchSelector';
import { Session } from 'next-auth';

// Definir la interfaz de props que recibirá
interface SidebarProps {
  session: Session | null;
  role: string;
  isAdmin: boolean;
  isSupervisor: boolean;
  isSuperAdmin: boolean;
}

const NavItem = ({ href, icon, label, pathname, isCollapsed }: { href: string; icon: React.ReactNode; label: string; pathname: string; isCollapsed: boolean }) => {
  const isActive = pathname === href;
  return (
    <a 
      href={href} 
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
        isActive 
          ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500 rounded-r-none' 
          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
      }`}
      title={isCollapsed ? label : undefined}
    >
      <div className="shrink-0">{icon}</div>
      {!isCollapsed && <span className="font-medium text-sm whitespace-nowrap">{label}</span>}
    </a>
  );
};

const SectionTitle = ({ children, isCollapsed }: { children: React.ReactNode; isCollapsed: boolean }) => {
  if (isCollapsed) return <div className="my-4 border-t border-slate-800" />;
  return (
    <div className="mt-6 mb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
      {children}
    </div>
  );
};

export function ClientSidebar({ session: initialSession, role: propRole, isAdmin: propIsAdmin, isSupervisor: propIsSupervisor, isSuperAdmin: propIsSuperAdmin }: SidebarProps) {
  const { data: sessionData } = useSession();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  // RSC and CSR sync resolution to avoid ghost-flashes on soft navigation
  const activeSession = sessionData || initialSession;
  const reliableRole = activeSession?.user?.role || propRole;
  
  const isSuperAdmin = reliableRole === 'SUPER_ADMIN' || propIsSuperAdmin;
  const isAdmin = reliableRole === 'ADMIN' || isSuperAdmin || propIsAdmin;
  const isSupervisor = reliableRole === 'SUPERVISOR' || isAdmin || propIsSupervisor;

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <aside 
      className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-slate-300 hidden md:flex flex-col relative transition-all duration-300 border-r border-slate-800 z-50`}
    >
      {/* Botón retráctil */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3.5 top-6 w-7 h-7 bg-slate-800 border-2 border-slate-900 text-slate-400 rounded-full flex items-center justify-center hover:text-white hover:bg-blue-600 transition-all z-50 shadow-lg"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Header Logo (App Launcher Return) */}
      <a 
        href="/apps" 
        className={`h-16 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} border-b border-slate-800 transition-all hover:bg-slate-800/50 cursor-pointer group mb-4`}
        title="Volver a Aplicaciones"
      >
        <div className="shrink-0 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
          <Store className="w-5 h-5 text-white" />
        </div>
        {!isCollapsed && (
          <>
            <span className="text-white font-bold text-xl tracking-tight ml-3 group-hover:text-blue-400 transition-colors">SIMTECH</span>
          </>
        )}
      </a>

      {/* Selector de Contexto Multi-Sucursal */}
      <BranchSelector isCollapsed={isCollapsed} />
      
      {/* Navegación */}
      <nav className={`flex-1 flex flex-col gap-1 overflow-y-auto ${isCollapsed ? 'px-3 items-center' : 'px-4'} custom-scrollbar`}>
        {/* Operación Base (Cajeros) */}
        <NavItem href="/pos" icon={<Store className="w-5 h-5" />} label="Punto de Venta" pathname={pathname || ''} isCollapsed={isCollapsed} />
        <NavItem href="/customers" icon={<Users className="w-5 h-5" />} label="Clientes" pathname={pathname || ''} isCollapsed={isCollapsed} />
        
        {/* Jefatura / Operación Pesada (Supervisores y Admins) */}
        {isSupervisor && (
          <>
            <SectionTitle isCollapsed={isCollapsed}>Métricas y Operación</SectionTitle>
            <NavItem href="/dashboard" icon={<Home className="w-5 h-5" />} label="Métricas" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/inventory" icon={<Package className="w-5 h-5" />} label="Inventario" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/purchases" icon={<Inbox className="w-5 h-5" />} label="Ingresos de Bodega" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/suppliers" icon={<Truck className="w-5 h-5" />} label="Proveedores" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/reports" icon={<BarChart3 className="w-5 h-5" />} label="Reportes" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/stock-transfers" icon={<ArrowRightLeft className="w-5 h-5" />} label="Transferencias" pathname={pathname || ''} isCollapsed={isCollapsed} />
          </>
        )}

        {isAdmin && (
          <>
            <SectionTitle isCollapsed={isCollapsed}>Administración</SectionTitle>
            <NavItem href="/branches" icon={<Building2 className="w-5 h-5" />} label="Sucursales" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/users" icon={<Users className="w-5 h-5" />} label="Equipo" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/audit" icon={<Activity className="w-5 h-5" />} label="Auditoría" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/settings" icon={<Settings className="w-5 h-5" />} label="Configuración" pathname={pathname || ''} isCollapsed={isCollapsed} />
          </>
        )}

        {isSuperAdmin && (
          <>
            <SectionTitle isCollapsed={isCollapsed}>SaaS Global</SectionTitle>
            <NavItem href="/admin" icon={<Shield className="w-5 h-5" />} label="Empresas" pathname={pathname || ''} isCollapsed={isCollapsed} />
          </>
        )}
      </nav>

      {/* Footer Info Usuario */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-3' : 'justify-between'} mb-4`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shadow-inner">
              {activeSession?.user?.name?.charAt(0) || 'U'}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white truncate w-24">
                  {activeSession?.user?.name || 'Usuario'}
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {reliableRole?.replace('_', ' ') || 'CAJERO'}
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
