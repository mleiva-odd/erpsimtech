import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/observability';

/**
 * POST /api/cron/maintenance
 *
 * Endpoint protegido por Bearer CRON_SECRET. Disparado por GitHub Actions
 * o Vercel Cron diariamente. Realiza limpieza periódica de tablas de baja
 * relevancia operativa para evitar crecimiento descontrolado.
 *
 * Tareas:
 *   1. Borrar PasswordResetToken con createdAt > 7 días
 *      (usados o expirados — ya no aportan).
 *   2. Borrar LoginAttempt con createdAt > 30 días
 *      (la ventana de rate-limit es 15 min, no necesitamos más).
 *
 * Devuelve { ok: true, counts: {...} } con cuántas filas se borraron de
 * cada tabla. El log estructurado registra el run para auditoría.
 *
 * Seguridad: requiere header Authorization: Bearer <CRON_SECRET>.
 * Si CRON_SECRET no está configurada, el endpoint devuelve 503 — esto
 * previene ataques mientras se setea el secret.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PASSWORD_RESET_RETENTION_DAYS = 7;
const LOGIN_ATTEMPT_RETENTION_DAYS = 30;

function authorize(req: NextRequest): { ok: true } | { error: NextResponse } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      error: NextResponse.json(
        { error: 'CRON_SECRET no configurada en el server' },
        { status: 503 },
      ),
    };
  }
  const header = req.headers.get('authorization');
  const expected = `Bearer ${secret}`;
  if (!header || header !== expected) {
    return {
      error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = authorize(req);
  if ('error' in auth) return auth.error;

  const startedAt = Date.now();
  const result = {
    ok: true as const,
    counts: {
      passwordResetTokens: 0,
      loginAttempts: 0,
    },
    elapsedMs: 0,
  };

  try {
    const passwordResetCutoff = new Date(
      Date.now() - PASSWORD_RESET_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const loginAttemptCutoff = new Date(
      Date.now() - LOGIN_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const prtDeleted = await prisma.passwordResetToken.deleteMany({
      where: { createdAt: { lt: passwordResetCutoff } },
    });
    result.counts.passwordResetTokens = (prtDeleted as { count?: number }).count ?? 0;

    const laDeleted = await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: loginAttemptCutoff } },
    });
    result.counts.loginAttempts = (laDeleted as { count?: number }).count ?? 0;

    result.elapsedMs = Date.now() - startedAt;

    logger.info('[cron:maintenance] limpieza ejecutada', {
      counts: result.counts,
      elapsedMs: result.elapsedMs,
      passwordResetRetentionDays: PASSWORD_RESET_RETENTION_DAYS,
      loginAttemptRetentionDays: LOGIN_ATTEMPT_RETENTION_DAYS,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    captureException(err, {
      module: 'cron:maintenance',
      counts: result.counts,
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'Error durante mantenimiento. Revisar logs.',
        partial: result.counts,
      },
      { status: 500 },
    );
  }
}

// GET devuelve 405 explícito para evitar que crawlers accidentales lo disparen.
export async function GET() {
  return NextResponse.json(
    { error: 'Método no permitido. Usar POST con Bearer CRON_SECRET.' },
    { status: 405 },
  );
}
