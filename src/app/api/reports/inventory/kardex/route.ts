import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireBranchAccess } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

/**
 * Kardex / Histórico de movimientos por producto (Fase 15).
 *
 * Lee directamente de `StockMovement`, que es el log unificado de toda
 * alteración de stock. Cada fila ya trae `balanceAfter` y `costAfter`
 * snapshoteados, así que el saldo running es exactamente la última fila
 * — no se reconstruye en memoria.
 *
 * Sin ventana de 90 días por defecto: el rango va desde el primer
 * movimiento del producto hasta hoy si no se especifica `from`.
 */

const QuerySchema = z.object({
  productId: z.string().uuid('productId requerido'),
  variantId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.parse({
      productId: searchParams.get('productId'),
      variantId: searchParams.get('variantId') || undefined,
      branchId: searchParams.get('branchId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    // Verificar que el producto pertenece al tenant.
    const product = await prisma.product.findFirst({
      where: { id: parsed.productId, companyId: tenant.companyId },
      select: { id: true, name: true, sku: true, unitOfMeasure: true },
    });
    if (!product) throw new ApiError(404, 'Producto no encontrado');

    let branchId: string | null = null;
    if (parsed.branchId) {
      const branchResult = await requireBranchAccess(tenant, parsed.branchId);
      if ('error' in branchResult) return branchResult.error;
      branchId = parsed.branchId;
    } else if (
      tenant.role !== 'SUPER_ADMIN' &&
      !tenant.permissions?.includes('settings:manage') &&
      tenant.branchId
    ) {
      branchId = tenant.branchId;
    }

    // Sin default de 90 días: si no hay `from`, mostramos desde el primer mov.
    const startDate = parsed.from ? new Date(parsed.from) : null;
    const endDate = parsed.to ? new Date(parsed.to) : new Date();
    if (parsed.to) endDate.setHours(23, 59, 59, 999);

    const branches = await prisma.branch.findMany({
      where: { companyId: tenant.companyId },
      select: { id: true, name: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = startDate;
    dateFilter.lte = endDate;

    const movements = await prisma.stockMovement.findMany({
      where: {
        companyId: tenant.companyId,
        productId: parsed.productId,
        ...(parsed.variantId ? { variantId: parsed.variantId } : { variantId: null }),
        ...(branchId ? { branchId } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    type MovementRow = {
      id: string;
      date: Date;
      type: string;
      quantity: unknown;
      unitCost: unknown;
      balanceAfter: unknown;
      costAfter: unknown;
      branchId: string;
      referenceType: string;
      referenceId: string;
      notes: string | null;
    };

    const movementsView = (movements as MovementRow[]).map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      reference: `${m.referenceType}-${m.referenceId.slice(0, 8)}`,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      branchId: m.branchId,
      branchName: branchMap.get(m.branchId) || null,
      quantity: Number(m.quantity),
      unitCost: Number(m.unitCost),
      balance: Number(m.balanceAfter),
      costAfter: Number(m.costAfter),
      notes: m.notes,
    }));

    const totalIn = movementsView
      .filter((m) => m.quantity > 0)
      .reduce((acc, m) => acc + m.quantity, 0);
    const totalOut = movementsView
      .filter((m) => m.quantity < 0)
      .reduce((acc, m) => acc + Math.abs(m.quantity), 0);

    // Stock actual real desde ProductStock (para reconciliación visual).
    const stockNow = await prisma.productStock.findMany({
      where: {
        productId: parsed.productId,
        ...(parsed.variantId ? { variantId: parsed.variantId } : { variantId: null }),
        ...(branchId ? { branchId } : { branch: { companyId: tenant.companyId } }),
      },
      select: { branchId: true, quantity: true },
    });
    const stockActualReal = stockNow.reduce((acc, s) => acc + s.quantity, 0);

    const lastBalance = movementsView.length > 0
      ? movementsView[movementsView.length - 1].balance
      : 0;
    const lastCost = movementsView.length > 0
      ? movementsView[movementsView.length - 1].costAfter
      : 0;

    return NextResponse.json({
      product,
      filtros: {
        productId: parsed.productId,
        variantId: parsed.variantId || null,
        branchId,
        desde: startDate,
        hasta: endDate,
      },
      resumen: {
        movimientos: movementsView.length,
        totalEntradas: totalIn,
        totalSalidas: totalOut,
        neto: totalIn - totalOut,
        stockActualReal,
        costoPromedioActual: lastCost,
        valuacionFinal: lastBalance * lastCost,
      },
      movimientos: movementsView,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/inventory/kardex GET');
  }
}
