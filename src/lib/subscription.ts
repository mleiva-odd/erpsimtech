import { prisma } from '@/lib/prisma';

/**
 * Verifies that the company's subscription is active.
 * Returns null if OK, or an error message if blocked.
 */
export async function checkSubscription(companyId: string): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { companyId },
  });

  if (!subscription) {
    return null; // No subscription record = allow (legacy companies)
  }

  const now = new Date();

  // Check status
  if (subscription.status === 'CANCELLED' || subscription.status === 'SUSPENDED') {
    return 'Tu suscripción ha sido suspendida. Contacta al administrador de la plataforma.';
  }

  // Check if trial/active period has ended
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
    // Grace period: 3 days after expiration
    const graceEnd = new Date(subscription.currentPeriodEnd);
    graceEnd.setDate(graceEnd.getDate() + 3);

    if (now > graceEnd) {
      return 'Tu período de prueba / suscripción ha expirado. Renueva para seguir operando.';
    }
  }

  return null; // All good
}
