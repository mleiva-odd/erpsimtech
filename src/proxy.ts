import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Get session token
  const token = await getToken({ req: request });

  // Redirect unauthenticated users to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;

  // SUPER_ADMIN bypasses all checks
  if (role === 'SUPER_ADMIN') {
    return NextResponse.next();
  }

  // Admin-only routes (platform)
  const superAdminPaths = ['/admin', '/onboarding', '/api/onboarding'];
  if (superAdminPaths.some(path => pathname.startsWith(path))) {
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/apps', request.url));
    }
  }

  // Company admin routes
  const companyAdminPaths = ['/branches', '/users', '/settings', '/audit'];
  if (companyAdminPaths.some(path => pathname.startsWith(path))) {
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Supervisor+ routes (Jefatura y Operaciones pesadas)
  const supervisorPaths = ['/stock-transfers', '/inventory', '/purchases', '/suppliers', '/reports', '/dashboard'];
  if (supervisorPaths.some(path => pathname.startsWith(path))) {
    if (role !== 'ADMIN' && role !== 'SUPERVISOR') {
      return NextResponse.redirect(new URL('/pos', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};
