import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOperationalPermission } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';
import { createAuditLog } from '@/lib/audit';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';

/**
 * POST /api/purchases/[id]/credit-note
 *
 * Registra una Nota de Crédito del proveedor asociada a la PO. Reduce el
 * SupplierPayable (subtotal + tax), genera asiento contrario al de la
 * factura por el monto de la NC.
 *
 * Esquema simplificado: cabecera sin items (a diferencia de NCRE de venta).
 * El cliente decide subtotal y tax. Si se vincula a un SupplierInvoice
 * (campo opcional invoiceId), se ajusta el payable proporcionalmente.
 */
const CreateCNSchema = z.object({
  noteNumber: z.string().trim().min(1).max(120),
  noteDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(500),
  subtotal: z.coerce.number().nonnegative(),
  tax: z.coerce.number().min(0).optional(),
  attachmentUrl: z.string().url().optional().nullable(),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireOperationalPermission([
    'purchases:credit-note',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateCNSchema.parse(body);

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        supplierInvoice: { select: { id: true, total: true } },
        payable: { include: { payments: { where: { status: 'COMPLETED' } } } },
      },
    });
    if (!po) throw new ApiError(404, 'PO no encontrada.');
    if (!po.supplierInvoice) {
      throw new ApiError(
        400,
        'No se puede crear NC: la PO no tiene factura registrada.',
      );
    }

    const subtotal = round2(Number(parsed.subtotal));
    const tax = round2(Number(parsed.tax ?? 0));
    const total = round2(subtotal + tax);

    if (total <= 0) {
      throw new ApiError(400, 'El total de la NC debe ser mayor a 0.');
    }
    if (total > Number(po.supplierInvoice.total)) {
      throw new ApiError(
        400,
        'El total de la NC excede el total de la factura.',
      );
    }

    const cn = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierCreditNote.create({
        data: {
          companyId: tenant.companyId,
          supplierId: po.supplierId,
          supplierInvoiceId: po.supplierInvoice!.id,
          registeredById: tenant.userId,
          noteNumber: parsed.noteNumber,
          noteDate: parsed.noteDate,
          reason: parsed.reason,
          subtotal: new PrismaNS.Decimal(subtotal),
          tax: new PrismaNS.Decimal(tax),
          total: new PrismaNS.Decimal(total),
          attachmentUrl: parsed.attachmentUrl ?? null,
        },
      });

      // Ajustar payable: reducir totalAmount por `total`. Si el payable ya
      // está PAID, queda saldo a favor (paidAmount > totalAmount); el caller
      // debe manejar ese caso externamente. Si el payable está PARTIAL, se
      // actualiza el saldo pendiente.
      if (po.payable) {
        const newTotal = round2(Number(po.payable.totalAmount) - total);
        const paid = Number(po.payable.paidAmount);
        let newStatus: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
        if (paid >= newTotal) newStatus = 'PAID';
        else if (paid > 0) newStatus = 'PARTIAL';
        await tx.supplierPayable.update({
          where: { id: po.payable.id },
          data: {
            totalAmount: new PrismaNS.Decimal(Math.max(0, newTotal)),
            status: newStatus,
          },
        });
      }

      // Asiento contable contrario al de la factura, proporcional al monto
      // de la NC:
      //   DR Proveedores               por total
      //   CR Inventario|GastoOperativo por subtotal
      //   CR IVA Crédito Fiscal        por tax (solo si la factura tenía IVA)
      // No se asume reversa de retenciones — la NC del proveedor no anula
      // la retención (esa quedó declarada a SAT como pasivo).
      const lines = [];
      if (total > 0) {
        lines.push({
          accountCode: ACCOUNTS.AP,
          debit: total,
          description: `NC proveedor ${parsed.noteNumber} — Proveedores`,
        });
      }
      if (subtotal > 0) {
        lines.push({
          accountCode: ACCOUNTS.INVENTORY,
          credit: subtotal,
          description: `NC proveedor ${parsed.noteNumber} — Inventario`,
        });
      }
      if (tax > 0) {
        lines.push({
          accountCode: ACCOUNTS.VAT_INPUT,
          credit: tax,
          description: `NC proveedor ${parsed.noteNumber} — IVA Crédito Fiscal`,
        });
      }
      if (lines.length >= 2) {
        await createJournalEntry(tx, {
          companyId: tenant.companyId,
          branchId: po.branchId,
          date: parsed.noteDate,
          description: `Nota de crédito proveedor ${parsed.noteNumber} — PO ${po.id.slice(0, 8)}`,
          referenceType: 'SUPPLIER_CREDIT_NOTE',
          referenceId: created.id,
          userId: tenant.userId,
          lines,
        });
      }

      return created;
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'PURCHASE_CREDIT_NOTE_REGISTERED',
      entity: 'SupplierCreditNote',
      entityId: cn.id,
      details: { purchaseOrderId: po.id, total },
    });

    return NextResponse.json(cn, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchases/[id]/credit-note');
  }
}
