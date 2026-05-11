// Sentry — configuración para el bundle del SERVER (Node runtime).
//
// Carga el DSN privado del server (NO el público) si está disponible. Si
// `SENTRY_DSN` no está seteada, Sentry queda deshabilitado.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // En server las traces son más baratas (no afectan UX). 10% en prod.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    enabled: process.env.NODE_ENV === 'production',
  });
}
