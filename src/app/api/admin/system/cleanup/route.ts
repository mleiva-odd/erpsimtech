import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

const CleanupSchema = z.object({
  days: z.coerce.number().int().min(30, 'Mínimo 30 días').max(3650).default(180),
  types: z.array(z.enum(['audit', 'notifications'])).min(1).default(['audit', 'notifications']),
});

/**
 * Super Admin Utility to purge old logs and notifications.
 * Keeps the database lean and performant.
 */
export async function POST(req: NextRequest) {
  const result = await requirePermission('admin:all');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CleanupSchema.parse(body);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parsed.days);

    const results: Record<string, number> = {};

    if (parsed.types.includes('audit')) {
      const deletedAudit = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });
      results.deletedAuditLogs = deletedAudit.count;
    }

    if (parsed.types.includes('notifications')) {
      const deletedNotif = await prisma.notification.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });
      results.deletedNotifications = deletedNotif.count;
    }

    // Record the cleanup action itself
    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SYSTEM_CLEANUP',
      entity: 'System',
      entityId: 'global',
      details: {
        cutoffDate,
        ...results
      }
    });

    return NextResponse.json({
      message: 'Limpieza del sistema completada exitosamente',
      ...results,
      cutoffDate
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/system/cleanup');
  }
}
