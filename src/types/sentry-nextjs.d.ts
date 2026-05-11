// Module shim para `@sentry/nextjs`. Provee tipos mínimos para que el
// typecheck pase ANTES de que el dueño corra `npm install` (la dep está
// declarada en package.json pero el sandbox no la instaló).
//
// Cuando se instale `@sentry/nextjs`, los tipos reales del paquete tienen
// precedencia automática y este shim queda inocuo (no se carga si el
// módulo real existe).
//
// Si en el futuro se quiere tipar más fino, BORRAR este archivo y dejar
// que TypeScript use los tipos oficiales del paquete instalado.

declare module '@sentry/nextjs' {
  export interface SentryInitOptions {
    dsn?: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
    enabled?: boolean;
    debug?: boolean;
    integrations?: unknown[];
    beforeSend?: (event: unknown, hint: unknown) => unknown | null | Promise<unknown | null>;
    [key: string]: unknown;
  }

  export function init(options: SentryInitOptions): void;
  export function captureException(exception: unknown, captureContext?: unknown): string;
  export function captureMessage(message: string, captureContext?: unknown): string;

  // Wrapper de next.config para inyectar source maps + tunnel.
  export function withSentryConfig<T>(nextConfig: T, sentryBuildOptions?: unknown): T;
}
