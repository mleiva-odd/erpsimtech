import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('hr:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const data = await req.json();
    const employee = await prisma.employee.create({
      data: {
        companyId: tenant.companyId,
        branchId: data.branchId || null,
        userId: data.userId || null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        documentId: data.documentId,
        nit: data.nit,
        address: data.address,
        position: data.position,
        baseSalary: data.baseSalary,
        hireDate: new Date(data.hireDate),
        bankAccount: data.bankAccount,
        bankName: data.bankName,
      },
    });
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear empleado' }, { status: 500 });
  }
}
