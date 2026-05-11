import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCompanyTenant, requirePermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const SettingsSchema = z.object({
  storeName: z.string().min(2, 'Name is required'),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  nit: z.string().optional().or(z.literal('')),
  receiptMsg: z.string().optional().or(z.literal('')),
  // FEL settings
  felEnabled: z.boolean().optional(),
  felProvider: z.enum(['NONE', 'INFILE', 'DIGIFACT']).optional(),
  felNitEmisor: z.string().optional().or(z.literal('')),
  felApiUser: z.string().optional().or(z.literal('')),
  felApiKey: z.string().optional().or(z.literal('')),
  // Payment methods
  acceptsCash: z.boolean().optional(),
  acceptsCard: z.boolean().optional(),
  acceptsTransfer: z.boolean().optional(),
  acceptsCredit: z.boolean().optional(),
  // Tax
  taxRate: z.number().min(0).max(1).optional(),
  taxIncluded: z.boolean().optional(),
  // Currency
  currency: z.string().optional(),
  currencySymbol: z.string().optional(),
});

function sanitizeSettings<T extends { felApiUser?: string | null; felApiKey?: string | null; felCertificateUrl?: string | null }>(settings: T) {
  return {
    ...settings,
    felConfigured: Boolean(settings.felApiUser || settings.felApiKey || settings.felCertificateUrl),
    felApiUser: '',
    felApiKey: '',
    felCertificateUrl: '',
  };
}

export async function GET(req: NextRequest) {
  const result = await requireCompanyTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    let settings = await prisma.companySettings.findUnique({
      where: { companyId: tenant.companyId },
    });

    if (!settings) {
      // Auto-create default settings for this company
      const company = await prisma.company.findUnique({
        where: { id: tenant.companyId },
      });

      settings = await prisma.companySettings.create({
        data: {
          companyId: tenant.companyId,
          storeName: company?.name ?? 'Mi Empresa POS',
          nit: company?.nit,
          phone: company?.phone,
          receiptMsg: '¡Gracias por su compra!',
        },
      });
    }

    return NextResponse.json(sanitizeSettings(settings));
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const result = await requirePermission('settings:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  if (!tenant.companyId) {
    return NextResponse.json({ error: 'Este recurso requiere una empresa activa en contexto' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = SettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const existingSettings = await prisma.companySettings.findUnique({
      where: { companyId: tenant.companyId },
    });

    const nextFelApiUser = parsed.data.felApiUser?.trim()
      ? parsed.data.felApiUser.trim()
      : existingSettings?.felApiUser ?? null;
    const nextFelApiKey = parsed.data.felApiKey?.trim()
      ? parsed.data.felApiKey.trim()
      : existingSettings?.felApiKey ?? null;

    const felMetadata = {
      felEnabled: parsed.data.felEnabled ?? existingSettings?.felEnabled ?? false,
      felProvider: parsed.data.felProvider ?? existingSettings?.felProvider ?? 'NONE',
      felNitEmisor: parsed.data.felNitEmisor?.trim()
        ? parsed.data.felNitEmisor.trim()
        : existingSettings?.felNitEmisor ?? null,
      felApiUser: nextFelApiUser,
      felApiKey: nextFelApiKey,
      felCertificateUrl: existingSettings?.felCertificateUrl ?? null,
    };

    const safeData = {
      ...parsed.data,
      felApiUser: undefined,
      felApiKey: undefined,
      felCertificateUrl: undefined,
    };

    const updated = await prisma.companySettings.upsert({
      where: { companyId: tenant.companyId },
      create: {
        companyId: tenant.companyId,
        ...safeData,
        ...felMetadata,
      },
      update: {
        ...safeData,
        ...felMetadata,
      },
    });

    await createAuditLog({
      companyId: tenant.companyId, userId: tenant.userId,
      action: 'SETTINGS_UPDATED', entity: 'CompanySettings', entityId: updated.id,
      details: { updatedFields: Object.keys(parsed.data) },
    });

    return NextResponse.json(sanitizeSettings(updated));
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Error actualizando settings' }, { status: 500 });
  }
}
