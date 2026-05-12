/**
 * Helpers de costeo promedio ponderado (WAC) y registro de movimientos
 * de stock (Fase 15).
 *
 * Toda lógica que altere stock o cost debe pasar por `recordStockMovement`.
 * Caso contrario el kardex queda inconsistente con la realidad física.
 *
 * Convenciones:
 *  - `quantity` SIEMPRE firmada (positivo = entrada, negativo = salida).
 *  - El costo (`unitCost`) se persiste como snapshot del momento del movimiento.
 *  - El nuevo costo promedio se calcula SOLO en entradas con qty > 0; en
 *    salidas el `costAfter` mantiene el costo previo (no se modifica WAC).
 *  - El "stock before" para WAC es el stock TOTAL del producto/variante
 *    sumado sobre TODAS las sucursales (costeo a nivel empresa, no sucursal,
 *    consistente con `Product.cost` global del schema).
 */

import type { Prisma } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Tipos de movimiento que constituyen una ENTRADA (incrementan stock y, si
 * `qty > 0` y `unitCost > 0`, recalculan el costo promedio ponderado del SKU).
 */
const INBOUND_TYPES = new Set<string>([
  'PURCHASE',
  'ADJUSTMENT_IN',
  'TRANSFER_IN',
  'RETURN_FROM_CUSTOMER',
]);

/**
 * Calcula nuevo costo promedio ponderado:
 *
 *   nuevoCosto = (stockAnterior * costoAnterior + cantNueva * costoNuevo)
 *              / (stockAnterior + cantNueva)
 *
 * Reglas defensivas:
 *  - Si `stockBefore <= 0` (no había stock o estaba negativo), el costo
 *    nuevo es directamente `costIn` (no hay nada que promediar contra).
 *  - Si `qtyIn <= 0` (entrada cero/negativa), no cambiamos el costo y
 *    devolvemos `costBefore`.
 *  - Si `costIn <= 0` (entrada gratis tipo bonificación), tampoco promediamos
 *    — devolvemos `costBefore`. Una entrada con costo 0 distorsionaría
 *    el WAC hacia abajo artificialmente.
 *  - Si tanto `stockBefore` como `qtyIn` son ≤ 0, devolvemos `costBefore`
 *    (no hay forma de calcular un promedio significativo).
 */
export function weightedAverageCost(
  stockBefore: number,
  costBefore: number,
  qtyIn: number,
  costIn: number,
): number {
  if (qtyIn <= 0 || costIn <= 0) return costBefore;
  if (stockBefore <= 0) return costIn;
  const totalValue = stockBefore * costBefore + qtyIn * costIn;
  const totalQty = stockBefore + qtyIn;
  if (totalQty <= 0) return costBefore;
  return totalValue / totalQty;
}

/**
 * Captura el costo actual de un producto/variante para snapshot al momento
 * de la venta.
 *
 *  - Si tiene variante: `variant.cost ?? 0`.
 *  - Si es bundle: suma recursiva de costos de los componentes (cantidad
 *    del componente * costo del componente). Soporta bundle dentro de bundle.
 *  - Caso default: `product.cost ?? 0`.
 */
export async function getCurrentCost(
  tx: Tx,
  productId: string,
  variantId?: string | null,
): Promise<number> {
  if (variantId) {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { cost: true },
    });
    return Number(variant?.cost ?? 0);
  }

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      cost: true,
      isBundle: true,
      bundleItems: {
        select: {
          componentId: true,
          variantId: true,
          quantity: true,
        },
      },
    },
  });
  if (!product) return 0;

  if (product.isBundle && product.bundleItems.length > 0) {
    let total = 0;
    for (const bi of product.bundleItems) {
      const childCost = await getCurrentCost(tx, bi.componentId, bi.variantId);
      total += childCost * Number(bi.quantity);
    }
    return total;
  }

  return Number(product.cost ?? 0);
}

export type RecordStockMovementInput = {
  companyId: string;
  productId: string;
  variantId?: string | null;
  branchId: string;
  type:
    | 'PURCHASE'
    | 'SALE'
    | 'ADJUSTMENT_IN'
    | 'ADJUSTMENT_OUT'
    | 'TRANSFER_OUT'
    | 'TRANSFER_IN'
    | 'RETURN_FROM_CUSTOMER'
    | 'RETURN_TO_SUPPLIER'
    | 'COUNT_DIFFERENCE';
  /** Con signo (positivo entrada, negativo salida). */
  quantity: number;
  /** Costo unitario del movimiento (no firmado). */
  unitCost: number;
  referenceType: string;
  referenceId: string;
  userId: string;
  date?: Date;
  notes?: string;
};

/**
 * Suma del stock del SKU en TODAS las sucursales (excluye la consolidación
 * del padre cuando hay variantes).
 */
async function getTotalStock(
  tx: Tx,
  productId: string,
  variantId: string | null,
): Promise<number> {
  const rows = await tx.productStock.findMany({
    where: {
      productId,
      variantId: variantId ?? null,
    },
    select: { quantity: true },
  });
  return rows.reduce((acc: number, r: { quantity: number }) => acc + Number(r.quantity), 0);
}

/**
 * Lee el costo persistido actual del SKU (Product.cost o ProductVariant.cost).
 */
async function getPersistedCost(
  tx: Tx,
  productId: string,
  variantId: string | null,
): Promise<number> {
  if (variantId) {
    const v = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { cost: true },
    });
    return Number(v?.cost ?? 0);
  }
  const p = await tx.product.findUnique({
    where: { id: productId },
    select: { cost: true },
  });
  return Number(p?.cost ?? 0);
}

/**
 * Actualiza el stock en la sucursal indicada. Suma `quantity` (firmada) al
 * stock existente. Si la fila no existe y la entrada es positiva, la crea.
 * Si no existe y la entrada es negativa, falla (no se debería invocar con
 * stock inexistente y salida — el caller debe validar antes).
 */
async function applyStockDelta(
  tx: Tx,
  productId: string,
  variantId: string | null,
  branchId: string,
  delta: number,
): Promise<number> {
  if (variantId) {
    const existing = await tx.productStock.findUnique({
      where: {
        productId_branchId_variantId: {
          productId,
          branchId,
          variantId,
        },
      },
      select: { id: true, quantity: true },
    });
    if (existing) {
      const updated = await tx.productStock.update({
        where: { id: existing.id },
        data: { quantity: { increment: Math.trunc(delta) } },
        select: { quantity: true },
      });
      return Number(updated.quantity);
    }
    if (delta < 0) {
      throw new Error(
        `No se puede aplicar salida de stock: no existe fila ProductStock para producto ${productId} variante ${variantId} en sucursal ${branchId}.`,
      );
    }
    const created = await tx.productStock.create({
      data: {
        productId,
        variantId,
        branchId,
        quantity: Math.trunc(delta),
        minStock: 5,
      },
      select: { quantity: true },
    });
    return Number(created.quantity);
  }

  const existing = await tx.productStock.findFirst({
    where: { productId, variantId: null, branchId },
    select: { id: true, quantity: true },
  });
  if (existing) {
    const updated = await tx.productStock.update({
      where: { id: existing.id },
      data: { quantity: { increment: Math.trunc(delta) } },
      select: { quantity: true },
    });
    return Number(updated.quantity);
  }
  if (delta < 0) {
    throw new Error(
      `No se puede aplicar salida de stock: no existe fila ProductStock para producto ${productId} en sucursal ${branchId}.`,
    );
  }
  const created = await tx.productStock.create({
    data: {
      productId,
      variantId: null,
      branchId,
      quantity: Math.trunc(delta),
      minStock: 5,
    },
    select: { quantity: true },
  });
  return Number(created.quantity);
}

/**
 * Registra un StockMovement + actualiza ProductStock (suma `quantity` firmada)
 * + actualiza `Product.cost` (o `ProductVariant.cost`) cuando corresponde.
 *
 * Cuándo se actualiza el costo persistido:
 *  - Tipo PURCHASE / ADJUSTMENT_IN / TRANSFER_IN / RETURN_FROM_CUSTOMER
 *    con `quantity > 0` y `unitCost > 0`: se aplica WAC contra stock total
 *    previo y costo previo.
 *  - Salidas (SALE / ADJUSTMENT_OUT / TRANSFER_OUT / RETURN_TO_SUPPLIER /
 *    COUNT_DIFFERENCE con qty<0): NO modifican el costo (mantiene
 *    `costBefore`).
 *
 * IMPORTANTE: este helper NO crea asientos contables. Eso queda a cargo
 * del caller (handler de venta/compra/devolución). Aquí solo se persiste
 * el log físico de inventario + WAC.
 */
export async function recordStockMovement(
  tx: Tx,
  input: RecordStockMovementInput,
) {
  if (input.quantity === 0) {
    throw new Error(
      `recordStockMovement: quantity no puede ser 0 (tipo ${input.type}).`,
    );
  }

  const variantId = input.variantId ?? null;
  const stockBefore = await getTotalStock(tx, input.productId, variantId);
  const costBefore = await getPersistedCost(tx, input.productId, variantId);

  const isInbound = INBOUND_TYPES.has(input.type) && input.quantity > 0;

  // 1) Recalcular costo si aplica.
  let costAfter = costBefore;
  if (isInbound) {
    costAfter = weightedAverageCost(
      stockBefore,
      costBefore,
      input.quantity,
      input.unitCost,
    );
  }

  // 2) Aplicar delta en la sucursal (entrada o salida).
  await applyStockDelta(
    tx,
    input.productId,
    variantId,
    input.branchId,
    input.quantity,
  );

  // 3) Si hubo cambio de costo, persistirlo en Product/ProductVariant.
  if (isInbound && costAfter !== costBefore) {
    if (variantId) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { cost: new PrismaNS.Decimal(round4(costAfter)) },
      });
    } else {
      await tx.product.update({
        where: { id: input.productId, companyId: input.companyId },
        data: { cost: new PrismaNS.Decimal(round4(costAfter)) },
      });
    }
  }

  // 4) Calcular balanceAfter global (suma de todas las sucursales).
  const balanceAfter = stockBefore + input.quantity;

  // 5) Insertar el movimiento.
  const movement = await tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      productId: input.productId,
      variantId,
      branchId: input.branchId,
      type: input.type,
      quantity: new PrismaNS.Decimal(round3(input.quantity)),
      unitCost: new PrismaNS.Decimal(round4(input.unitCost)),
      balanceAfter: new PrismaNS.Decimal(round3(balanceAfter)),
      costAfter: new PrismaNS.Decimal(round4(costAfter)),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      date: input.date ?? new Date(),
      userId: input.userId,
      notes: input.notes ?? null,
    },
  });

  return movement;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Variante de `recordStockMovement` que NO toca `ProductStock` ni
 * `Product.cost` — solo escribe la fila de auditoría en `StockMovement`.
 *
 * Para callers que ya hicieron el `updateMany` con guard de concurrencia
 * (ej. ventas, transferencias) y necesitan dejar trazabilidad sin doblar
 * la operación. `balanceAfter` se calcula leyendo el stock global del SKU
 * post-delta; `costAfter` se lee del costo persistido actual.
 */
export async function logStockMovementInline(
  tx: Tx,
  input: RecordStockMovementInput,
) {
  if (input.quantity === 0) {
    throw new Error(
      `logStockMovementInline: quantity no puede ser 0 (tipo ${input.type}).`,
    );
  }
  const variantId = input.variantId ?? null;
  const balanceAfter = await getTotalStock(tx, input.productId, variantId);
  const costAfter = await getPersistedCost(tx, input.productId, variantId);

  return tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      productId: input.productId,
      variantId,
      branchId: input.branchId,
      type: input.type,
      quantity: new PrismaNS.Decimal(round3(input.quantity)),
      unitCost: new PrismaNS.Decimal(round4(input.unitCost)),
      balanceAfter: new PrismaNS.Decimal(round3(balanceAfter)),
      costAfter: new PrismaNS.Decimal(round4(costAfter)),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      date: input.date ?? new Date(),
      userId: input.userId,
      notes: input.notes ?? null,
    },
  });
}
