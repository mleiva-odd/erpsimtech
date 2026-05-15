import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { CommandPaletteProvider } from "@/components/command-palette";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const permissions = session?.user?.permissions || [];
  const isAdmin = role === 'SUPER_ADMIN' || permissions.includes('settings:manage');
  const isSupervisor = isAdmin || permissions.includes('reports:view');
  const isSuperAdmin = role === 'SUPER_ADMIN';

  return (
    <CommandPaletteProvider>
      <div className="h-screen bg-slate-50 flex overflow-hidden">
        <MobileNavigation
          session={session}
          role={role || ''}
          isAdmin={isAdmin}
          isSupervisor={isSupervisor}
          isSuperAdmin={isSuperAdmin}
          permissions={permissions}
        >
          {children}
        </MobileNavigation>
      </div>
    </CommandPaletteProvider>
  );
}
