import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestPasswordReset } from '@/lib/auth/password-reset';
import { getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/forgot-password
 *
 * Body: { email: string }
 *
 * Respuesta SIEMPRE 200 + { ok: true } — sin importar si el email existe.
 * Eso previene enumeración de usuarios.
 *
 * Rate limit por IP: 5 solicitudes / 15 min. Reutilizamos el modelo
 * LoginAttempt para no introducir una tabla nueva — los intentos se
 * registran con email="__forgot_password__" y success=false para que
 * no impacten el rate-limit de login normal.
 */

export const dynamic = 'force-dynamic';

const ForgotPasswordBody = z.object({
  email: z.string().email().max(254),
});

const FORGOT_PSEUDO_EMAIL = '__forgot_password__';
const RATE_LIMIT_WINDOW_MINUTES = 15;
const MAX_REQUESTS_PER_IP = 5;

async function checkForgotPasswordRateLimit(ipAddress: string): Promise<boolean> {
  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  );
  const count = await prisma.loginAttempt.count({
    where: {
      email: FORGOT_PSEUDO_EMAIL,
      ipAddress,
      createdAt: { gte: windowStart },
    },
  });
  return count >= MAX_REQUESTS_PER_IP;
}

async function recordForgotPasswordAttempt(ipAddress: string): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        email: FORGOT_PSEUDO_EMAIL,
        ipAddress,
        success: false,
      },
    });
  } catch (err) {
    logger.warn('[forgot-password] no se pudo registrar attempt', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ipAddress = getClientIp(req);
    const blocked = await checkForgotPasswordRateLimit(ipAddress);
    if (blocked) {
      // 429 explícito acá SÍ — un atacante que ya disparó N solicitudes
      // sabe el endpoint existe; el rate-limit defiende el costo del
      // email/DB, no la confidencialidad.
      return NextResponse.json(
        {
          ok: false,
          error: 'Demasiadas solicitudes. Esperá unos minutos.',
        },
        { status: 429 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = ForgotPasswordBody.safeParse(json);
    if (!parsed.success) {
      // Igual que el resto del flow, devolvemos 200 ok para no filtrar
      // qué emails fallan validación (formato inválido vs no existe).
      await recordForgotPasswordAttempt(ipAddress);
      return NextResponse.json({ ok: true });
    }

    await recordForgotPasswordAttempt(ipAddress);

    // requestPasswordReset es no-throw: hace todo el trabajo internamente,
    // incluyendo registrar errores en observability.
    await requestPasswordReset({
      email: parsed.data.email,
      ipAddress,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, '/api/auth/forgot-password POST');
  }
}
