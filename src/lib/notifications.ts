import { prisma } from '@/lib/prisma';

export type NotificationType = 'INFO' | 'WARNING' | 'ERROR';

/**
 * Crea una notificación in-app para un tenant.
 * No lanza errores: si falla, lo registra y sigue para no romper el flujo de negocio.
 *
 * Vivía en `src/app/api/notifications/route.ts` y se importaba desde otros routes,
 * lo cual provoca acoplamiento y riesgo de imports circulares. Acá vive su lógica;
 * el route file la re-exporta por compatibilidad transitoria.
 */
export async function createNotification(
  companyId: string,
  title: string,
  message: string,
  type: NotificationType = 'INFO',
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        companyId,
        title,
        message,
        type,
      },
    });
  } catch (error) {
    console.error('Failed to create notification', error);
  }
}
