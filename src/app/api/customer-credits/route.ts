import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Casts a `any` deliberados: ver explicación en src/lib/ar-ap/aging.ts.

/**
 * Fase 17 · CRUD de CustomerCredit (anticipos + saldos a favor manuales).
 */

const CreateSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.enum(['ADVANCE_PAYMENT', 'MANUAL_CREDIT']),
  notes: z.string().max(1000).optional().nullable(),
});

const ALLOWED_STATUS = ['ACTIVE', 'PARTIALLY_APPLIED', 'FULLY_APPLIED', 'CANCELLED'];

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const result = await requirePermission('treasury:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const sp = req.nextUrl.searchParams;
  const customerId = sp.get('customerId');
  const status = sp.get('status');
  const page = Math.max(1, Number(sp.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '50')));

  const where: Record<string, unknown> = { companyId: tenant.companyId };
  if (customerId) where.customerId = customerId;
  if (status && ALLOWED_STATUS.includes(status)) where.status = status;

  try {
    const [credits, total] = await Promise.all([
      (prisma as any).customerCredit.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, nit: true } },
          applications: {
            select: { id: true, saleId: true, amount: true, appliedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).customerCredit.count({ where }),
    ]);

    return NextResponse.json({
      credits,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[customer-credits] GET error:', err);
    return NextResponse.json({ error: 'Error al listar créditos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  let parsed: z.infer<typeof CreateSchema>;
  try {
    const body = await req.json();
    parsed = CreateSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  // Validar que el cliente pertenezca a esta empresa (tenant guard).
  const customer = await prisma.customer.findFirst({
    where: { id: parsed.customerId, companyId: tenant.companyId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  try {
    const credit = await (prisma as any).customerCredit.create({
      data: {
        companyId: tenant.companyId,
        customerId: parsed.customerId,
        amount: parsed.amount,
        balance: parsed.amount,
        status: 'ACTIVE',
        reason: parsed.reason,
        referenceType: 'MANUAL_DEPOSIT',
        referenceId: null,
        notes: parsed.notes ?? null,
        userId: tenant.userId,
      },
    });

    return NextResponse.json(credit, { status: 201 });
  } catch (err) {
    console.error('[customer-credits] POST error:', err);
    return NextResponse.json({ error: 'Error al crear crédito' }, { status: 500 });
  }
}
