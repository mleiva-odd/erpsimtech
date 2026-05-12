import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { calculateLineTax } from '@/lib/fel';
import { z } from 'zod';

const CreditNoteItemSchema = z.object({
  saleItemId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const CreateCreditNoteSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Motivo requerido'),
  items: z.array(CreditNoteItemSchema).min(1),
});

/**
 * POST /api/credit-notes
 *
 * Alta de Nota de Crédito manual (ej. devolución parcial). Lleva sus propias
 * líneas (subset de la venta o conceptos custom). No certifica automáticamente
 * — usar POST /api/fel/credit-notes/:id/certify después.
 */
export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission(['sales:void', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = CreateCreditNoteSchema.safeParse(body);
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
      include: { items: true },
    });
    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    // Productos referenciados para isTaxExempt:
    const productIds = parsed.data.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: tenant.companyId },
      select: { id: true, isTaxExempt: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const lineCalcs = parsed.data.items.map((it) => {
      const product = productMap.get(it.productId);
      if (!product) {
        throw new Error(`Producto ${it.productId} no encontrado`);
      }
      return calculateLineTax({
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        discount: 0,
        isTaxExempt: product.isTaxExempt,
        companyTaxRegime: company.taxRegime!,
      });
    });

    const subtotal = lineCalcs.reduce((s, l) => s + l.subtotal, 0);
    const tax = lineCalcs.reduce((s, l) => s + l.tax, 0);
    const total = subtotal + tax;

    const creditNote = await prisma.creditNote.create({
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
            saleItemId: it.saleItemId ?? null,
            productId: it.productId,
            variantId: it.variantId ?? null,
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

    return NextResponse.json(creditNote, { status: 201 });
  } catch (error) {
    console.error('Credit note create error:', error);
    const message = error instanceof Error ? error.message : 'Error al crear NCRE';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
