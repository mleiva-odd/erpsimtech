import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

const CreateEmployeeSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(120),
  email: z.string().trim().email('Email inválido').optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  documentId: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  nit: z.string().trim().max(40).optional().nullable().or(z.literal('')),
  address: z.string().trim().max(500).optional().nullable().or(z.literal('')),
  position: z.string().trim().max(120).optional().nullable().or(z.literal('')),
  baseSalary: z.coerce.number().nonnegative('El salario debe ser >= 0'),
  hireDate: z.string().min(1, 'hireDate requerido'),
  bankAccount: z.string().trim().max(80).optional().nullable().or(z.literal('')),
  bankName: z.string().trim().max(120).optional().nullable().or(z.literal('')),
});

export async function GET(req: NextRequest) {
  void req; // unused, satisfies linter
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: tenant.companyId },
      include: { branch: true, user: { select: { name: true, email: true } } },
      orderBy: { firstName: 'asc' },
    });
    return NextResponse.json(employees);
  } catch (error) {
    return handleApiError(error, '/api/hr/employees GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const data = CreateEmployeeSchema.parse(body);

    // Defense in depth: branch must belong to current tenant.
    if (data.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: data.branchId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!branch) throw new ApiError(400, 'La sucursal no pertenece a esta empresa');
    }

    // userId, si viene, debe existir en la misma company y no estar
    // ya vinculado a otro empleado (Employee.userId es @unique).
    if (data.userId) {
      const user = await prisma.user.findFirst({
        where: { id: data.userId, companyId: tenant.companyId },
        select: { id: true, employee: { select: { id: true } } },
      });
      if (!user) throw new ApiError(400, 'El usuario no pertenece a esta empresa');
      if (user.employee) throw new ApiError(409, 'El usuario ya está vinculado a otro empleado');
    }

    const hireDate = new Date(data.hireDate);
    if (Number.isNaN(hireDate.getTime())) {
      throw new ApiError(400, 'hireDate inválido');
    }

    const employee = await prisma.employee.create({
      data: {
        companyId: tenant.companyId,
        branchId: data.branchId || null,
        userId: data.userId || null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        documentId: data.documentId || null,
        nit: data.nit || null,
        address: data.address || null,
        position: data.position || null,
        baseSalary: data.baseSalary,
        hireDate,
        bankAccount: data.bankAccount || null,
        bankName: data.bankName || null,
      },
    });
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/hr/employees POST');
  }
}
