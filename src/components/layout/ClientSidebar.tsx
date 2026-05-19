'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  Home, Store, Settings, Package, Users, BarChart3, 
  Building2, Shield, ArrowRightLeft, Activity, Bell,
  ChevronLeft, ChevronRight, Truck, Inbox,
  ReceiptText, FileText, Calculator, HandCoins, CreditCard, List, Landmark, Key, UserCheck, Wallet, ClipboardCheck, Palmtree
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
  permissions: string[];
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

const MenuGroup = ({ icon, label, children, isCollapsed, active = false }: { icon: React.ReactNode; label: string; children: React.ReactNode; isCollapsed: boolean; active?: boolean }) => {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const isOpen = active || isManuallyOpen;

  if (isCollapsed) {
    return (
      <div className="mb-2 w-full">
        <div className="my-3 mx-2 border-t border-slate-800" />
        <div className="flex flex-col gap-1 w-full">{children}</div>
      </div>
    );
  }

  return (
    <div className="mb-1.5 w-full">
      <button 
        onClick={() => setIsManuallyOpen((current) => !current)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0 text-slate-400 group-hover:text-white transition-colors">{icon}</div>
          <span className="font-bold text-sm whitespace-nowrap uppercase tracking-wider text-[11px]">{label}</span>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="mt-1 ml-5 pl-3 border-l border-slate-700/50 flex flex-col gap-1">
          {children}
        </div>
      )}
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
  const hasCompanyContext = Boolean(activeSession?.user?.companyId);
  
  const isSuperAdmin = reliableRole === 'SUPER_ADMIN' || propIsSuperAdmin;
  const permissions = activeSession?.user?.permissions || [];
  const can = (permission: string) => isSuperAdmin || permissions.includes('admin:all') || permissions.includes(permission);
  const isAdmin = can('settings:manage') || propIsAdmin;
  const isSupervisor = isAdmin || can('reports:view') || propIsSupervisor;
  const canViewSales = isSupervisor || can('sales:view');
  const canViewInventory = isAdmin || can('inventory:view') || can('inventory:transfer') || can('purchases:view') || can('suppliers:view');
  const canViewFinance = isSuperAdmin || can('treasury:view') || can('treasury:manage');
  const canViewHr = isAdmin || can('hr:manage') || can('payroll:manage');
  const canViewUsers = can('users:manage') || isAdmin;

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
      <nav className={`flex-1 flex flex-col gap-1 overflow-y-auto pt-2 pb-4 ${isCollapsed ? 'px-3 items-center' : 'px-3'} custom-scrollbar`}>
        
        {/* Siempre visible */}
        <NavItem href="/dashboard" icon={<Home className="w-5 h-5" />} label="Dashboard" pathname={pathname || ''} isCollapsed={isCollapsed} />
        {hasCompanyContext && (
          <NavItem href="/notifications" icon={<Bell className="w-5 h-5" />} label="Notificaciones" pathname={pathname || ''} isCollapsed={isCollapsed} />
        )}

        <MenuGroup 
          icon={<Store className="w-5 h-5" />} 
          label="Operaciones (POS)" 
          isCollapsed={isCollapsed}
          active={pathname?.startsWith('/pos') || pathname?.startsWith('/customers')}
        >
          <NavItem href="/pos" icon={<Store className="w-5 h-5" />} label="Punto de Venta" pathname={pathname || ''} isCollapsed={isCollapsed} />
          <NavItem href="/customers" icon={<Users className="w-5 h-5" />} label="Directorio de Clientes" pathname={pathname || ''} isCollapsed={isCollapsed} />
        </MenuGroup>
        
        {canViewSales && (
          <MenuGroup 
            icon={<ReceiptText className="w-5 h-5" />} 
            label="Ventas Comerciales" 
            isCollapsed={isCollapsed}
            active={pathname?.startsWith('/sales')}
          >
            <NavItem href="/sales" icon={<List className="w-5 h-5" />} label="Historial de Ventas" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/sales/delivery-notes" icon={<FileText className="w-5 h-5" />} label="Notas de Envío" pathname={pathname || ''} isCollapsed={isCollapsed} />
          </MenuGroup>
        )}

        {canViewInventory && (
          <MenuGroup 
            icon={<Package className="w-5 h-5" />} 
            label="Bodega y Logística" 
            isCollapsed={isCollapsed}
            active={pathname?.startsWith('/inventory') || pathname?.startsWith('/purchases') || pathname?.startsWith('/stock-transfers') || pathname?.startsWith('/suppliers')}
          >
            {(isAdmin || can('inventory:view')) && <NavItem href="/inventory" icon={<Package className="w-5 h-5" />} label="Inventario" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {(isAdmin || can('purchases:view') || can('purchases:create')) && <NavItem href="/purchases" icon={<Inbox className="w-5 h-5" />} label="Ingresos (Compras)" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {(isAdmin || can('inventory:transfer')) && <NavItem href="/stock-transfers" icon={<ArrowRightLeft className="w-5 h-5" />} label="Traslados" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {(isAdmin || can('suppliers:view') || can('suppliers:manage')) && <NavItem href="/suppliers" icon={<Truck className="w-5 h-5" />} label="Proveedores" pathname={pathname || ''} isCollapsed={isCollapsed} />}
          </MenuGroup>
        )}

        {canViewFinance && (
          <MenuGroup 
            icon={<Landmark className="w-5 h-5" />} 
            label="Finanzas" 
            isCollapsed={isCollapsed}
            active={pathname?.startsWith('/accounting')}
          >
            <NavItem href="/accounting/banks" icon={<Landmark className="w-5 h-5" />} label="Bancos y Tesorería" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/accounting" icon={<Calculator className="w-5 h-5" />} label="Contabilidad General" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/accounting/receivables" icon={<HandCoins className="w-5 h-5" />} label="Cuentas por Cobrar" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/accounting/payables" icon={<CreditCard className="w-5 h-5" />} label="Cuentas por Pagar" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/accounting/reports" icon={<FileText className="w-5 h-5" />} label="Reportes Contables" pathname={pathname || ''} isCollapsed={isCollapsed} />
          </MenuGroup>
        )}

        {canViewHr && (
          <MenuGroup 
            icon={<UserCheck className="w-5 h-5" />} 
            label="Recursos Humanos" 
            isCollapsed={isCollapsed}
            active={pathname?.startsWith('/hr')}
          >
            {(isAdmin || can('hr:manage')) && <NavItem href="/hr/employees" icon={<Users className="w-5 h-5" />} label="Personal" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {(isAdmin || can('hr:manage')) && <NavItem href="/hr/attendance" icon={<ClipboardCheck className="w-5 h-5" />} label="Asistencia" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {(isAdmin || can('hr:manage')) && <NavItem href="/hr/leaves" icon={<Palmtree className="w-5 h-5" />} label="Vacaciones y Permisos" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {(isAdmin || can('payroll:manage')) && <NavItem href="/hr/payroll" icon={<Wallet className="w-5 h-5" />} label="Planillas" pathname={pathname || ''} isCollapsed={isCollapsed} />}
          </MenuGroup>
        )}

        {(isSupervisor || canViewUsers) && (
          <MenuGroup 
            icon={<Settings className="w-5 h-5" />} 
            label="Configuración" 
            isCollapsed={isCollapsed}
            active={pathname?.startsWith('/reports') || pathname?.startsWith('/branches') || pathname?.startsWith('/users') || pathname?.startsWith('/audit') || pathname?.startsWith('/settings')}
          >
            {isSupervisor && <NavItem href="/reports" icon={<BarChart3 className="w-5 h-5" />} label="Reportes" pathname={pathname || ''} isCollapsed={isCollapsed} />}
            {isAdmin && (
              <>
                <NavItem href="/branches" icon={<Building2 className="w-5 h-5" />} label="Sucursales" pathname={pathname || ''} isCollapsed={isCollapsed} />
                <NavItem href="/audit" icon={<Activity className="w-5 h-5" />} label="Auditoría" pathname={pathname || ''} isCollapsed={isCollapsed} />
                <NavItem href="/settings" icon={<Settings className="w-5 h-5" />} label="Ajustes Generales" pathname={pathname || ''} isCollapsed={isCollapsed} />
              </>
            )}
            {canViewUsers && (
              <>
                <NavItem href="/users" icon={<Users className="w-5 h-5" />} label="Equipo" pathname={pathname || ''} isCollapsed={isCollapsed} />
                <NavItem href="/users/roles" icon={<Key className="w-5 h-5" />} label="Roles y Permisos" pathname={pathname || ''} isCollapsed={isCollapsed} />
              </>
            )}
          </MenuGroup>
        )}

        {isSuperAdmin && (
          <MenuGroup
            icon={<Shield className="w-5 h-5" />}
            label="SaaS Global"
            isCollapsed={isCollapsed}
            active={pathname?.startsWith('/admin')}
          >
            <NavItem href="/admin" icon={<Shield className="w-5 h-5" />} label="Empresas y Planes" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/admin/companies" icon={<Building2 className="w-5 h-5" />} label="Directorio Global" pathname={pathname || ''} isCollapsed={isCollapsed} />
            <NavItem href="/admin/health" icon={<Activity className="w-5 h-5" />} label="Health Dashboard" pathname={pathname || ''} isCollapsed={isCollapsed} />
          </MenuGroup>
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
          {hasCompanyContext && (
            <div className={isCollapsed ? '' : ''}>
              <NotificationsMenu />
            </div>
          )}
        </div>
        
        {!isCollapsed && <LogoutButton />}
      </div>
    </aside>
  );
}
