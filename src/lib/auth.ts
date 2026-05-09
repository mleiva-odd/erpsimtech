import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/hashing";
import { requireEnv } from "@/lib/env";

const nextAuthSecret = requireEnv("NEXTAUTH_SECRET");

type AuthRole = 'SUPER_ADMIN' | 'USER';

type AuthUserPayload = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  companyId: string;
  branchId: string | null;
  customRoleName?: string;
  permissions: string[];
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@example.com" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          // Mensaje genérico — no filtra si el email existe o no.
          throw new Error("Credenciales inválidas");
        }

        const normalizedEmail = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: {
            company: { select: { id: true, active: true } },
            customRole: { select: { name: true, permissions: true } },
          },
        });

        if (!user || !(await verifyPassword(credentials.password, user.password))) {
          throw new Error("Credenciales inválidas");
        }

        if (!user.active) {
          throw new Error("Usuario inactivo");
        }

        // Check if the company is active (skip for SUPER_ADMIN who has no company)
        if (user.company && !user.company.active) {
          throw new Error("La empresa está suspendida. Contacte al administrador.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as AuthRole,
          companyId: user.companyId || '',
          branchId: user.branchId,
          customRoleName: user.customRole?.name,
          permissions: user.customRole?.permissions || [],
        } satisfies AuthUserPayload;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role as AuthRole;
        token.companyId = user.companyId;
        token.branchId = user.branchId;
        token.customRoleName = user.customRoleName;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'SUPER_ADMIN' | 'USER';
        session.user.companyId = token.companyId as string;
        session.user.branchId = token.branchId as string | null;
        session.user.customRoleName = token.customRoleName as string | undefined;
        session.user.permissions = (token.permissions as string[]) || [];
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    // 14 días: balance entre comodidad y radio de daño en caso de robo de cookie.
    // Bajamos de los 30 días originales. Combinado con `userVersion` (Sprint 2.C)
    // permite revocación inmediata al cambiar contraseña / desactivar usuario.
    maxAge: 14 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60, // refrescar el token cada 24h de actividad
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  secret: nextAuthSecret,
};
