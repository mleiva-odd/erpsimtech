import { prisma } from '@/lib/prisma';

/**
 * Rate limiting para el endpoint de login.
 *
 * Estrategia: contar intentos FALLIDOS recientes por (email) y (ipAddress) en
 * una ventana móvil. Si cualquiera de los dos contadores supera su umbral,
 * bloqueamos. Los intentos exitosos no cuentan al límite.
 *
 * Por qué dos dimensiones:
 * - Solo email: un atacante con muchos IPs puede fuerza bruta sin tope.
 * - Solo IP: un atacante con un IP castiga a todos los empleados detrás del
 *   mismo NAT corporativo (caso real en oficinas).
 * - Combinado: balance razonable entre seguridad y usabilidad.
 *
 * Persistencia en Postgres (no en memoria) para que funcione en serverless
 * con N lambdas concurrentes y para que sobreviva redeploys.
 */

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;

export interface RateLimitResult {
  blocked: boolean;
  /**
   * Razón del bloqueo (para logging interno, NO para mostrar al usuario).
   * El mensaje al usuario debe ser siempre genérico para no filtrar info.
   */
  reason?: 'email' | 'ip';
  retryAfterSeconds: number;
}

/**
 * Chequea si un intento de login está bloqueado por rate limit.
 * NO registra el intento — eso lo hace `recordLoginAttempt` después.
 */
export async function checkLoginRateLimit(
  email: string,
  ipAddress: string,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);

  const [emailFailures, ipFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        ipAddress,
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  if (emailFailures >= MAX_FAILURES_PER_EMAIL) {
    return {
      blocked: true,
      reason: 'email',
      retryAfterSeconds: LOGIN_WINDOW_MINUTES * 60,
    };
  }

  if (ipFailures >= MAX_FAILURES_PER_IP) {
    return {
      blocked: true,
      reason: 'ip',
      retryAfterSeconds: LOGIN_WINDOW_MINUTES * 60,
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

/**
 * Registra un intento de login (exitoso o fallido).
 * Si falla la escritura, no rompemos el flujo — solo logueamos.
 */
export async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  success: boolean,
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: { email, ipAddress, success },
    });
  } catch (error) {
    console.error('Failed to record login attempt:', error);
  }
}

/**
 * Extrae la IP del cliente desde los headers de un request de Next/NextAuth.
 * Vercel y la mayoría de proxies envían `x-forwarded-for`. Caemos a `x-real-ip`
 * y por último a 'unknown' para no romper el flujo si no hay header.
 *
 * Acepta tanto el objeto `Request` de NextAuth (Headers nativo) como un objeto
 * plano `{ headers }` para compatibilidad con tests.
 */
type RequestLike = {
  headers?:
    | Headers
    | Record<string, string | string[] | undefined>;
};

export function getClientIp(req: RequestLike | undefined): string {
  if (!req?.headers) return 'unknown';

  const get = (name: string): string | undefined => {
    if (req.headers instanceof Headers) {
      return req.headers.get(name) ?? undefined;
    }
    const value = (req.headers as Record<string, string | string[] | undefined>)[name];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  // x-forwarded-for puede ser "client, proxy1, proxy2" — tomamos el primero.
  const xff = get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();

  const xri = get('x-real-ip');
  if (xri) return xri.trim();

  return 'unknown';
}
