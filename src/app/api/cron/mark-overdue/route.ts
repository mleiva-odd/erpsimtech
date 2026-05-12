import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { markOverdueDocuments, notifyOverdueSales } from '@/lib/ar-ap/overdue';

/**
 * Fase 17 · Cron diario para marcar documentos vencidos.
 *
 * Endpoint PÚBLICO (no requiere sesión) pero gateado por secret en header
 * `X-Cron-Secret`. El secret se compara contra `CRON_SECRET` env.
 *
 * Schedule: 1 vez al día (Vercel Cron / Supabase pg_cron / GitHub Actions).
 * Ver `docs/operations/aging-cron.md` para configurar.
 *
 * Ejemplos:
 *
 *   curl -X POST -H "X-Cron-Secret: $CRON_SECRET" \\
 *        https://erp.simtechgt.com/api/cron/mark-overdue
 *
 * Body opcional: { companyId: "..." } para correr solo en una empresa
 * (testing / re-procesamiento). Sin body → todas las empresas.
 *
 * Respuesta:
 *   200 { salesMarkedOverdue: N, payablesMarkedOverdue: N }
 *   401 si secret falta o no coincide
 *   500 si algo explota
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    // Si la env no está seteada, el endpoint queda desactivado por
    // diseño (no querés exponer un endpoint público sin protección).
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado en este ambiente' },
      { status: 503 },
    );
  }

  if (!provided || provided !== expected) {
    // Mensaje genérico para no filtrar info al atacante.
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let companyId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.companyId === 'string') {
      companyId = body.companyId;
    }
  } catch {
    // Body opcional. Si no se mandó nada o JSON inválido, ignoramos.
  }

  try {
    const result = await markOverdueDocuments(prisma, companyId);

    // m2 fix (verificación Fase 17): generar notificaciones in-app por las
    // sales recién marcadas OVERDUE. Sin esto el cron actualizaba status
    // pero no avisaba a nadie.
    let notificationsCreated = 0;
    if (result.newlyOverdueSaleIds.length > 0) {
      notificationsCreated = await notifyOverdueSales(prisma, result.newlyOverdueSaleIds);
    }

    return NextResponse.json({ ...result, notificationsCreated });
  } catch (err) {
    console.error('[cron/mark-overdue] error:', err);
    return NextResponse.json(
      {
        error: 'Falló el procesamiento de OVERDUE',
        details: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
