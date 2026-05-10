import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { VALID_PERMISSIONS } from '@/lib/permission-catalog';

const CreateRoleSchema = z.object({
  name: z.string().trim().min(2, 'Nombre del rol debe tener al menos 2 caracteres').max(80),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: z
    .array(z.enum(VALID_PERMISSIONS))
    .min(1, 'Asigná al menos un permiso al rol'),
});

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['users:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const roles = await prisma.customRole.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(roles);
  } catch (error) {
    return handleApiError(error, '/api/settings/roles GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requireAnyPermission(['users:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateRoleSchema.parse(body);

    // Solo el admin con 'settings:manage' puede crear un rol con 'admin:all'
    // (super-permisos dentro de la empresa). Un user con solo 'users:manage'
    // no puede escalar privilegios creando un rol con admin:all.
    if (parsed.permissions.includes('admin:all') && !result.tenant.permissions.includes('settings:manage') && result.tenant.role !== 'SUPER_ADMIN') {
      throw new ApiError(403, 'No podés asignar admin:all sin tener settings:manage.');
    }

    const role = await prisma.customRole.create({
      data: {
        companyId: tenant.companyId,
        name: parsed.name,
        description: parsed.description ?? null,
        permissions: parsed.permissions,
      },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/settings/roles POST');
  }
}
