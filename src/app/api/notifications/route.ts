import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCompanyTenant } from '@/lib/tenant';

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
    // Mark a specific notification or all notifications as read
    const body = await req.json();
    const { id } = body;

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
    return NextResponse.json({ error: 'Error updating notifications' }, { status: 500 });
  }
}

// Utility function to be used server-side (in other APIs like sales)
export async function createNotification(companyId: string, title: string, message: string, type: 'INFO' | 'WARNING' | 'ERROR' = 'INFO') {
  try {
    await prisma.notification.create({
      data: {
        companyId,
        title,
        message,
        type,
      }
    });
  } catch (error) {
    console.error('Failed to create notification', error);
  }
}
