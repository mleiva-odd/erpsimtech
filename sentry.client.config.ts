// Sentry — configuración para el bundle del CLIENTE (browser).
//
// Este archivo lo carga `@sentry/nextjs` automáticamente cuando hace build
// del cliente. Si `NEXT_PUBLIC_SENTRY_DSN` no está seteada, Sentry queda
// deshabilitado (no envía nada). Esto permite que dev local funcione sin
// tener un proyecto Sentry creado todavía.
//
// El DSN del cliente es público por diseño (va embebido en el bundle JS).
// Por eso el filtro de spam abusivo se hace del lado de Sentry, no acá.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Sample rate de tracing. 10% en prod para no quemar la cuota gratis.
    // Subir cuando se contrate plan pago.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay — capturar UI cuando hay error. 0% session sin error
    // para no exponer datos del POS / facturas.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    // No reportar errores en dev por default (mucho ruido de HMR/React).
    enabled: process.env.NODE_ENV === 'production',
  });
}
