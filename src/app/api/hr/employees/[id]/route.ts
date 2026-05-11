import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

const UpdateEmployeeSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  documentId: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  nit: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  address: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  position: z.string().trim().max(120).optional().nullable().or(z.literal('')),
  baseSalary: z.coerce.number().nonnegative().optional(),
  hireDate: z.string().optional(),
  terminationDate: z.string().optional().nullable(),
  active: z.boolean().optional(),
  bankAccount: z.string().trim().max(80).optional().nullable().or(z.literal('')),
  bankName: z.string().trim().max(120).optional().nullable().or(z.literal('')),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!employee) throw new ApiError(404, 'Empleado no encontrado');
    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, '/api/hr/employees/[id] GET');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const data = UpdateEmployeeSchema.parse(body);

    // Verify tenant ownership
    const existing = await prisma.employee.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, userId: true },
    });
    if (!existing) throw new ApiError(404, 'Empleado no encontrado');

    // If branchId provided, validate it belongs to tenant
    if (data.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: data.branchId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!branch) throw new ApiError(400, 'La sucursal no pertenece a esta empresa');
    }

    // If userId provided, validate it belongs to tenant and is not already linked
    if (data.userId && data.userId !== existing.userId) {
      const user = await prisma.user.findFirst({
        where: { id: data.userId, companyId: tenant.companyId },
        select: { id: true, employee: { select: { id: true } } },
      });
      if (!user) throw new ApiError(400, 'El usuario no pertenece a esta empresa');
      if (user.employee && user.employee.id !== id) {
        throw new ApiError(409, 'El usuario ya está vinculado a otro empleado');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.branchId !== undefined) updateData.branchId = data.branchId || null;
    if (data.userId !== undefined) updateData.userId = data.userId || null;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.documentId !== undefined) updateData.documentId = data.documentId || null;
    if (data.nit !== undefined) updateData.nit = data.nit || null;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.position !== undefined) updateData.position = data.position || null;
    if (data.baseSalary !== undefined) updateData.baseSalary = data.baseSalary;
    if (data.hireDate !== undefined) {
      const d = new Date(data.hireDate);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, 'hireDate inválido');
      updateData.hireDate = d;
    }
    if (data.terminationDate !== undefined) {
      if (data.terminationDate === null || data.terminationDate === '') {
        updateData.terminationDate = null;
      } else {
        const d = new Date(data.terminationDate);
        if (Number.isNaN(d.getTime())) throw new ApiError(400, 'terminationDate inválido');
        updateData.terminationDate = d;
      }
    }
    if (data.active !== undefined) updateData.active = data.active;
    if (data.bankAccount !== undefined) updateData.bankAccount = data.bankAccount || null;
    if (data.bankName !== undefined) updateData.bankName = data.bankName || null;

    const updated = await prisma.employee.update({
      where: { id, companyId: tenant.companyId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/hr/employees/[id] PUT');
  }
}

/**
 * DELETE — soft delete (active=false + terminationDate=now).
 * Hard delete no es seguro porque hay payrollItems, attendance,
 * leaveRequests con FK al empleado. Mantenemos histórico.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const existing = await prisma.employee.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, active: true },
    });
    if (!existing) throw new ApiError(404, 'Empleado no encontrado');
    if (!existing.active) {
      throw new ApiError(400, 'El empleado ya está inactivo');
    }

    const updated = await prisma.employee.update({
      where: { id, companyId: tenant.companyId },
      data: { active: false, terminationDate: new Date() },
    });

    return NextResponse.json({ success: true, employee: updated });
  } catch (error) {
    return handleApiError(error, '/api/hr/employees/[id] DELETE');
  }
}
