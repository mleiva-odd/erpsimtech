import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/hashing";
import { requireEnv } from "@/lib/env";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  getClientIp,
} from "@/lib/rate-limit";

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
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          // Mensaje genérico — no filtra si el email existe o no.
          throw new Error("Credenciales inválidas");
        }

        const normalizedEmail = credentials.email.trim().toLowerCase();
        const ipAddress = getClientIp(req);

        // Rate limit antes de tocar la DB con verifyPassword (que es caro).
        // Mensaje genérico para no filtrar si el email existe.
        const limit = await checkLoginRateLimit(normalizedEmail, ipAddress);
        if (limit.blocked) {
          // No registramos este intento bloqueado para no inflar el contador
          // y permitir que el legítimo recupere acceso pasada la ventana.
          throw new Error(
            "Demasiados intentos. Esperá unos minutos antes de volver a probar.",
          );
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: {
            company: { select: { id: true, active: true } },
            customRole: { select: { name: true, permissions: true } },
          },
        });

        const passwordOk =
          !!user && (await verifyPassword(credentials.password, user.password));

        if (!user || !passwordOk) {
          await recordLoginAttempt(normalizedEmail, ipAddress, false);
          throw new Error("Credenciales inválidas");
        }

        if (!user.active) {
          // Cuenta como fallo: que un atacante no use cuentas desactivadas para evitar bloqueo.
          await recordLoginAttempt(normalizedEmail, ipAddress, false);
          throw new Error("Usuario inactivo");
        }

        // Check if the company is active (skip for SUPER_ADMIN who has no company)
        if (user.company && !user.company.active) {
          await recordLoginAttempt(normalizedEmail, ipAddress, false);
          throw new Error("La empresa está suspendida. Contacte al administrador.");
        }

        // Login exitoso: registrar para auditoría y liberar el contador.
        await recordLoginAttempt(normalizedEmail, ipAddress, true);

        // Fase 51 · Marcar último login. NO bloqueante: si falla, el login
        // sigue. Útil para que SUPER_ADMIN detecte usuarios durmientes.
        // Cast vía unknown: tolera desfase de tipos cuando el cliente Prisma
        // local no fue regenerado tras la migración. Vercel regenera en
        // postinstall así que en producción los tipos son correctos.
        prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() } as unknown as Prisma.UserUpdateInput,
          })
          .catch((err: unknown) => {
            console.warn('[auth] no se pudo actualizar lastLoginAt', err);
          });

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
    // El cookie name y el flag `secure` se derivan del **scheme de NEXTAUTH_URL**,
    // no de NODE_ENV. Razón: en CI corremos `npm run start` (NODE_ENV=production)
    // sobre http://localhost:3000, y si forzamos `Secure` + el prefijo `__Secure-`
    // el browser rechaza silenciosamente la cookie por la spec W3C ("Secure cookies
    // can only be set over HTTPS"). Resultado anterior: login server-side ok pero
    // sin cookie en el browser → rebote a /login?callbackUrl=... en cada test e2e.
    //
    // En producción real (Vercel), NEXTAUTH_URL=https://… → isHttps=true → cookie
    // segura como antes (sin cambio funcional). En dev/CI sobre http → cookie
    // normal, browser la acepta, sesión funciona.
    //
    // Patrón espejo del default interno de NextAuth (useSecureCookies basado en URL).
    sessionToken: (() => {
      const isHttps =
        process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
      return {
        name: isHttps
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax" as const,
          path: "/",
          secure: isHttps,
        },
      };
    })(),
  },
  secret: nextAuthSecret,
};
