import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  // Only ADMINs or SUPER_ADMINs can view the full audit log
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || '';
  const entity = searchParams.get('entity') || '';
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  const whereOptions: Prisma.AuditLogWhereInput = { companyId: tenant.companyId };
  if (action) whereOptions.action = action;
  if (entity) whereOptions.entity = entity;

  try {
    const logs = await prisma.auditLog.findMany({
      where: whereOptions,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        user: { select: { name: true, email: true } },
        branch: { select: { name: true } },
      },
    });

    const total = await prisma.auditLog.count({ where: whereOptions });

    return NextResponse.json({
      logs,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Audit API Error:', error);
    return NextResponse.json({ error: 'Error al obtener los registros de auditoría' }, { status: 500 });
  }
}
