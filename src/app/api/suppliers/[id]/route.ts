import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';

const UpdateSupplierSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio').max(200).optional(),
  contactName: z.string().trim().max(200).optional().nullable().or(z.literal('')),
  email: z.string().trim().email('Email inválido').optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  nit: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  address: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  active: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['suppliers:manage', 'settings:manage']);
  if ('error' in result) return result.error;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const data = UpdateSupplierSchema.parse(body);

    const existing = await prisma.supplier.findFirst({
      where: { id, companyId: result.tenant.companyId },
      select: { id: true },
    });
    if (!existing) throw new ApiError(404, 'Proveedor no encontrado');

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.contactName !== undefined) updateData.contactName = data.contactName || null;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.nit !== undefined) updateData.nit = data.nit || null;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.active !== undefined) updateData.active = data.active;

    const supplier = await prisma.supplier.update({
      where: { id, companyId: result.tenant.companyId },
      data: updateData,
    });
    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error, '/api/suppliers/[id] PUT');
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['suppliers:manage', 'settings:manage']);
  if ('error' in result) return result.error;

  const { id } = await params;

  try {
    const existing = await prisma.supplier.findFirst({
      where: { id, companyId: result.tenant.companyId },
      select: { id: true, active: true },
    });
    if (!existing) throw new ApiError(404, 'Proveedor no encontrado');
    if (!existing.active) {
      throw new ApiError(400, 'El proveedor ya está inactivo');
    }

    // Soft delete to preserve purchase records
    const supplier = await prisma.supplier.update({
      where: { id, companyId: result.tenant.companyId },
      data: { active: false },
    });
    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error, '/api/suppliers/[id] DELETE');
  }
}
