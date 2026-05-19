'use client';

/**
 * Fase 53 · Banner contextual de estado de cuenta.
 *
 * Solo se renderiza si hay info accionable: trial por vencer, suscripción
 * suspendida, plan trial sin vencimiento (estado raro), etc.
 *
 * Si la cuenta está al día y pagando, no se muestra nada (no contamina la UI).
 *
 * Carga lazy desde /api/auth/me/account. Si falla la API, oculta el banner
 * silenciosamente — no queremos que un error de subscripción rompa la app.
 */

import { useEffect, useState } from 'react';
import { AlertCircle, XCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import { getWhatsAppUrl } from '@/lib/utils';

interface AccountStatus {
  company: { id: string; name: string; active: boolean } | null;
  subscription: {
    plan: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  trialDaysLeft: number | null;
}

export function AccountStatusBanner() {
  const [status, setStatus] = useState<AccountStatus | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me/account', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as AccountStatus;
        if (!aborted) setStatus(json);
      } catch {
        // silenciosamente ignoramos
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  if (!status?.company || !status.subscription) return null;

  // Suspendida: no debería estar accediendo a la app, pero igual mostramos.
  if (!status.company.active) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Cuenta suspendida.</strong> Tu acceso fue pausado.
            Contactanos para reactivar.
          </span>
          <a
            href={getWhatsAppUrl(
              `Hola, mi cuenta SIMTECH (${status.company.name}) fue suspendida y quiero reactivarla.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 text-xs font-medium whitespace-nowrap"
          >
            Reactivar por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  // Trial activa con días restantes
  if (status.subscription.status === 'TRIAL' && status.trialDaysLeft !== null) {
    const days = status.trialDaysLeft;
    const urgent = days <= 3;
    const bg = urgent ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200';
    const text = urgent ? 'text-amber-800' : 'text-blue-800';
    const Icon = urgent ? AlertCircle : Clock;

    return (
      <div className={`${bg} border-b px-4 py-2`}>
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm">
          <Icon className={`w-4 h-4 shrink-0 ${text}`} />
          <span className={text}>
            <strong>Trial gratuito</strong>
            {days === 0
              ? ' · vence hoy.'
              : days === 1
                ? ' · vence mañana.'
                : ` · te quedan ${days} días.`}
            {' '}Para seguir usando el sistema, contratá un plan.
          </span>
          <a
            href={getWhatsAppUrl(
              `Hola, quiero contratar un plan de SIMTECH ERP para ${status.company.name}.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className={`ml-auto px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
              urgent
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Contratar plan
          </a>
          <Link
            href="/legal/support"
            className={`text-xs hover:underline whitespace-nowrap ${text}`}
          >
            Ayuda
          </Link>
        </div>
      </div>
    );
  }

  // PAST_DUE / SUSPENDED / cualquier estado no-activo
  if (
    status.subscription.status !== 'ACTIVE' &&
    status.subscription.status !== 'TRIAL'
  ) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Suscripción {status.subscription.status}.</strong>{' '}
            Contactanos para regularizar.
          </span>
          <a
            href={getWhatsAppUrl(
              `Hola, mi cuenta SIMTECH (${status.company.name}) tiene status ${status.subscription.status}.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 text-xs font-medium whitespace-nowrap"
          >
            Contactar
          </a>
        </div>
      </div>
    );
  }

  // ACTIVE pagando — no se muestra nada.
  return null;
}
