import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { requireEnv } from '@/lib/env';

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico', '/logo.png'];
const nextAuthSecret = requireEnv('NEXTAUTH_SECRET');

function hasAnyPermission(permissions: string[], allowed: string[]) {
  return permissions.includes('admin:all') || allowed.some((permission) => permissions.includes(permission));
}

/**
 * Construye el valor del header Content-Security-Policy con un nonce único
 * por request. Sigue la guía oficial de Next.js 16:
 * https://nextjs.org/docs/app/guides/content-security-policy
 *
 * Notas clave:
 * - 'strict-dynamic' propaga la confianza desde scripts con nonce válido a
 *   los scripts que ellos carguen, así Next no necesita allowlist por script.
 * - 'unsafe-eval' solo en dev (React lo necesita para reconstruir stacks
 *   del server-side). En prod queda fuera.
 * - Estilos: mantenemos 'unsafe-inline' porque Tailwind y recharts inyectan
 *   estilos en línea sin nonce. Cerrarlo requeriría refactor mayor.
 * - upgrade-insecure-requests solo en producción.
 */
function buildCsp(nonce: string, isProd: boolean, supabaseHost: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://${supabaseHost}`,
    "font-src 'self' data:",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : '*.supabase.co';

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Aplica el header CSP y el x-nonce a una respuesta. Centralizado para que
 * las rutas que retornan early (redirect, public path) también lleven los
 * headers de seguridad si así lo decidimos. En este flujo, las redirects
 * van a otra ruta que volverá a pasar por proxy y obtendrá su propio nonce,
 * así que solo aplicamos CSP cuando vamos a continuar al render.
 */
function applyCsp(response: NextResponse, nonce: string, csp: string) {
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generar un nonce único por request. Buffer de un UUID v4 codificado en
  // base64 da ~22 caracteres impredecibles, suficiente entropía contra
  // brute force durante el ciclo de vida del response.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, IS_PROD, SUPABASE_HOST);

  // Inyectamos el nonce en los request headers para que la página downstream
  // pueda leerlo con headers() de next/headers y aplicarlo a <Script> tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Helper para cerrar un response con los headers correctos.
  const continueWith = (init?: { status?: number; headers?: Headers }) => {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
      ...(init ?? {}),
    });
    return applyCsp(response, nonce, csp);
  };

  if (pathname === '/') {
    return continueWith();
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return continueWith();
  }

  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return continueWith();
  }

  const token = await getToken({ req: request, secret: nextAuthSecret });

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    // No aplicamos CSP en redirects: la página de destino vuelve a pasar
    // por proxy y obtendrá un nonce nuevo.
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;
  const permissions = (token.permissions as string[]) || [];

  // SUPER_ADMIN bypasses all route checks
  if (role === 'SUPER_ADMIN') {
    return continueWith();
  }

  // Admin-only paths (Super Admin platform management)
  const adminPaths = ['/admin', '/onboarding', '/api/onboarding'];
  if (adminPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL('/apps', request.url));
  }

  const routePermissions: Array<{ paths: string[]; permissions: string[]; fallback: string }> = [
    { paths: ['/branches', '/settings', '/audit'], permissions: ['settings:manage'], fallback: '/dashboard' },
    { paths: ['/users'], permissions: ['users:manage', 'settings:manage'], fallback: '/dashboard' },
    { paths: ['/accounting'], permissions: ['treasury:view', 'treasury:manage'], fallback: '/dashboard' },
    { paths: ['/stock-transfers'], permissions: ['inventory:transfer', 'settings:manage'], fallback: '/dashboard' },
    { paths: ['/inventory'], permissions: ['inventory:view', 'settings:manage'], fallback: '/dashboard' },
    { paths: ['/purchases'], permissions: ['purchases:view', 'purchases:create', 'settings:manage'], fallback: '/dashboard' },
    { paths: ['/suppliers'], permissions: ['suppliers:view', 'suppliers:manage', 'settings:manage'], fallback: '/dashboard' },
    { paths: ['/reports', '/dashboard'], permissions: ['reports:view'], fallback: '/pos' },
    { paths: ['/sales'], permissions: ['sales:view', 'reports:view'], fallback: '/pos' },
    { paths: ['/customers'], permissions: ['customers:view', 'customers:manage', 'pos:access'], fallback: '/pos' },
    { paths: ['/hr'], permissions: ['hr:manage', 'payroll:manage', 'settings:manage'], fallback: '/dashboard' },
  ];

  const rule = routePermissions.find(({ paths }) => paths.some((path) => pathname.startsWith(path)));
  if (rule && !hasAnyPermission(permissions, rule.permissions)) {
    return NextResponse.redirect(new URL(rule.fallback, request.url));
  }

  return continueWith();
}

export const config = {
  matcher: [
    /*
     * Excluimos del proxy:
     * - _next/static, _next/image (assets de Next que ya tienen caching agresivo)
     * - favicon.ico
     * - cualquier path con extensión que no sea /api/ (.png, .svg, .css, etc.)
     * - prefetches de next/link (header next-router-prefetch o purpose=prefetch)
     *
     * Mantenemos CSP fuera de assets para no romper su caché ni recalcular
     * nonces en cada request a archivos estáticos.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
