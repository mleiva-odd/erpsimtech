import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { createJournalEntry } from '@/lib/accounting';
import {
  calculateRetention,
  buildSupplierInvoiceJournalLines,
  STATES_ACCEPTING_INVOICE,
} from '@/lib/purchases';

/**
 * POST /api/purchases/[id]/invoice
 *
 * Registra la factura del proveedor para una PO ya recibida (al menos parcial).
 * Crea SupplierInvoice + SupplierPayable + JournalEntry contable + actualiza
 * PO a INVOICED y `quantityInvoiced` por item.
 *
 * Validaciones:
 *  - PO en estado RECEIVED o PARTIALLY_RECEIVED.
 *  - PO no debe tener ya un SupplierInvoice (unique constraint).
 *  - `invoiceNumber` único por (companyId, supplierId).
 *  - subtotal > 0.
 *
 * Las retenciones se calculan a partir del proveedor (régimen + flags). Se
 * persisten en SupplierInvoice como snapshot.
 */
const CreateInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(120),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  subtotal: z.coerce.number().nonnegative(),
  tax: z.coerce.number().min(0).optional(),
  /** Override manual de retenciones (solo si el caller sabe lo que hace). */
  withheldIVA: z.coerce.number().min(0).optional(),
  withheldISR: z.coerce.number().min(0).optional(),
  attachmentUrl: z.string().url().optional().nullable(),
  /** Si la PO es de servicios (no inventario), pasar false. */
  isInventoryPurchase: z.boolean().optional(),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:invoice',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateInvoiceSchema.parse(body);

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        items: true,
        supplier: {
          select: {
            id: true,
            creditDaysDefault: true,
            taxRegime: true,
            withholdsIVA: true,
            withholdsISR: true,
            isrRate: true,
          },
        },
        supplierInvoice: { select: { id: true } },
      },
    });
    if (!po) throw new ApiError(404, 'PO no encontrada.');
    if (po.supplierInvoice) {
      throw new ApiError(409, 'Esta PO ya tiene factura registrada.');
    }
    if (!STATES_ACCEPTING_INVOICE.includes(po.status)) {
      throw new ApiError(
        400,
        `No se puede facturar una PO en estado ${po.status}. ` +
          'La PO debe estar RECEIVED o PARTIALLY_RECEIVED.',
      );
    }

    const subtotal = round2(Number(parsed.subtotal));
    const tax = round2(Number(parsed.tax ?? 0));

    // Si el caller no manda overrides, calcular retención por proveedor.
    let retention;
    if (parsed.withheldIVA != null || parsed.withheldISR != null) {
      const wIVA = round2(Number(parsed.withheldIVA ?? 0));
      const wISR = round2(Number(parsed.withheldISR ?? 0));
      retention = {
        withheldIVA: wIVA,
        withheldISR: wISR,
        total: round2(subtotal + tax - wIVA - wISR),
      };
    } else {
      retention = calculateRetention({
        subtotal,
        tax,
        supplierTaxRegime: po.supplier.taxRegime,
        withholdsIVA: po.supplier.withholdsIVA,
        withholdsISR: po.supplier.withholdsISR,
        isrRate: Number(po.supplier.isrRate),
      });
    }
    const total = round2(retention.total);

    const creditDays = Number(po.supplier.creditDaysDefault ?? 30);
    const dueDate =
      parsed.dueDate ??
      (() => {
        const d = new Date(parsed.invoiceDate);
        d.setDate(d.getDate() + creditDays);
        return d;
      })();

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.create({
        data: {
          companyId: tenant.companyId,
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          registeredById: tenant.userId,
          invoiceNumber: parsed.invoiceNumber,
          invoiceDate: parsed.invoiceDate,
          dueDate,
          subtotal: new PrismaNS.Decimal(subtotal),
          tax: new PrismaNS.Decimal(tax),
          withheldIVA: new PrismaNS.Decimal(retention.withheldIVA),
          withheldISR: new PrismaNS.Decimal(retention.withheldISR),
          total: new PrismaNS.Decimal(total),
          attachmentUrl: parsed.attachmentUrl ?? null,
        },
      });

      // Crear SupplierPayable
      await tx.supplierPayable.create({
        data: {
          companyId: tenant.companyId,
          supplierId: po.supplierId,
          purchaseId: po.id,
          userId: tenant.userId,
          description: `Factura ${parsed.invoiceNumber} (PO ${po.id.slice(0, 8)})`,
          totalAmount: new PrismaNS.Decimal(total),
          paidAmount: new PrismaNS.Decimal(0),
          status: 'PENDING',
          dueDate,
        },
      });

      // Asiento contable: DR Inventario|Gasto + IVA Crédito / CR Proveedores
      // + IVA Débito (retenido) + ISR Retenido por Pagar.
      const lines = buildSupplierInvoiceJournalLines({
        subtotal,
        tax,
        withheldIVA: retention.withheldIVA,
        withheldISR: retention.withheldISR,
        isInventoryPurchase: parsed.isInventoryPurchase ?? true,
        description: `Factura ${parsed.invoiceNumber}`,
      });
      if (lines.length >= 2) {
        await createJournalEntry(tx, {
          companyId: tenant.companyId,
          branchId: po.branchId,
          date: parsed.invoiceDate,
          description: `Factura proveedor ${parsed.invoiceNumber} — PO ${po.id.slice(0, 8)}`,
          referenceType: 'SUPPLIER_INVOICE',
          referenceId: invoice.id,
          userId: tenant.userId,
          lines,
        });
      }

      // Marcar items como facturados (quantityInvoiced = quantityReceived)
      // y avanzar PO a INVOICED. Si quedan ítems pendientes (PARTIALLY_RECEIVED
      // con factura), aceptamos también la transición a INVOICED — la factura
      // cubre lo recibido a la fecha; los pendientes seguirán con
      // quantityInvoiced < quantity para auditoría.
      for (const poItem of po.items) {
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { quantityInvoiced: poItem.quantityReceived } as never,
        });
      }

      await tx.purchaseOrder.update({
        where: { id: po.id, companyId: tenant.companyId },
        data: {
          status: 'INVOICED',
          invoiceNumber: parsed.invoiceNumber,
          tax: new PrismaNS.Decimal(tax),
          subtotal: new PrismaNS.Decimal(subtotal),
          withheldIVA: new PrismaNS.Decimal(retention.withheldIVA),
          withheldISR: new PrismaNS.Decimal(retention.withheldISR),
          total: new PrismaNS.Decimal(total),
        } as never,
      });

      return invoice;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_INVOICE_REGISTERED',
      entity: 'SupplierInvoice',
      entityId: created.id,
      details: {
        purchaseOrderId: po.id,
        invoiceNumber: parsed.invoiceNumber,
        total,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/[id]/invoice');
  }
}
