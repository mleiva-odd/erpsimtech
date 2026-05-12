import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { calculateLineTax } from '@/lib/fel';
import { z } from 'zod';

const DebitNoteItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  isTaxExempt: z.boolean().optional().default(false),
});

const CreateDebitNoteSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Motivo requerido'),
  items: z.array(DebitNoteItemSchema).min(1),
});

/**
 * POST /api/debit-notes
 *
 * Alta de Nota de Débito (recargos por mora, intereses). Las líneas pueden
 * ser conceptos puros sin productId.
 */
export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission(['sales:view', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = CreateDebitNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const company = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
    })) as { taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null } | null;
    if (!company?.taxRegime) {
      return NextResponse.json(
        { error: 'Régimen tributario no configurado.', code: 'TAX_REGIME_NOT_CONFIGURED' },
        { status: 400 },
      );
    }

    const sale = await prisma.sale.findFirst({
      where: { id: parsed.data.saleId, companyId: tenant.companyId },
      select: { id: true, branchId: true },
    });
    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    const lineCalcs = parsed.data.items.map((it) =>
      calculateLineTax({
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        discount: 0,
        isTaxExempt: it.isTaxExempt ?? false,
        companyTaxRegime: company.taxRegime!,
      }),
    );

    const subtotal = lineCalcs.reduce((s, l) => s + l.subtotal, 0);
    const tax = lineCalcs.reduce((s, l) => s + l.tax, 0);
    const total = subtotal + tax;

    const debitNote = await prisma.debitNote.create({
      data: {
        companyId: tenant.companyId,
        saleId: sale.id,
        branchId: sale.branchId,
        userId: tenant.userId,
        reason: parsed.data.reason,
        subtotal,
        tax,
        total,
        taxRegime: company.taxRegime!,
        items: {
          create: parsed.data.items.map((it, idx) => ({
            productId: it.productId ?? null,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            taxRate: lineCalcs[idx].taxRate,
            subtotal: lineCalcs[idx].subtotal,
            tax: lineCalcs[idx].tax,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json(debitNote, { status: 201 });
  } catch (error) {
    console.error('Debit note create error:', error);
    const message = error instanceof Error ? error.message : 'Error al crear NDEB';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
