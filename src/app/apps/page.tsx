'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  Store, Package, Users, BarChart3, Building2, Settings, 
  ArrowRightLeft, Shield, Activity, LogOut, Truck, Inbox, 
  FileText, LayoutGrid, Search, Bell 
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AccountStatusBanner } from '@/components/AccountStatusBanner';

export default function AppLauncher() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const permissions = session?.user?.permissions || [];
  const hasCompanyContext = Boolean(session?.user?.companyId);
  const isAdmin = role === 'SUPER_ADMIN' || permissions.includes('settings:manage');
  const isSupervisor = isAdmin || permissions.includes('reports:view');
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const appGroups = [
    {
      title: "Operación y Ventas",
      apps: [
        { id: 'pos', name: 'Punto de Venta', icon: Store, href: '/pos', bgColor: 'bg-gradient-to-br from-green-500 to-green-600', show: true, description: "Sistema POS" },
        { id: 'clients', name: 'Clientes', icon: Users, href: '/customers', bgColor: 'bg-gradient-to-br from-blue-500 to-blue-600', show: true, description: "Base de clientes" },
        { id: 'sales', name: 'Ventas', icon: FileText, href: '/sales', bgColor: 'bg-gradient-to-br from-emerald-600 to-emerald-700', show: isSupervisor, description: "Historial y cobros" },
        { id: 'delivery', name: 'Notas de Envío', icon: Truck, href: '/sales/delivery-notes', bgColor: 'bg-gradient-to-br from-sky-500 to-sky-600', show: isSupervisor, description: "Despachos y entregas" },
      ]
    },
    {
      title: "Bodega y Logística",
      apps: [
        { id: 'inventory', name: 'Inventario', icon: Package, href: '/inventory', bgColor: 'bg-gradient-to-br from-red-500 to-red-600', show: isSupervisor, description: "Gestión de stock" },
        { id: 'purchases', name: 'Ingresos', icon: Inbox, href: '/purchases', bgColor: 'bg-gradient-to-br from-fuchsia-400 to-pink-600', show: isSupervisor, description: "Ingresos a bodega" },
        { id: 'suppliers', name: 'Proveedores', icon: Truck, href: '/suppliers', bgColor: 'bg-gradient-to-br from-orange-500 to-orange-600', show: isSupervisor, description: "Gestión de proveedores" },
        { id: 'transfers', name: 'Traslados', icon: ArrowRightLeft, href: '/stock-transfers', bgColor: 'bg-gradient-to-br from-purple-500 to-purple-600', show: isSupervisor, description: "Entre sucursales" },
      ]
    },
    {
      title: "Finanzas y Estrategia",
      apps: [
        { id: 'accounting', name: 'Contabilidad y Bancos', icon: Activity, href: '/accounting/banks', bgColor: 'bg-gradient-to-br from-violet-600 to-violet-700', show: isAdmin, description: "Gestión de Tesorería" },
        { id: 'reports', name: 'Reportes', icon: FileText, href: '/reports', bgColor: 'bg-gradient-to-br from-indigo-500 to-indigo-600', show: isSupervisor, description: "Informes y análisis" },
        { id: 'metrics', name: 'Métricas', icon: BarChart3, href: '/dashboard', bgColor: 'bg-gradient-to-br from-amber-500 to-amber-600', show: isSupervisor, description: "KPIs y dashboards" },
      ]
    },
    {
      title: "Sistema y Configuración",
      apps: [
        { id: 'branches', name: 'Sucursales', icon: Building2, href: '/branches', bgColor: 'bg-gradient-to-br from-cyan-500 to-cyan-600', show: isAdmin, description: "Gestión de tiendas" },
        { id: 'team', name: 'Equipo', icon: Users, href: '/users', bgColor: 'bg-gradient-to-br from-rose-500 to-rose-600', show: isAdmin, description: "Usuarios y roles" },
        { id: 'settings', name: 'Configuración', icon: Settings, href: '/settings', bgColor: 'bg-gradient-to-br from-slate-500 to-slate-600', show: isAdmin, description: "Ajustes del sistema" },
        { id: 'audit', name: 'Auditoría', icon: Activity, href: '/audit', bgColor: 'bg-gradient-to-br from-teal-500 to-teal-600', show: isAdmin, description: "Logs y actividad" },
        { id: 'admin', name: 'SaaS Global', icon: Shield, href: '/admin', bgColor: 'bg-gradient-to-br from-slate-700 to-slate-900', show: isSuperAdmin, description: "Admin global" },
      ]
    }
  ];

  // Helper for search functionality
  const allApps = appGroups.flatMap(g => g.apps);
  const visibleApps = allApps.filter(app => app.show !== false);
  const filteredModules = visibleApps.filter((module) =>
    module.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const userName = session?.user?.name || "Usuario";
  const firstName = userName.split(' ')[0];
  const userInitials = userName.substring(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <AccountStatusBanner />
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <LayoutGrid className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl text-slate-900 font-bold">SIMTECH</h1>
                <p className="text-xs text-slate-500">Sistema ERP/POS</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  placeholder="Buscar aplicaciones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 bg-slate-50 border-slate-200 focus:border-blue-300 focus:ring-blue-200 w-full"
                />
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              {/* Notifications */}
              <button
                onClick={() => {
                  if (hasCompanyContext) {
                    router.push('/notifications');
                  }
                }}
                className={`relative p-2 rounded-lg transition-colors ${hasCompanyContext ? 'hover:bg-slate-100' : 'cursor-not-allowed opacity-40'}`}
                disabled={!hasCompanyContext}
                title={hasCompanyContext ? 'Ver notificaciones' : 'Las notificaciones requieren una empresa activa'}
              >
                <Bell className="h-5 w-5 text-slate-600" />
                {hasCompanyContext && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>}
              </button>

              {/* User Menu */}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-sm text-white shadow-md font-bold">
                  {userInitials}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm text-slate-900 font-bold">{userName}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{role?.replace('_', ' ') || 'CAJERO'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="text-slate-600 hover:text-red-500 hover:bg-red-50"
                  title="Cerrar Sesión"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl mb-3 text-slate-900 font-bold">
            Bienvenido, {firstName} 👋
          </h2>
          <p className="text-lg text-slate-600">
            Selecciona una aplicación para comenzar
          </p>
        </motion.div>

        {/* Mobile Search Bar */}
        <div className="sm:hidden mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Buscar aplicaciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-white border-slate-200"
            />
          </div>
        </div>

        {/* Applications Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {searchQuery ? (
            filteredModules.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {filteredModules.map((module, index) => (
                  <motion.button
                    key={module.id}
                    onClick={() => router.push(module.href)}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.4, type: "spring", stiffness: 100 }}
                    whileHover={{ scale: 1.08, y: -8, transition: { duration: 0.2 } }}
                    whileTap={{ scale: 0.95 }}
                    className="group relative bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-100 transition-all duration-300"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/0 group-hover:from-blue-50/50 group-hover:to-transparent rounded-2xl transition-all duration-300 pointer-events-none" />
                    <div className="relative pointer-events-none">
                      <div className={`w-16 h-16 rounded-2xl ${module.bgColor} flex items-center justify-center mb-4 mx-auto shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-300`}>
                        <module.icon className="h-8 w-8 text-white" />
                      </div>
                      <p className="text-sm text-slate-700 group-hover:text-slate-900 font-medium transition-colors">{module.name}</p>
                      {module.description && <p className="text-xs text-slate-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">{module.description}</p>}
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">
                  No se encontraron aplicaciones que coincidan con &quot;{searchQuery}&quot;
                </p>
              </motion.div>
            )
          ) : (
            <div className="space-y-12">
              {appGroups.map((group, groupIndex) => {
                const groupApps = group.apps.filter(app => app.show !== false);
                if (groupApps.length === 0) return null;
                return (
                  <div key={groupIndex}>
                    <h3 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-200 pb-2">{group.title}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                      {groupApps.map((module, index) => (
                        <motion.button
                          key={module.id}
                          onClick={() => router.push(module.href)}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.4, type: "spring", stiffness: 100 }}
                          whileHover={{ scale: 1.08, y: -8, transition: { duration: 0.2 } }}
                          whileTap={{ scale: 0.95 }}
                          className="group relative bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-100 transition-all duration-300"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/0 group-hover:from-blue-50/50 group-hover:to-transparent rounded-2xl transition-all duration-300 pointer-events-none" />
                          <div className="relative pointer-events-none">
                            <div className={`w-16 h-16 rounded-2xl ${module.bgColor} flex items-center justify-center mb-4 mx-auto shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-300`}>
                              <module.icon className="h-8 w-8 text-white" />
                            </div>
                            <p className="text-sm text-slate-700 group-hover:text-slate-900 font-medium transition-colors">{module.name}</p>
                            {module.description && <p className="text-xs text-slate-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">{module.description}</p>}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Footer Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center mt-16"
        >
          <p className="text-sm text-slate-400 font-medium">
            SimTech Guatemala • Sistema Empresarial ERP/POS
          </p>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Versión 2.0 • {new Date().getFullYear()}
          </p>
        </motion.div>
      </main>
    </div>
  );
}
