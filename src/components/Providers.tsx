'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
