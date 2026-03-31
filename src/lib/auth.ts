import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@simtech.com" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Credenciales inválidas");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            company: { select: { id: true, active: true } },
          },
        });

        if (!user || !(await bcrypt.compare(credentials.password, user.password))) {
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
          role: user.role,
          companyId: user.companyId || '',
          branchId: user.branchId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        token.branchId = user.branchId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'CASHIER';
        session.user.companyId = token.companyId as string;
        session.user.branchId = token.branchId as string | null;
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET || "simtech_pos_secret_dev_key_change_in_prod",
};
