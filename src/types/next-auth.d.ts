import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CASHIER';
      companyId: string;
      branchId: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CASHIER';
    companyId: string;
    branchId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CASHIER';
    companyId: string;
    branchId: string | null;
  }
}
