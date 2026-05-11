'use client';

// Boundary global de errores en App Router. Solo se invoca cuando un error
// crashea TODO el árbol (incluyendo el root layout). Para errores localizados
// usamos `error.tsx` en cada segmento.
//
// Reporta a Sentry si el cliente está inicializado. Si Sentry no está
// configurado (DSN ausente), captureException es no-op silencioso.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reportar el error con el digest de Next que aparece en logs server.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          maxWidth: '640px',
          margin: '2rem auto',
          color: '#1f2937',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Ocurrió un error inesperado
        </h1>
        <p style={{ marginBottom: '1rem' }}>
          Te pedimos disculpas. El equipo fue notificado automáticamente.
          Podés intentar recargar la página.
        </p>
        {error?.digest && (
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>
            Referencia: {error.digest}
          </p>
        )}
        <button
          onClick={() => reset()}
          style={{
            marginTop: '1.5rem',
            background: '#2563eb',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
