import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireCompanyTenant } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';
// Re-export para compatibilidad con código existente que importa
// `createNotification` desde este módulo. La lógica vive en `@/lib/notifications`.
export { createNotification } from '@/lib/notifications';

const UpdateNotificationSchema = z.object({
  // Si id está presente, marcamos esa sola; si no, marcamos todas como leídas.
  id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const result = await requireCompanyTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get('take') || '20'), 200);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const notifications = await prisma.notification.findMany({
      where: {
        companyId: tenant.companyId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching notifications' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const result = await requireCompanyTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    // Mark a specific notification or all notifications as read.
    const body = await req.json().catch(() => ({}));
    const { id } = UpdateNotificationSchema.parse(body);

    if (id) {
      await prisma.notification.updateMany({
        where: { id, companyId: tenant.companyId },
        data: { isRead: true }
      });
    } else {
      // Mark all as read
      await prisma.notification.updateMany({
        where: { companyId: tenant.companyId, isRead: false },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '/api/notifications PUT');
  }
}

// `createNotification` se mantiene exportado al inicio del archivo (re-export).
// Los nuevos consumidores deben importar directamente desde `@/lib/notifications`.
