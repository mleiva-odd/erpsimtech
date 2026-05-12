import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { requireEnv } from '@/lib/env';

// Rutas que NO requieren sesión de usuario.
// - /api/auth: handshake de NextAuth.
// - /api/health: liveness probe (Fase 13). Sin auth para que monitoreo
//   externo y el cron anti-pausa de Supabase puedan pingearlo.
// - /api/cron/*: endpoints invocados por cron jobs externos (GitHub Actions,
//   pg_cron, Vercel Cron). Cada endpoint individual valida su propio
//   secret en header `X-Cron-Secret`.
// - /_next, /favicon.ico, /logo.png: assets estáticos.
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/health',
  '/api/cron',
  '/_next',
  '/favicon.ico',
  '/logo.png',
];
const nextAuthSecret = requireEnv('NEXTAUTH_SECRET');

function hasAnyPermission(permissions: string[], allowed: string[]) {
  return permissions.includes('admin:all') || allowed.some((permission) => permissions.includes(permission));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: nextAuthSecret });

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;
  const permissions = (token.permissions as string[]) || [];

  // SUPER_ADMIN bypasses all route checks
  if (role === 'SUPER_ADMIN') {
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};
