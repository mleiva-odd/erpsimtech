import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

const UpdateCategorySchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio'),
  description: z.string().trim().optional().or(z.literal('')),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const data = UpdateCategorySchema.parse(body);

    // Tenant scoping defensivo: el update solo afecta si la categoría
    // pertenece a la empresa actual.
    const updated = await prisma.category.update({
      where: { id, companyId: tenant.companyId },
      data: {
        name: data.name,
        description: data.description || null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/categories/[id] PUT');
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    // Verificar existencia + tenant + uso antes de borrar.
    const existing = await prisma.category.findFirst({
      where: { id, companyId: tenant.companyId },
      select: {
        id: true,
        _count: { select: { products: true } },
      },
    });

    if (!existing) {
      throw new ApiError(404, 'Categoría no encontrada');
    }

    if (existing._count.products > 0) {
      throw new ApiError(
        409,
        `No se puede eliminar: la categoría tiene ${existing._count.products} producto(s) asociado(s). Reasigná los productos primero o desactivalos.`,
      );
    }

    await prisma.category.delete({
      where: { id, companyId: tenant.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '/api/categories/[id] DELETE');
  }
}
