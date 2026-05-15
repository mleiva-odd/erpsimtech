import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import {
  parseTemplateItems,
  parseTemplateMetadata,
  type TemplateItem,
  type TemplateMetadata,
} from '@/lib/templates/types';

/**
 * Fase 22d-5 · CRUD por id de DocumentTemplate.
 *
 *  GET    → detalle.
 *  PUT    → actualiza name/description/items/metadata. NO permite cambiar `type`.
 *  DELETE → soft delete (isActive=false). Hard delete sólo si createdAt < 1h
 *           y el usuario tiene `settings:manage`.
 */

const VIEW_PERMISSIONS = [
  'sales:view',
  'purchases:view',
  'purchases:create',
  'purchases:request',
  'settings:manage',
];

const WRITE_PERMISSIONS = [
  'sales:void',
  'purchases:create',
  'purchases:request',
  'settings:manage',
];

const UpdateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  items: z.unknown().optional(),
  metadata: z.unknown().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission(VIEW_PERMISSIONS);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { id } = await params;
    const tpl = await prisma.documentTemplate.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!tpl) throw new ApiError(404, 'Plantilla no encontrada.');
    return NextResponse.json(tpl);
  } catch (error) {
    return handleApiError(error, '/api/templates/[id] GET');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission(WRITE_PERMISSIONS);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateTemplateSchema.parse(body);

    const existing = await prisma.documentTemplate.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, type: true, isActive: true },
    });
    if (!existing) throw new ApiError(404, 'Plantilla no encontrada.');

    const data: Prisma.DocumentTemplateUpdateInput = {};

    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.description !== undefined) data.description = parsed.description ?? null;

    if (parsed.items !== undefined) {
      let items: TemplateItem[];
      try {
        items = parseTemplateItems(parsed.items);
      } catch (parseErr) {
        throw new ApiError(400, parseErr instanceof Error ? parseErr.message : 'Datos inválidos.');
      }
      // Validar productos pertenezcan a la empresa.
      const productIds = [...new Set(items.map((it) => it.productId))];
      const owned = await prisma.product.findMany({
        where: { id: { in: productIds }, companyId: tenant.companyId },
        select: { id: true },
      });
      if (owned.length !== productIds.length) {
        throw new ApiError(400, 'Algún producto no pertenece a esta empresa.');
      }
      data.items = items as unknown as Prisma.InputJsonValue;
    }

    if (parsed.metadata !== undefined) {
      let metadata: TemplateMetadata | null;
      try {
        metadata = parseTemplateMetadata(parsed.metadata);
      } catch (parseErr) {
        throw new ApiError(400, parseErr instanceof Error ? parseErr.message : 'Datos inválidos.');
      }
      data.metadata =
        metadata === null ? Prisma.JsonNull : (metadata as unknown as Prisma.InputJsonValue);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar.' }, { status: 400 });
    }

    const updated = await prisma.documentTemplate.update({
      where: { id },
      data,
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'DOCUMENT_TEMPLATE_UPDATED',
      entity: 'DocumentTemplate',
      entityId: id,
      details: { fields: Object.keys(data) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/templates/[id] PUT');
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAnyPermission(WRITE_PERMISSIONS);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { id } = await params;
    const existing = await prisma.documentTemplate.findFirst({
      where: { id, companyId: tenant.companyId },
      select: { id: true, isActive: true, createdAt: true, name: true, type: true },
    });
    if (!existing) throw new ApiError(404, 'Plantilla no encontrada.');

    // Hard delete sólo si createdAt < 1h Y el caller tiene settings:manage.
    const ageMs = Date.now() - existing.createdAt.getTime();
    const isAdmin = tenant.permissions.includes('settings:manage') || tenant.role === 'SUPER_ADMIN';
    const hardDelete = isAdmin && ageMs < 60 * 60 * 1000;

    if (hardDelete) {
      await prisma.documentTemplate.delete({ where: { id } });
    } else {
      if (!existing.isActive) {
        // Ya estaba inactiva: idempotente.
        return NextResponse.json({ ok: true, alreadyInactive: true });
      }
      await prisma.documentTemplate.update({
        where: { id },
        data: { isActive: false },
      });
    }

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'DOCUMENT_TEMPLATE_DELETED',
      entity: 'DocumentTemplate',
      entityId: id,
      details: { hardDelete, name: existing.name, type: existing.type },
    });

    return NextResponse.json({ ok: true, hardDelete });
  } catch (error) {
    return handleApiError(error, '/api/templates/[id] DELETE');
  }
}
