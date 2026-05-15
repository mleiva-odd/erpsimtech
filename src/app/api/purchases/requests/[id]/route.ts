import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission([
    'purchases:view',
    'purchases:request',
    'purchases:create',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const pr = await prisma.purchaseRequest.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        purchaseOrder: { select: { id: true, status: true } },
      },
    });
    if (!pr) throw new ApiError(404, 'PR no encontrada.');
    return NextResponse.json(pr);
  } catch (error) {
    return handleApiError(error, '/api/purchases/requests/[id] GET');
  }
}
