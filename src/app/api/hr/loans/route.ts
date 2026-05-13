import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import { ApiError, handleApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';

const CreateLoanSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.coerce.number().positive('Monto debe ser > 0'),
  monthlyDeduction: z.coerce.number().positive('Cuota debe ser > 0'),
  reason: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const employeeId = searchParams.get('employeeId');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20),
  );

  try {
    const where: Record<string, unknown> = { companyId: tenant.companyId };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const [items, total] = await Promise.all([
      prisma.employeeLoan.findMany({
        where,
        orderBy: { approvedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.employeeLoan.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    return handleApiError(error, '/api/hr/loans GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const data = CreateLoanSchema.parse(body);

    if (data.monthlyDeduction > data.amount) {
      throw new ApiError(400, 'La cuota mensual no puede exceder el monto del préstamo');
    }

    // Validar que el empleado pertenece al tenant.
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, companyId: tenant.companyId },
      select: { id: true },
    });
    if (!employee) throw new ApiError(400, 'Empleado no encontrado en esta empresa');

    const loan = await prisma.employeeLoan.create({
      data: {
        companyId: tenant.companyId,
        employeeId: data.employeeId,
        amount: data.amount,
        balance: data.amount,
        monthlyDeduction: data.monthlyDeduction,
        status: 'ACTIVE',
        reason: data.reason || null,
        notes: data.notes || null,
        approvedById: tenant.userId,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'EMP_LOAN_CREATED',
      entity: 'EmployeeLoan',
      entityId: (loan as { id: string }).id,
      details: {
        employeeId: data.employeeId,
        amount: data.amount,
        monthlyDeduction: data.monthlyDeduction,
      },
    });

    return NextResponse.json(loan, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/hr/loans POST');
  }
}
