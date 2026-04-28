import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'SUPER_ADMIN' | 'USER';
      companyId: string;
      branchId: string | null;
      customRoleName?: string;
      permissions: string[];
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: 'SUPER_ADMIN' | 'USER';
    companyId: string;
    branchId: string | null;
    customRoleName?: string;
    permissions?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'SUPER_ADMIN' | 'USER';
    companyId: string;
    branchId: string | null;
    customRoleName?: string;
    permissions?: string[];
  }
}
