import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/observability';
import { sendEmail } from '@/lib/email';
import { paymentReminderTemplate } from '@/lib/email/templates';
import { createAuditLog } from '@/lib/audit';

/**
 * POST /api/cron/trial-warnings
 *
 * Endpoint protegido por Bearer CRON_SECRET. Disparado diariamente por
 * GitHub Actions. Busca subscripciones en TRIAL cuyo trialEndsAt cae
 * exactamente en 7 días o 1 día (calendario), y envía email de recordatorio
 * al admin de la empresa usando paymentReminderTemplate.
 *
 * Idempotente: registra cada email enviado en AuditLog con action
 * TRIAL_WARNING_SENT y filtra por (companyId, action, daysRemaining).
 * Si el mismo email ya se mandó hoy, se salta.
 *
 * Si Resend no está configurado, sendEmail solo loguea — sigue siendo
 * idempotente porque el AuditLog se escribe igual.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const WARNING_OFFSETS = [7, 1] as const;
type WarningOffset = (typeof WARNING_OFFSETS)[number];

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
  if (!header || header !== `Bearer ${secret}`) {
    return {
      error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    };
  }
  return { ok: true };
}

/**
 * Devuelve el rango [start, end) de fechas (UTC) para un día determinado
 * en términos del calendario de servidor. Útil para que "exactamente N
 * días desde hoy" sea robusto frente a horario de ejecución del cron.
 */
function dayRangeFromOffset(offsetDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function findTrialsExpiringIn(
  offsetDays: WarningOffset,
): Promise<
  Array<{
    companyId: string;
    companyName: string;
    adminEmail: string | null;
    adminName: string | null;
    trialEndsAt: Date;
  }>
> {
  const { start, end } = dayRangeFromOffset(offsetDays);

  const subs = (await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      trialEndsAt: { gte: start, lt: end },
    },
    select: {
      companyId: true,
      trialEndsAt: true,
      company: {
        select: {
          name: true,
          active: true,
          users: {
            select: { name: true, email: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
  })) as Array<{
    companyId: string;
    trialEndsAt: Date | null;
    company: {
      name: string;
      active: boolean;
      users: Array<{ name: string; email: string; role: string; createdAt: Date }>;
    };
  }>;

  return subs
    .filter((s) => s.company.active && s.trialEndsAt !== null)
    .map((s) => ({
      companyId: s.companyId,
      companyName: s.company.name,
      adminName: s.company.users[0]?.name ?? null,
      adminEmail: s.company.users[0]?.email ?? null,
      trialEndsAt: s.trialEndsAt as Date,
    }));
}

async function alreadySent(
  companyId: string,
  daysRemaining: WarningOffset,
): Promise<boolean> {
  // Buscamos un AuditLog con la misma acción y la misma cantidad de días
  // restantes para esta empresa. Filtrar por changes.daysRemaining requiere
  // path JSON — usamos una llave que combine ambos en el entity para no
  // depender de filtrado JSON específico de proveedor.
  const exists = await prisma.auditLog.findFirst({
    where: {
      companyId,
      action: 'TRIAL_WARNING_SENT',
      entity: `trial-${daysRemaining}d`,
    },
    select: { id: true },
  });
  return Boolean(exists);
}

interface RunReport {
  ok: true;
  countsByOffset: Record<number, { found: number; sent: number; skipped: number }>;
  elapsedMs: number;
}

export async function POST(req: NextRequest) {
  const auth = authorize(req);
  if ('error' in auth) return auth.error;

  const start = Date.now();
  const report: RunReport = {
    ok: true,
    countsByOffset: {},
    elapsedMs: 0,
  };

  try {
    for (const offset of WARNING_OFFSETS) {
      report.countsByOffset[offset] = { found: 0, sent: 0, skipped: 0 };
      const trials = await findTrialsExpiringIn(offset);
      report.countsByOffset[offset].found = trials.length;

      for (const t of trials) {
        if (!t.adminEmail) {
          report.countsByOffset[offset].skipped += 1;
          continue;
        }

        if (await alreadySent(t.companyId, offset)) {
          report.countsByOffset[offset].skipped += 1;
          continue;
        }

        const dueDate = t.trialEndsAt.toLocaleDateString('es-GT', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        const tpl = paymentReminderTemplate({
          toName: t.adminName ?? undefined,
          companyName: t.companyName,
          amountDue: 'Trial — contactanos para activar tu plan',
          dueDate,
          daysRemaining: offset,
        });

        await sendEmail({
          to: { name: t.adminName ?? undefined, email: t.adminEmail },
          ...tpl,
        });

        // Registramos el envío para idempotencia inter-runs.
        await createAuditLog({
          companyId: t.companyId,
          userId: 'system',
          action: 'TRIAL_WARNING_SENT',
          entity: `trial-${offset}d`,
          entityId: t.companyId,
          details: {
            daysRemaining: offset,
            trialEndsAt: t.trialEndsAt.toISOString(),
            sentTo: t.adminEmail,
          },
        });

        report.countsByOffset[offset].sent += 1;
      }
    }

    report.elapsedMs = Date.now() - start;
    logger.info('[cron:trial-warnings] run completado', { ...report });
    return NextResponse.json(report);
  } catch (err) {
    captureException(err, { module: 'cron:trial-warnings' });
    return NextResponse.json(
      { ok: false, error: 'Error durante envío de avisos. Revisar logs.', partial: report },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Método no permitido. Usar POST con Bearer CRON_SECRET.' },
    { status: 405 },
  );
}
