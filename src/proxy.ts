import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { requireEnv } from '@/lib/env';

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico', '/logo.png'];
const nextAuthSecret = requireEnv('NEXTAUTH_SECRET');

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

  if (role === 'SUPER_ADMIN') {
    return NextResponse.next();
  }

  const adminPaths = ['/admin', '/onboarding', '/api/onboarding'];
  if (adminPaths.some((path) => pathname.startsWith(path))) {
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/apps', request.url));
    }
  }

  const companyPaths = ['/branches', '/users', '/settings', '/audit'];
  if (companyPaths.some((path) => pathname.startsWith(path))) {
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  const operationsPaths = ['/stock-transfers', '/inventory', '/purchases', '/suppliers', '/reports', '/dashboard'];
  if (operationsPaths.some((path) => pathname.startsWith(path))) {
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
