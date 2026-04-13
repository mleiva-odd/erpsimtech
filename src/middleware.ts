import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Define public paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico', '/logo.png'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow landing page (root) explicitly
  if (pathname === '/') {
    return NextResponse.next();
  }

  // 2. Allow other public paths
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 3. Allow static assets (images, css, js)
  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 4. Get session token (using next-auth)
  const token = await getToken({ req: request });

  // 5. Redirect unauthenticated users to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;

  // 6. RBAC Logic (Roles & Permissions)
  
  // SUPER_ADMIN bypasses all checks
  if (role === 'SUPER_ADMIN') {
    return NextResponse.next();
  }

  // Admin-only routes (Platform Management)
  const adminPaths = ['/admin', '/onboarding', '/api/onboarding'];
  if (adminPaths.some(path => pathname.startsWith(path))) {
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/apps', request.url));
    }
  }

  // Company management routes (Active Company Admins)
  const companyPaths = ['/branches', '/users', '/settings', '/audit'];
  if (companyPaths.some(path => pathname.startsWith(path))) {
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Operations/Logistics (Supervisor+)
  const operationsPaths = ['/stock-transfers', '/inventory', '/purchases', '/suppliers', '/reports', '/dashboard'];
  if (operationsPaths.some(path => pathname.startsWith(path))) {
    if (role !== 'ADMIN' && role !== 'SUPERVISOR') {
      return NextResponse.redirect(new URL('/pos', request.url));
    }
  }

  return NextResponse.next();
}

// Optimization: Match all paths except internal Next.js ones and some assets
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};
