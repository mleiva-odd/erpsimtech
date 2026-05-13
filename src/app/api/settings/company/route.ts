import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCompanyTenant, requirePermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

/**
 * Fase 22a · Endpoint Company-level settings.
 *
 * Lee y actualiza campos que viven en el modelo Company (no en
 * CompanySettings): taxRegime, costMethod, agingBucketDays,
 * allowQuotes, allowOrders, quoteValidDays, commissionEnabled,
 * purchaseApprovalThreshold.
 *
 * Reglas:
 *  - taxRegime es LOCK-ONCE: si ya está seteado, no se puede cambiar.
 *  - agingBucketDays se valida: array ordenado ascendente, todos > 0.
 *  - costMethod se mantiene editable (la migración entre WAC y FIFO es
 *    delicada pero se permite — el cliente toma la decisión).
 */

const CompanySettingsSchema = z.object({
  taxRegime: z.enum(['GENERAL', 'PEQUENO_CONTRIBUYENTE']).optional(),
  costMethod: z.enum(['WAC', 'FIFO']).optional(),
  agingBucketDays: z
    .array(z.number().int().positive())
    .min(1, 'Debe definir al menos un umbral de aging')
    .max(8, 'Máximo 8 umbrales soportados')
    .optional(),
  allowQuotes: z.boolean().optional(),
  allowOrders: z.boolean().optional(),
  quoteValidDays: z.number().int().min(1).max(365).optional(),
  commissionEnabled: z.boolean().optional(),
  purchaseApprovalThreshold: z.number().min(0).optional(),
});

const SELECT_FIELDS = {
  id: true,
  name: true,
  nit: true,
  taxRegime: true,
  costMethod: true,
  agingBucketDays: true,
  allowQuotes: true,
  allowOrders: true,
  quoteValidDays: true,
  commissionEnabled: true,
  purchaseApprovalThreshold: true,
} as const;

export async function GET() {
  const result = await requireCompanyTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    // Cast: el cliente Prisma generado en sandbox puede no tener todos los
    // campos hasta `prisma generate`. Estos campos viven en el schema desde
    // las fases 17/20/21, así que en runtime existen.
    const company = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: SELECT_FIELDS as never,
    })) as
      | {
          id: string;
          name: string;
          nit: string | null;
          taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
          costMethod: 'WAC' | 'FIFO';
          agingBucketDays: number[];
          allowQuotes: boolean;
          allowOrders: boolean;
          quoteValidDays: number;
          commissionEnabled: boolean;
          purchaseApprovalThreshold: unknown;
        }
      | null;

    if (!company) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      id: company.id,
      name: company.name,
      nit: company.nit,
      taxRegime: company.taxRegime ?? null,
      costMethod: company.costMethod ?? 'WAC',
      agingBucketDays:
        Array.isArray(company.agingBucketDays) && company.agingBucketDays.length > 0
          ? company.agingBucketDays
          : [30, 60, 90],
      allowQuotes: company.allowQuotes ?? true,
      allowOrders: company.allowOrders ?? true,
      quoteValidDays: company.quoteValidDays ?? 30,
      commissionEnabled: company.commissionEnabled ?? false,
      purchaseApprovalThreshold: Number(company.purchaseApprovalThreshold ?? 0),
      taxRegimeLocked: Boolean(company.taxRegime),
    });
  } catch (error) {
    console.error('Settings/company GET error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await req.json();
    const parsed = CompanySettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Cast: ver comentario en GET.
    const current = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: SELECT_FIELDS as never,
    })) as
      | {
          taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
        }
      | null;

    if (!current) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    // Regla: taxRegime es LOCK-ONCE.
    if (
      data.taxRegime &&
      current.taxRegime &&
      current.taxRegime !== data.taxRegime
    ) {
      return NextResponse.json(
        {
          error:
            'El régimen tributario ya está configurado y no se puede cambiar desde la app.',
          code: 'TAX_REGIME_LOCKED',
        },
        { status: 409 },
      );
    }

    // Si ya hay taxRegime seteado, ignorar el body.taxRegime para evitar overwrite accidental.
    const updatePayload: Record<string, unknown> = {};
    if (data.taxRegime && !current.taxRegime) {
      updatePayload.taxRegime = data.taxRegime;
    }
    if (data.costMethod !== undefined) updatePayload.costMethod = data.costMethod;
    if (data.agingBucketDays !== undefined) {
      const sorted = [...data.agingBucketDays].sort((a, b) => a - b);
      // Verificar que sean estrictamente crecientes
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] <= sorted[i - 1]) {
          return NextResponse.json(
            { error: 'Los umbrales de aging deben ser estrictamente crecientes.' },
            { status: 400 },
          );
        }
      }
      updatePayload.agingBucketDays = sorted;
    }
    if (data.allowQuotes !== undefined) updatePayload.allowQuotes = data.allowQuotes;
    if (data.allowOrders !== undefined) updatePayload.allowOrders = data.allowOrders;
    if (data.quoteValidDays !== undefined)
      updatePayload.quoteValidDays = data.quoteValidDays;
    if (data.commissionEnabled !== undefined)
      updatePayload.commissionEnabled = data.commissionEnabled;
    if (data.purchaseApprovalThreshold !== undefined)
      updatePayload.purchaseApprovalThreshold = data.purchaseApprovalThreshold;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para aplicar' }, { status: 400 });
    }

    await prisma.company.update({
      where: { id: tenant.companyId },
      data: updatePayload as Parameters<typeof prisma.company.update>[0]['data'],
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SETTINGS_UPDATED',
      entity: 'Company',
      entityId: tenant.companyId,
      details: { updatedFields: Object.keys(updatePayload) },
    });

    // Retornar estado fresco
    const refreshed = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: SELECT_FIELDS as never,
    })) as Record<string, unknown> | null;

    return NextResponse.json({
      ...refreshed,
      purchaseApprovalThreshold: Number(
        (refreshed?.purchaseApprovalThreshold as unknown as number | string | null) ?? 0,
      ),
      taxRegimeLocked: Boolean(
        (refreshed as { taxRegime?: string | null } | null)?.taxRegime,
      ),
    });
  } catch (error) {
    console.error('Settings/company PATCH error:', error);
    return NextResponse.json({ error: 'Error actualizando configuración' }, { status: 500 });
  }
}
