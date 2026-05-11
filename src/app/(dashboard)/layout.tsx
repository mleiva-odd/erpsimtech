import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Store } from "lucide-react";
import { ClientSidebar } from "@/components/layout/ClientSidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const permissions = session?.user?.permissions || [];
  const isAdmin = role === 'SUPER_ADMIN' || permissions.includes('settings:manage');
  const isSupervisor = isAdmin || permissions.includes('reports:view');
  const isSuperAdmin = role === 'SUPER_ADMIN';

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      <ClientSidebar 
        session={session} 
        role={role || ''} 
        isAdmin={isAdmin} 
        isSupervisor={isSupervisor} 
        isSuperAdmin={isSuperAdmin} 
        permissions={permissions}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between z-10 sticky top-0">
          <div className="flex items-center gap-2">
            <Store className="w-6 h-6 text-blue-600" />
            <span className="font-bold text-slate-900">SIMTECH</span>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-auto h-full relative">
          {children}
        </main>
      </div>
    </div>
  );
}
