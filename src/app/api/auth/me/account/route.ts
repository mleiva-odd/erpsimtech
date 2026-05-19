import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * GET /api/auth/me/account
 *
 * Devuelve estado de la suscripción del usuario actual. Útil para que la UI
 * pueda mostrar avisos contextuales ("tu trial vence en N días", etc.) sin
 * que cada componente tenga que hacer su propia query.
 *
 * SUPER_ADMIN sin company devuelve company:null + sub:null (no aplica).
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    if (!tenant.companyId) {
      return NextResponse.json({
        company: null,
        subscription: null,
        trialDaysLeft: null,
      });
    }

    const data = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: {
        id: true,
        name: true,
        active: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            maxBranches: true,
            maxUsersPerBranch: true,
          },
        },
      },
    })) as {
      id: string;
      name: string;
      active: boolean;
      subscription: {
        plan: string;
        status: string;
        trialEndsAt: Date | null;
        currentPeriodEnd: Date | null;
        maxBranches: number;
        maxUsersPerBranch: number;
      } | null;
    } | null;

    if (!data) {
      return NextResponse.json({
        company: null,
        subscription: null,
        trialDaysLeft: null,
      });
    }

    const now = Date.now();
    const trialDaysLeft = data.subscription?.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (data.subscription.trialEndsAt.getTime() - now) / 86_400_000,
          ),
        )
      : null;

    return NextResponse.json({
      company: { id: data.id, name: data.name, active: data.active },
      subscription: data.subscription,
      trialDaysLeft,
    });
  } catch (error) {
    return handleApiError(error, '/api/auth/me/account GET');
  }
}
