import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';

const UpdateCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Nombre requerido'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  nit: z.string().trim().optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  creditLimit: z.coerce.number().min(0, 'El límite de crédito no puede ser negativo').default(0),
});

// Actualizar Cliente Existente
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['customers:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const body = await req.json();
    const parsed = UpdateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const customer = await prisma.customer.update({
      where: {
        id: resolvedParams.id,
        companyId: tenant.companyId,
      },
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        nit: data.nit || null,
        address: data.address || null,
        creditLimit: data.creditLimit,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'CUSTOMER_UPDATED',
      entity: 'Customer',
      entityId: customer.id,
      details: {
        updatedFields: Object.keys(data),
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 });
  }
}

// Eliminar (desactivar) Cliente
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['customers:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    // Verificar tenant + existencia antes de borrar
    const existing = await prisma.customer.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
      select: { id: true, name: true, balance: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Si tiene saldo pendiente, no permitir borrado
    if (Number(existing.balance) !== 0) {
      return NextResponse.json(
        {
          error:
            'No se puede eliminar el cliente porque tiene saldo pendiente. Liquídelo primero.',
        },
        { status: 409 },
      );
    }

    await prisma.customer.delete({
      where: {
        id: existing.id,
        companyId: tenant.companyId,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'CUSTOMER_DELETED',
      entity: 'Customer',
      entityId: existing.id,
      details: { name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2003' || error.code === 'P2014')
    ) {
      // Foreign key constraint — cliente tiene historial
      return NextResponse.json(
        {
          error:
            'No se puede eliminar el cliente porque tiene historial (ventas, pagos o notas).',
        },
        { status: 409 },
      );
    }
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 });
  }
}
