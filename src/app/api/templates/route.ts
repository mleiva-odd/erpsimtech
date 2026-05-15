import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DocumentTemplateType, Prisma } from '@prisma/client';
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
 * Fase 22d-5 · Plantillas reutilizables de documentos (Quote/Sale/RFQ/PO/PR).
 *
 * GET  → lista plantillas activas filtradas por type.
 * POST → crea plantilla. La constraint UNIQUE (companyId, type, name)
 *        WHERE isActive = true vive en DB (índice parcial). Si choca, se
 *        devuelve 409 vía mapPrismaError.
 *
 * Permisos:
 *  - GET: cualquiera con sales:view OR purchases:view (o equivalentes).
 *  - POST: cualquiera que pueda crear ventas/cotizaciones o compras.
 */

const TEMPLATE_TYPES = Object.values(DocumentTemplateType) as DocumentTemplateType[];
const TEMPLATE_TYPE_SET = new Set<string>(TEMPLATE_TYPES);

const VIEW_PERMISSIONS = [
  'sales:view',
  'purchases:view',
  'purchases:create',
  'purchases:request',
  'settings:manage',
];

const WRITE_PERMISSIONS = [
  // Ventas: el catálogo actual no expone `sales:manage`, pero sí `sales:void`
  // (anulación) que típicamente sólo lo tienen supervisores. Se acepta también
  // a quien puede crear órdenes de compra o solicitudes.
  'sales:void',
  'purchases:create',
  'purchases:request',
  'settings:manage',
];

const CreateTemplateSchema = z.object({
  type: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  items: z.unknown(),
  metadata: z.unknown().optional(),
});

function parseTypeFilter(raw: string | null): DocumentTemplateType | null {
  if (!raw) return null;
  return TEMPLATE_TYPE_SET.has(raw) ? (raw as DocumentTemplateType) : null;
}

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(VIEW_PERMISSIONS);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const typeFilter = parseTypeFilter(req.nextUrl.searchParams.get('type'));

    const where: Prisma.DocumentTemplateWhereInput = {
      companyId: tenant.companyId,
      isActive: true,
    };
    if (typeFilter) where.type = typeFilter;

    const templates = await prisma.documentTemplate.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      take: 200,
    });

    return NextResponse.json({ templates });
  } catch (error) {
    return handleApiError(error, '/api/templates GET');
  }
}

export async function POST(req: NextRequest) {
  const result = await requireAnyPermission(WRITE_PERMISSIONS);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateTemplateSchema.parse(body);

    if (!TEMPLATE_TYPE_SET.has(parsed.type)) {
      throw new ApiError(400, 'Tipo de plantilla inválido.');
    }
    const type = parsed.type as DocumentTemplateType;

    let items: TemplateItem[];
    let metadata: TemplateMetadata | null;
    try {
      items = parseTemplateItems(parsed.items);
      metadata = parseTemplateMetadata(parsed.metadata ?? null);
    } catch (parseErr) {
      throw new ApiError(400, parseErr instanceof Error ? parseErr.message : 'Datos inválidos.');
    }

    // Validar que productos pertenezcan a la empresa (evita usar plantillas
    // como vector para inyectar IDs cross-tenant).
    const productIds = [...new Set(items.map((it) => it.productId))];
    const owned = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: tenant.companyId },
      select: { id: true },
    });
    if (owned.length !== productIds.length) {
      throw new ApiError(400, 'Algún producto no pertenece a esta empresa.');
    }

    const created = await prisma.documentTemplate.create({
      data: {
        companyId: tenant.companyId,
        type,
        name: parsed.name,
        description: parsed.description ?? null,
        items: items as unknown as Prisma.InputJsonValue,
        metadata: metadata === null ? Prisma.JsonNull : (metadata as unknown as Prisma.InputJsonValue),
        createdById: tenant.userId,
        isActive: true,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'DOCUMENT_TEMPLATE_CREATED',
      entity: 'DocumentTemplate',
      entityId: created.id,
      details: { type, name: created.name, itemCount: items.length },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/templates POST');
  }
}
