import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant, requireBranchAccess } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';
import { calculateCommissions, assertTransition } from '@/lib/sales';

/**
 * POST /api/sales/:saleId/invoice
 *
 * Pasa la venta de DELIVERED → INVOICED. Acciones:
 *   1. Crea JournalEntry de venta (DR Caja/Bancos/AR / CR Ventas + IVA Débito).
 *   2. (Si Company.commissionEnabled) genera comisiones por vendedor según
 *      CommissionRule activas.
 *   3. La certificación FEL queda como paso opcional posterior: el cliente
 *      llama a `POST /api/fel/certify/:saleId` para emitir el DTE. Mantenemos
 *      la separación para que ventas a clientes "Sin FEL" puedan invoiced
 *      sin DTE (ej. pre-FEL onboarding).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id: saleId } = await params;

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId: tenant.companyId },
      include: {
        items: { include: { product: { select: { categoryId: true } } } },
        payments: true,
      },
    });
    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    const branchCheck = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchCheck) return branchCheck.error;

    const st = String(sale.status);
    if (st !== 'DELIVERED') {
      return NextResponse.json(
        { error: `Solo se factura una venta DELIVERED (actual: ${st}).` },
        { status: 400 },
      );
    }
    assertTransition('DELIVERED', 'INVOICED');

    const company = (await prisma.company.findUnique({
      where: { id: tenant.companyId },
    })) as
      | { taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null; commissionEnabled: boolean }
      | null;
    if (!company?.taxRegime) {
      return NextResponse.json(
        { error: 'Empresa sin régimen tributario.', code: 'TAX_REGIME_NOT_CONFIGURED' },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1) JournalEntry de ingreso.
      const subtotal = Number(sale.subtotal);
      const taxAmount = Number(sale.tax);
      const totalAmount = Number(sale.total);
      const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];
      for (const p of sale.payments) {
        const amt = Number(p.amount);
        if (amt <= 0) continue;
        let accountCode: string;
        if (p.method === 'CASH') accountCode = ACCOUNTS.CASH;
        else if (p.method === 'CREDIT') accountCode = ACCOUNTS.AR;
        else accountCode = ACCOUNTS.BANKS;
        lines.push({ accountCode, debit: amt, description: `Cobro ${p.method}` });
      }
      // Si no hay pagos (puro crédito enterprise futuro), asumimos AR del total.
      if (lines.length === 0) {
        lines.push({ accountCode: ACCOUNTS.AR, debit: totalAmount, description: 'Crédito a cliente' });
      }
      if (company.taxRegime === 'GENERAL') {
        if (subtotal > 0) lines.push({ accountCode: ACCOUNTS.SALES, credit: subtotal, description: 'Ventas' });
        if (taxAmount > 0) lines.push({ accountCode: ACCOUNTS.VAT_OUTPUT, credit: taxAmount, description: 'IVA Débito' });
      } else {
        if (totalAmount > 0) {
          lines.push({
            accountCode: ACCOUNTS.SALES,
            credit: totalAmount,
            description: 'Ventas (Pequeño Contribuyente)',
          });
        }
      }
      await createJournalEntry(tx, {
        companyId: tenant.companyId,
        branchId: sale.branchId,
        date: new Date(),
        description: `Facturación venta enterprise #${sale.id.split('-')[0].toUpperCase()}`,
        referenceType: 'SALE',
        referenceId: sale.id,
        userId: tenant.userId,
        lines,
      });

      // 2) Comisiones (si flag).
      if (company.commissionEnabled) {
        const rules = await (tx as unknown as {
          commissionRule: { findMany: (a: unknown) => Promise<unknown[]> };
        }).commissionRule.findMany({
          where: { companyId: tenant.companyId, active: true },
        }) as Array<{
          id: string;
          companyId: string;
          categoryId: string | null;
          basis: 'MARGIN' | 'SUBTOTAL';
          rate: unknown;
          active: boolean;
        }>;
        const itemsForCommission = sale.items.map((si) => ({
          productId: si.productId,
          subtotal: si.subtotal,
          unitCost: si.unitCost ?? 0,
          quantity: si.quantity,
          categoryId: (si.product as unknown as { categoryId: string | null }).categoryId,
        }));
        const salesUserId = (sale as unknown as { salesUserId: string | null }).salesUserId ?? sale.userId;
        const employee = await prisma.employee.findFirst({
          where: { companyId: tenant.companyId, userId: salesUserId },
          select: { id: true },
        });
        const commissions = calculateCommissions(itemsForCommission, rules, {
          employeeId: employee?.id ?? null,
        });
        for (const c of commissions) {
          await (tx as unknown as {
            commission: { create: (a: unknown) => Promise<unknown> };
          }).commission.create({
            data: {
              companyId: tenant.companyId,
              ruleId: c.ruleId,
              saleId: sale.id,
              employeeId: c.employeeId ?? null,
              amount: c.amount,
              status: 'ACCRUED',
            },
          });
        }
      }

      // 3) Cambiar estado a INVOICED.
      await tx.sale.update({
        where: { id: sale.id },
        data: ({ status: 'INVOICED' } as unknown) as never,
      });
    });

    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_INVOICED',
      entity: 'Sale',
      entityId: sale.id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Invoice sale error:', error);
    const message = error instanceof Error ? error.message : 'Error al facturar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
