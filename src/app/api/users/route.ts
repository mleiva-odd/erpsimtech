import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password min 6 characters'),
  customRoleId: z.string().uuid('Rol requerido'),
  branchId: z.string().uuid().optional().nullable(),
  branchAccess: z.array(z.string().uuid()).optional(),
});

export async function GET(req: NextRequest) {
  const result = await requirePermission('users:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const users = await prisma.user.findMany({
      where: { companyId: tenant.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        customRole: { select: { name: true } },
        active: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
        branchAccess: { select: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requirePermission('users:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = CreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    // Comprobación de límites (Suscripción)
    const subscription = await prisma.subscription.findUnique({
      where: { companyId: tenant.companyId },
    });
    const currentUsers = await prisma.user.count({
      where: { companyId: tenant.companyId, role: { not: 'SUPER_ADMIN' } },
    });

    const maxUsersAllowed = subscription ? (subscription.maxBranches * subscription.maxUsersPerBranch) : 3;

    if (subscription && currentUsers >= maxUsersAllowed) {
      return NextResponse.json(
        { error: `Tu plan Trial te restringe a un máximo de ${maxUsersAllowed} empleados. Actualiza tu licencia para continuar.` },
        { status: 403 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (exists) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 });
    }

    // If branchId provided, verify it belongs to this company
    if (parsed.data.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: parsed.data.branchId, companyId: tenant.companyId },
      });
      if (!branch) {
        return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 400 });
      }
    }

    if (parsed.data.branchAccess?.length) {
      const validBranches = await prisma.branch.count({
        where: {
          id: { in: parsed.data.branchAccess },
          companyId: tenant.companyId,
        },
      });

      if (validBranches !== parsed.data.branchAccess.length) {
        return NextResponse.json({ error: 'Hay sucursales fuera de tu empresa en el acceso asignado' }, { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

    const newUser = await prisma.user.create({
      data: {
        companyId: tenant.companyId,
        branchId: parsed.data.branchId || null,
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashedPassword,
        role: 'USER',
        customRoleId: parsed.data.customRoleId,
        branchAccess: parsed.data.branchAccess?.length ? {
          create: parsed.data.branchAccess.map(id => ({ branchId: id }))
        } : undefined
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branch: { select: { id: true, name: true } },
        branchAccess: { select: { branch: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}
