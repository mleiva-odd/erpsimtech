import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { reserveNoteNumber } from '@/lib/sales';
import { z } from 'zod';

const DeliveryNoteItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive(),
});

const CreateDeliveryNoteSchema = z.object({
  saleId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  recipientName: z.string().min(1, 'El nombre del destinatario es obligatorio'),
  address: z.string().min(1, 'La dirección es obligatoria'),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(DeliveryNoteItemSchema).min(1, 'Debe incluir al menos un producto'),
});

export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '25');
  const branchId = searchParams.get('branchId');

  const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');
  const targetBranchId = (!isAdmin || !branchId || branchId === 'null') ? tenant.branchId : branchId;

  const where: Record<string, unknown> = { companyId: tenant.companyId };
  if (status && ['PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(status)) {
    where.status = status;
  }
  if (targetBranchId) where.branchId = targetBranchId;

  try {
    const [notes, total] = await Promise.all([
      prisma.deliveryNote.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          user: { select: { name: true } },
          sale: { select: { id: true, total: true } },
          branch: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.deliveryNote.count({ where }),
    ]);

    return NextResponse.json({ data: notes, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching delivery notes:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = CreateDeliveryNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { saleId, customerId, recipientName, address, phone, notes, items } = parsed.data;

  let branchId = tenant.branchId;
  if (!branchId) {
    const main = await prisma.branch.findFirst({ where: { companyId: tenant.companyId, isMain: true } });
    if (!main) return NextResponse.json({ error: 'Sin sucursal asignada' }, { status: 400 });
    branchId = main.id;
  }

  try {
    // Fase 20: lock atómico vía DeliveryNoteSequence (reemplaza el patrón
    // "leer último + sumar 1 + insert" que tenía race condition documentada
    // en phase-20-discovery.md §3 / H6).
    const note = await prisma.$transaction(async (tx) => {
      const reserved = await reserveNoteNumber(tx, tenant.companyId);
      return await tx.deliveryNote.create({
        data: {
          companyId: tenant.companyId,
          branchId,
          saleId: saleId || null,
          customerId: customerId || null,
          userId: tenant.userId,
          noteNumber: reserved.noteNumber,
          recipientName,
          address,
          phone: phone || null,
          notes: notes || null,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              variantId: i.variantId || null,
              quantity: i.quantity,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true } },
        },
      });
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error creating delivery note:', error);
    return NextResponse.json({ error: 'Error al crear nota de envío' }, { status: 500 });
  }
}
