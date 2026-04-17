import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';

/**
 * Super Admin Utility to purge old logs and notifications
 * Keeping the database lean and performant
 */
export async function POST(req: NextRequest) {
  const result = await requireRole('SUPER_ADMIN');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { days = 180, types = ['audit', 'notifications'] } = await req.json();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Number(days));

    const results: Record<string, number> = {};

    if (types.includes('audit')) {
      const deletedAudit = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });
      results.deletedAuditLogs = deletedAudit.count;
    }

    if (types.includes('notifications')) {
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
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: 'Error durante la limpieza del sistema' }, { status: 500 });
  }
}
