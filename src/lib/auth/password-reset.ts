/**
 * Fase 31b · Lógica de forgot/reset password.
 *
 * Diseño (OWASP-aligned):
 *
 *   1. Token = 32 bytes random (URL-safe base64) → 256 bits de entropía.
 *      Imposible de adivinar por fuerza bruta en cualquier ventana razonable.
 *
 *   2. En DB SOLO guardamos sha256(token). Si la DB se filtra, los tokens
 *      activos siguen siendo inválidos (no se puede revertir el hash).
 *      Usamos sha256 (no bcrypt) porque el token ya tiene 256 bits de
 *      entropía — bcrypt sería overkill y haría comparaciones lentas.
 *
 *   3. Single-use: una vez `usedAt` está seteado, no se puede reusar.
 *      Cuando se emite un nuevo token, los anteriores del mismo usuario
 *      se marcan como usados (revoca solicitudes pendientes).
 *
 *   4. Expiración corta (30 min default). Configurable vía env.
 *
 *   5. Endpoint forgot-password SIEMPRE devuelve 200, exista o no el
 *      email. Eso impide enumerar usuarios (timing-safe diff es
 *      imposible sin el usuario; al menos no filtramos por status code).
 *
 *   6. Rate limit por IP a nivel del endpoint. La verificación del
 *      email no se hace acá — el caller decide.
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/hashing';
import { ApiError } from '@/lib/api-error';
import { sendEmail } from '@/lib/email';
import { passwordResetTemplate } from '@/lib/email/templates';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/observability';

/** Minutos de validez del token. Configurable, default 30. */
export const PASSWORD_RESET_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TTL_MINUTES ?? '30',
);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://erp.simtechgt.com';

/**
 * Genera un token URL-safe (base64url sin padding).
 */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashea el token con sha256 (hex). Determinístico — buscar por hash en DB
 * sin necesidad de comparar uno por uno.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Comparación de strings constante en tiempo. Defensa contra timing attacks
 * cuando se compara el hash recibido con el almacenado.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Solicita un reseteo: si el email existe, genera token + envía email.
 * NUNCA lanza al caller si el email no existe — devuelve `{ ok: true }`
 * igual, para evitar enumeración. El caller siempre responde 200 al user.
 */
export async function requestPasswordReset(opts: {
  email: string;
  ipAddress?: string;
}): Promise<{ ok: true }> {
  const normalizedEmail = opts.email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, active: true, email: true },
    });

    if (!user || !user.active) {
      // No filtramos info. Log interno para auditoría / detección de abuso.
      logger.info('[password-reset] solicitud para email inexistente o inactivo', {
        email: normalizedEmail,
        ipAddress: opts.ipAddress,
      });
      return { ok: true };
    }

    // Genera token nuevo. Antes, invalida cualquier token anterior del
    // mismo user (para que el primer recibido no quede vivo si pide otro).
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        requestedIp: opts.ipAddress ?? null,
        expiresAt,
      },
    });

    // URL del email — apunta a la página /reset-password con el token plano
    // como query param. El token plano NO se persiste en ningún log.
    const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;

    const tpl = passwordResetTemplate({
      toName: user.name,
      resetUrl,
      validForMinutes: PASSWORD_RESET_TTL_MINUTES,
    });

    await sendEmail({
      to: { name: user.name, email: user.email },
      ...tpl,
    });

    logger.info('[password-reset] token emitido', {
      userId: user.id,
      ipAddress: opts.ipAddress,
      ttlMinutes: PASSWORD_RESET_TTL_MINUTES,
    });

    return { ok: true };
  } catch (err) {
    // No filtramos al caller (devolvemos ok); pero registramos en Sentry.
    captureException(err, {
      module: 'password-reset',
      action: 'request',
      email: normalizedEmail,
    });
    return { ok: true };
  }
}

/**
 * Consume un token: valida (existe, no usado, no expirado), actualiza la
 * password del user y marca el token como usado. Atómico en transacción.
 *
 * Lanza ApiError con mensaje genérico si falla (no filtra si el token
 * existió alguna vez vs si está mal escrito).
 */
export async function consumePasswordResetToken(opts: {
  token: string;
  newPassword: string;
}): Promise<{ ok: true; userId: string }> {
  // Validación de la política de password ANTES de tocar la DB.
  const validation = validatePasswordStrength(opts.newPassword);
  if (!validation.ok) {
    throw new ApiError(400, validation.errors.join(' '));
  }

  const tokenHash = hashResetToken(opts.token);

  const tokenRow = (await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      tokenHash: true,
    },
  })) as {
    id: string;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
    tokenHash: string;
  } | null;

  // Mensajes genéricos — un atacante no debe poder distinguir si fue
  // "token inexistente" / "expirado" / "usado". Toda forma de inválido
  // devuelve el mismo string.
  const invalid = () =>
    new ApiError(400, 'El link es inválido o ya expiró. Solicitá uno nuevo.');

  if (!tokenRow) throw invalid();
  // Defensa adicional contra cualquier confusión de stored vs received.
  if (!constantTimeEqual(tokenRow.tokenHash, tokenHash)) throw invalid();
  if (tokenRow.usedAt) throw invalid();
  if (tokenRow.expiresAt.getTime() < Date.now()) throw invalid();

  const newHash = await hashPassword(opts.newPassword);

  // Transacción interactiva: actualizar password + marcar token usado
  // en un solo go. Si una falla, ambas revierten.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: tokenRow.userId },
      data: { password: newHash },
    });
    await tx.passwordResetToken.update({
      where: { id: tokenRow.id },
      data: { usedAt: new Date() },
    });
    // Invalidar cualquier OTRO token pendiente de este usuario — defensa
    // en profundidad por si hubo race condition.
    await tx.passwordResetToken.updateMany({
      where: { userId: tokenRow.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  });

  logger.info('[password-reset] password actualizada por token', {
    userId: tokenRow.userId,
  });

  return { ok: true, userId: tokenRow.userId };
}
