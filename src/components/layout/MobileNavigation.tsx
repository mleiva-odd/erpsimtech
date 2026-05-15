'use client';

/**
 * Fase 22a · Wrapper client-side para el sidebar + mobile header.
 *
 * Renderiza:
 *  1. El `ClientSidebar` desktop (md:flex, igual que antes).
 *  2. El main area con un mobile header (md:hidden) que incluye un
 *     `HamburgerButton` que abre un `MobileDrawer` con un sidebar mobile.
 *
 * Reemplaza la división server-side previa (sidebar + main area en el
 * layout) por una única raíz client-side, requerido para compartir el
 * estado `drawerOpen` sin context.
 */

import { useState, type ReactNode } from 'react';
import type { Session } from 'next-auth';
import { ClientSidebar } from './ClientSidebar';
import { MobileDrawer } from '@/components/ui/mobile-drawer';
import { HamburgerButton } from './HamburgerButton';
import { shouldCloseDrawer } from './mobile-nav.helpers';
import { Store } from 'lucide-react';

interface Props {
  session: Session | null;
  role: string;
  isAdmin: boolean;
  isSupervisor: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  children: ReactNode;
}

export function MobileNavigation(props: Props) {
  const { children, ...sidebarProps } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar (md:flex). En mobile queda hidden por el propio aside. */}
      <ClientSidebar {...sidebarProps} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header con hamburguesa */}
        <header className="md:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <HamburgerButton onClick={() => setDrawerOpen(true)} />
            <div className="flex items-center gap-2">
              <Store className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-slate-900">SIMTECH</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-auto h-full relative">{children}</main>
      </div>

      {/* Mobile drawer con sidebar replicado dentro */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ariaLabel="Navegación principal"
        widthClassName="w-72"
        showCloseButton={false}
      >
        <div
          className="h-full overflow-y-auto"
          onClick={(e) => {
            // Cerrar drawer al clickear cualquier link interno o botón con data-close-drawer.
            const target = e.target as HTMLElement;
            if (shouldCloseDrawer(target)) {
              setDrawerOpen(false);
            }
          }}
        >
          {/* Override del `hidden md:flex` del aside para visibilizarlo dentro del drawer. */}
          <div className="contents [&>aside]:!flex [&>aside]:!w-full">
            <ClientSidebar {...sidebarProps} />
          </div>
        </div>
      </MobileDrawer>
    </>
  );
}
