import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireBranchAccess } from '@/lib/tenant';
import { handleApiError, ApiError } from '@/lib/api-error';

/**
 * Kardex / Histórico de movimientos por producto.
 *
 * Consolida en una línea de tiempo:
 *  - Compras (PurchaseOrderItem) → entrada
 *  - Ventas (SaleItem) → salida
 *  - Ajustes (InventoryAdjustment) → entrada o salida según signo
 *  - Transferencias (StockTransferItem) → salida en origen, entrada en destino
 *  - Devoluciones de venta (SaleReturnItem con stockAdded=true) → entrada
 *
 * Devuelve los movimientos ordenados cronológicamente y un resumen
 * con totales de entradas/salidas en el período.
 */

const QuerySchema = z.object({
  productId: z.string().uuid('productId requerido'),
  variantId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  from: z.string().optional(),
  to: z.string().optional(),
});

interface KardexMovement {
  date: Date;
  type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'RETURN';
  reference: string;
  branchId: string | null;
  branchName: string | null;
  quantity: number; // positivo = entrada, negativo = salida
  unitCost: number | null;
  notes: string | null;
}

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

    const startDate = parsed.from
      ? new Date(parsed.from)
      : new Date(new Date().setDate(new Date().getDate() - 90));
    const endDate = parsed.to ? new Date(parsed.to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const variantWhere = parsed.variantId ? { variantId: parsed.variantId } : { variantId: null };

    // Cargar todas las branches para mapear nombres
    const branches = await prisma.branch.findMany({
      where: { companyId: tenant.companyId },
      select: { id: true, name: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    // 1. COMPRAS — entrada
    const purchaseItems = await prisma.purchaseOrderItem.findMany({
      where: {
        productId: parsed.productId,
        ...variantWhere,
        purchaseOrder: {
          companyId: tenant.companyId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate },
          ...(branchId ? { branchId } : {}),
        },
      },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            branchId: true,
            reference: true,
            createdAt: true,
            supplier: { select: { name: true } },
          },
        },
      },
    });

    // 2. VENTAS — salida
    const saleItems = await prisma.saleItem.findMany({
      where: {
        productId: parsed.productId,
        ...variantWhere,
        sale: {
          companyId: tenant.companyId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate },
          ...(branchId ? { branchId } : {}),
        },
      },
      include: {
        sale: {
          select: { id: true, branchId: true, invoiceNumber: true, createdAt: true },
        },
      },
    });

    // 3. AJUSTES
    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        productId: parsed.productId,
        ...variantWhere,
        companyId: tenant.companyId,
        createdAt: { gte: startDate, lte: endDate },
        ...(branchId ? { branchId } : {}),
      },
    });

    // 4. TRANSFERENCIAS
    const transferItems = await prisma.stockTransferItem.findMany({
      where: {
        productId: parsed.productId,
        ...variantWhere,
        transfer: {
          companyId: tenant.companyId,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lte: endDate },
          ...(branchId
            ? { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }
            : {}),
        },
      },
      include: {
        transfer: {
          select: { id: true, fromBranchId: true, toBranchId: true, reference: true, createdAt: true },
        },
      },
    });

    // 5. DEVOLUCIONES DE VENTA — entrada (solo si stockAdded)
    const saleReturnItems = await prisma.saleReturnItem.findMany({
      where: {
        saleItem: {
          productId: parsed.productId,
          ...variantWhere,
          sale: {
            companyId: tenant.companyId,
            ...(branchId ? { branchId } : {}),
          },
        },
        saleReturn: {
          stockAdded: true,
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        saleReturn: { select: { id: true, createdAt: true, reason: true } },
        saleItem: { select: { sale: { select: { branchId: true, invoiceNumber: true } } } },
      },
    });

    const movements: KardexMovement[] = [];

    for (const it of purchaseItems) {
      movements.push({
        date: it.purchaseOrder.createdAt,
        type: 'PURCHASE',
        reference: it.purchaseOrder.reference || `PO-${it.purchaseOrder.id.slice(0, 8)}`,
        branchId: it.purchaseOrder.branchId,
        branchName: branchMap.get(it.purchaseOrder.branchId) || null,
        quantity: it.quantity,
        unitCost: Number(it.unitCost),
        notes: it.purchaseOrder.supplier?.name ?? null,
      });
    }
    for (const it of saleItems) {
      movements.push({
        date: it.sale.createdAt,
        type: 'SALE',
        reference: it.sale.invoiceNumber || `S-${it.sale.id.slice(0, 8)}`,
        branchId: it.sale.branchId,
        branchName: branchMap.get(it.sale.branchId) || null,
        quantity: -it.quantity,
        unitCost: it.unitCost ? Number(it.unitCost) : null,
        notes: null,
      });
    }
    for (const adj of adjustments) {
      movements.push({
        date: adj.createdAt,
        type: 'ADJUSTMENT',
        reference: `ADJ-${adj.id.slice(0, 8)}`,
        branchId: adj.branchId,
        branchName: branchMap.get(adj.branchId) || null,
        quantity: adj.difference,
        unitCost: null,
        notes: adj.reason,
      });
    }
    for (const it of transferItems) {
      // Salida en origen
      movements.push({
        date: it.transfer.createdAt,
        type: 'TRANSFER_OUT',
        reference: it.transfer.reference || `TR-${it.transfer.id.slice(0, 8)}`,
        branchId: it.transfer.fromBranchId,
        branchName: branchMap.get(it.transfer.fromBranchId) || null,
        quantity: -it.quantity,
        unitCost: null,
        notes: `→ ${branchMap.get(it.transfer.toBranchId) || it.transfer.toBranchId}`,
      });
      // Entrada en destino
      movements.push({
        date: it.transfer.createdAt,
        type: 'TRANSFER_IN',
        reference: it.transfer.reference || `TR-${it.transfer.id.slice(0, 8)}`,
        branchId: it.transfer.toBranchId,
        branchName: branchMap.get(it.transfer.toBranchId) || null,
        quantity: it.quantity,
        unitCost: null,
        notes: `← ${branchMap.get(it.transfer.fromBranchId) || it.transfer.fromBranchId}`,
      });
    }
    for (const sr of saleReturnItems) {
      movements.push({
        date: sr.saleReturn.createdAt,
        type: 'RETURN',
        reference: `RET-${sr.saleReturn.id.slice(0, 8)}`,
        branchId: sr.saleItem.sale.branchId,
        branchName: branchMap.get(sr.saleItem.sale.branchId) || null,
        quantity: sr.quantity,
        unitCost: null,
        notes: sr.saleReturn.reason,
      });
    }

    // Ordenar cronológicamente y calcular saldo running
    movements.sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = 0;
    const movementsWithBalance = movements.map((m) => {
      running += m.quantity;
      return { ...m, balance: running };
    });

    const totalIn = movements.filter((m) => m.quantity > 0).reduce((acc, m) => acc + m.quantity, 0);
    const totalOut = movements
      .filter((m) => m.quantity < 0)
      .reduce((acc, m) => acc + Math.abs(m.quantity), 0);

    // Stock actual (real) según ProductStock
    const stockNow = await prisma.productStock.findMany({
      where: {
        productId: parsed.productId,
        ...(parsed.variantId ? { variantId: parsed.variantId } : { variantId: null }),
        ...(branchId ? { branchId } : { branch: { companyId: tenant.companyId } }),
      },
      select: { branchId: true, quantity: true },
    });

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
        movimientos: movements.length,
        totalEntradas: totalIn,
        totalSalidas: totalOut,
        neto: totalIn - totalOut,
        stockActualReal: stockNow.reduce((acc, s) => acc + s.quantity, 0),
      },
      movimientos: movementsWithBalance,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/inventory/kardex GET');
  }
}
