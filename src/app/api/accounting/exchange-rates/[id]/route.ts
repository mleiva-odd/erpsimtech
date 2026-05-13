/**
 * Fase 21 · Multi-moneda · Endpoint individual de ExchangeRate.
 *
 *   PATCH  /api/accounting/exchange-rates/[id]
 *          Edita solo `notes`. El `rate`, `currency` y `date` son inmutables
 *          (cambiar el rate post-uso corrompe el snapshot de los documentos
 *          que ya lo consumieron — si querés "corregir" un rate, borrá y
 *          recreá).
 *
 *   DELETE /api/accounting/exchange-rates/[id]
 *          Borra el rate. Solo permitido si NINGÚN documento monetario lo
 *          usó (rate-y-fecha exactos). Como simplificación, validamos que
 *          no exista Sale/Payment/AccountPayment/SupplierPayment/Supplier
 *          Invoice/PurchaseOrder/BankTransaction con currency=esta y fecha
 *          dentro del día. Si hay uso, 409.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';

const PatchSchema = z.object({
  notes: z.string().trim().max(500).nullable().optional(),
});

function dayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['treasury:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const existing = await (prisma as unknown as {
      exchangeRate: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
      };
    }).exchangeRate.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Tipo de cambio no encontrado.' }, { status: 404 });
    }

    const updated = await (prisma as unknown as {
      exchangeRate: {
        update: (args: unknown) => Promise<unknown>;
      };
    }).exchangeRate.update({
      where: { id },
      data: { notes: parsed.data.notes ?? null },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('exchange-rates PATCH error:', error);
    return NextResponse.json({ error: 'Error al actualizar el tipo de cambio.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission(['treasury:manage', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const existing = await (prisma as unknown as {
      exchangeRate: {
        findFirst: (args: unknown) => Promise<
          { id: string; currency: string; date: Date } | null
        >;
      };
    }).exchangeRate.findFirst({
      where: { id, companyId: tenant.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Tipo de cambio no encontrado.' }, { status: 404 });
    }

    // Validar que ningún documento monetario lo haya consumido.
    // Heurística: existe alguna Sale/PO/Payment/AccountPayment/SupplierPayment/
    // SupplierInvoice con currency=esta y createdAt dentro del día del rate.
    const { start, end } = dayRange(existing.date);
    const currency = existing.currency;

    const [
      saleCount,
      poCount,
      paymentCount,
      acctPayCount,
      supPayCount,
      supInvCount,
      bankTxCount,
    ] = await Promise.all([
      prisma.sale.count({
        where: { companyId: tenant.companyId, currency, createdAt: { gte: start, lt: end } } as never,
      }),
      prisma.purchaseOrder.count({
        where: { companyId: tenant.companyId, currency, createdAt: { gte: start, lt: end } } as never,
      }),
      prisma.payment.count({
        where: {
          sale: { companyId: tenant.companyId },
          currency,
          createdAt: { gte: start, lt: end },
        } as never,
      }),
      prisma.accountPayment.count({
        where: {
          customer: { companyId: tenant.companyId },
          currency,
          createdAt: { gte: start, lt: end },
        } as never,
      }),
      prisma.supplierPayment.count({
        where: {
          payable: { companyId: tenant.companyId },
          currency,
          createdAt: { gte: start, lt: end },
        } as never,
      }),
      prisma.supplierInvoice.count({
        where: { companyId: tenant.companyId, currency, createdAt: { gte: start, lt: end } } as never,
      }),
      prisma.bankTransaction.count({
        where: {
          bankAccount: { companyId: tenant.companyId },
          currency,
          createdAt: { gte: start, lt: end },
        } as never,
      }),
    ]);

    const used =
      saleCount + poCount + paymentCount + acctPayCount + supPayCount + supInvCount + bankTxCount;

    if (used > 0) {
      return NextResponse.json(
        {
          error:
            'No se puede borrar: este tipo de cambio ya fue usado en documentos (' +
            `${used} referencias). Si es un error, cargá un nuevo rate corrigiendo el valor.`,
        },
        { status: 409 },
      );
    }

    await (prisma as unknown as {
      exchangeRate: {
        delete: (args: unknown) => Promise<unknown>;
      };
    }).exchangeRate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Tipo de cambio no encontrado.' }, { status: 404 });
    }
    console.error('exchange-rates DELETE error:', error);
    return NextResponse.json({ error: 'Error al borrar el tipo de cambio.' }, { status: 500 });
  }
}
