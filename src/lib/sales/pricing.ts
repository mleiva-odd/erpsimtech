/**
 * Resolución de precio unitario (Fase 20).
 *
 * Precedencia (de mayor a menor):
 *   1. PriceListItem en `priceListIdOverride` (si viene seteado en el body).
 *   2. PriceListItem en cualquier PriceList asignado al cliente (CustomerPriceList).
 *      Si hay varios precios para el mismo producto, gana el más bajo.
 *   3. Product.wholesalePrice (si `useWholesale=true` y el producto lo tiene).
 *   4. ProductVariant.price (si variantId presente y la variante tiene precio).
 *   5. Product.price.
 *
 * El helper NO conoce la cantidad — siempre devuelve el unit price puro.
 * El descuento por línea (`discount`/`discountRate`) se aplica en el caller.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface ResolveUnitPriceInput {
  productId: string;
  variantId?: string | null;
  customerId?: string | null;
  priceListIdOverride?: string | null;
  companyId: string;
  useWholesale?: boolean;
}

export interface ResolveUnitPriceResult {
  unitPrice: number;
  /** Origen del precio (debug/auditoría). */
  source:
    | 'PRICELIST_OVERRIDE'
    | 'CUSTOMER_PRICELIST'
    | 'WHOLESALE'
    | 'VARIANT'
    | 'PRODUCT';
  priceListId: string | null;
}

export async function resolveUnitPrice(
  tx: Tx,
  input: ResolveUnitPriceInput,
): Promise<ResolveUnitPriceResult> {
  const { productId, companyId } = input;
  const variantId = input.variantId ?? null;

  // 1) Override explícito (priceListId en body).
  if (input.priceListIdOverride) {
    const pli = await (tx as unknown as {
      priceListItem: { findFirst: (a: unknown) => Promise<unknown> };
    }).priceListItem.findFirst({
      where: {
        priceListId: input.priceListIdOverride,
        productId,
        variantId,
        priceList: { companyId, active: true },
      },
      select: { price: true, priceListId: true },
    }) as { price: unknown; priceListId: string } | null;
    if (pli) {
      return {
        unitPrice: Number(pli.price),
        source: 'PRICELIST_OVERRIDE',
        priceListId: pli.priceListId,
      };
    }
  }

  // 2) Lista(s) asignadas al cliente.
  if (input.customerId) {
    const customerLists = await (tx as unknown as {
      customerPriceList: { findMany: (a: unknown) => Promise<Array<{ priceListId: string }>> };
    }).customerPriceList.findMany({
      where: {
        customerId: input.customerId,
        priceList: { companyId, active: true },
      },
      select: { priceListId: true },
    });
    if (customerLists.length > 0) {
      const ids = customerLists.map((c) => c.priceListId);
      const items = await (tx as unknown as {
        priceListItem: { findMany: (a: unknown) => Promise<Array<{ price: unknown; priceListId: string }>> };
      }).priceListItem.findMany({
        where: { priceListId: { in: ids }, productId, variantId },
        select: { price: true, priceListId: true },
      });
      if (items.length > 0) {
        const cheapest = items.reduce((best, cur) =>
          Number(cur.price) < Number(best.price) ? cur : best,
        );
        return {
          unitPrice: Number(cheapest.price),
          source: 'CUSTOMER_PRICELIST',
          priceListId: cheapest.priceListId,
        };
      }
    }
  }

  // 3) Wholesale / 4) Variant / 5) Product.
  if (variantId) {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { price: true, wholesalePrice: true, product: { select: { price: true, wholesalePrice: true } } },
    });
    if (variant) {
      if (input.useWholesale) {
        const wp = Number(variant.wholesalePrice ?? variant.product?.wholesalePrice ?? 0);
        if (wp > 0) {
          return { unitPrice: wp, source: 'WHOLESALE', priceListId: null };
        }
      }
      const vp = Number(variant.price ?? 0);
      if (vp > 0) return { unitPrice: vp, source: 'VARIANT', priceListId: null };
      return { unitPrice: Number(variant.product?.price ?? 0), source: 'PRODUCT', priceListId: null };
    }
  }

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { price: true, wholesalePrice: true },
  });
  if (!product) {
    throw new Error(`Producto ${productId} no encontrado.`);
  }
  if (input.useWholesale && product.wholesalePrice && Number(product.wholesalePrice) > 0) {
    return { unitPrice: Number(product.wholesalePrice), source: 'WHOLESALE', priceListId: null };
  }
  return { unitPrice: Number(product.price), source: 'PRODUCT', priceListId: null };
}
