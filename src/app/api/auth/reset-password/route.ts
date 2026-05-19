import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { consumePasswordResetToken } from '@/lib/auth/password-reset';
import { getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-error';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/reset-password
 *
 * Body: { token: string, newPassword: string }
 *
 * - Valida token, expiración y single-use.
 * - Aplica nueva password (bcrypt rounds 12).
 * - Devuelve 200 + { ok: true } en éxito; 400 con mensaje genérico
 *   si el link es inválido/expirado o la password no cumple política.
 *
 * IMPORTANTE: el endpoint NO crea sesión automáticamente — el cliente
 * redirige a /login para que el user entre con la nueva password.
 * Eso simplifica la cookie story y reduce superficie de ataque.
 */

export const dynamic = 'force-dynamic';

const ResetPasswordBody = z.object({
  token: z.string().min(16).max(128),
  newPassword: z.string().min(12).max(256),
});

export async function POST(req: NextRequest) {
  try {
    const ipAddress = getClientIp(req);
    const json = await req.json().catch(() => ({}));
    const parsed = ResetPasswordBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Datos inválidos. Verificá el token y la contraseña.',
        },
        { status: 400 },
      );
    }

    const { userId } = await consumePasswordResetToken({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
    });

    logger.info('[reset-password] password reseteada', {
      userId,
      ipAddress,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, '/api/auth/reset-password POST');
  }
}
