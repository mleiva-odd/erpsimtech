import { describe, it, expect } from 'vitest';
import { resolveUnitPrice } from '../pricing';

function mkTx(spec: {
  priceListItems: Array<{ priceListId: string; productId: string; variantId: string | null; price: number; companyId: string; active: boolean }>;
  customerLists: Array<{ customerId: string; priceListId: string; companyId: string; active: boolean }>;
  variants: Record<string, { price: number | null; wholesalePrice: number | null; product: { price: number; wholesalePrice: number | null } }>;
  products: Record<string, { price: number; wholesalePrice: number | null }>;
}) {
  return {
    priceListItem: {
      findFirst: async (a: { where: { priceListId?: string; productId: string; variantId: string | null; priceList?: { companyId?: string; active?: boolean } } }) => {
        const f = spec.priceListItems.find((x) =>
          (a.where.priceListId == null || x.priceListId === a.where.priceListId) &&
          x.productId === a.where.productId &&
          (x.variantId ?? null) === (a.where.variantId ?? null) &&
          (a.where.priceList?.companyId == null || x.companyId === a.where.priceList.companyId) &&
          (a.where.priceList?.active == null || x.active === a.where.priceList.active),
        );
        return f ?? null;
      },
      findMany: async (a: { where: { priceListId: { in: string[] }; productId: string; variantId: string | null } }) => {
        return spec.priceListItems.filter((x) =>
          a.where.priceListId.in.includes(x.priceListId) &&
          x.productId === a.where.productId &&
          (x.variantId ?? null) === (a.where.variantId ?? null),
        );
      },
    },
    customerPriceList: {
      findMany: async (a: { where: { customerId: string; priceList: { companyId: string; active: boolean } } }) => {
        return spec.customerLists.filter((x) =>
          x.customerId === a.where.customerId &&
          x.companyId === a.where.priceList.companyId &&
          x.active === a.where.priceList.active,
        );
      },
    },
    productVariant: {
      findUnique: async (a: { where: { id: string } }) => {
        const v = spec.variants[a.where.id];
        if (!v) return null;
        return v;
      },
    },
    product: {
      findUnique: async (a: { where: { id: string } }) => spec.products[a.where.id] ?? null,
    },
  };
}

describe('resolveUnitPrice (Fase 20) — orden de precedencia', () => {
  it('1) priceListIdOverride gana sobre todo', async () => {
    const tx = mkTx({
      priceListItems: [
        { priceListId: 'pl-override', productId: 'p1', variantId: null, price: 50, companyId: 'c', active: true },
        { priceListId: 'pl-customer', productId: 'p1', variantId: null, price: 70, companyId: 'c', active: true },
      ],
      customerLists: [{ customerId: 'cust1', priceListId: 'pl-customer', companyId: 'c', active: true }],
      variants: {},
      products: { p1: { price: 100, wholesalePrice: 80 } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolveUnitPrice(tx as any, {
      productId: 'p1',
      customerId: 'cust1',
      priceListIdOverride: 'pl-override',
      companyId: 'c',
    });
    expect(r.unitPrice).toBe(50);
    expect(r.source).toBe('PRICELIST_OVERRIDE');
  });

  it('2) lista del cliente gana sobre wholesale/product', async () => {
    const tx = mkTx({
      priceListItems: [
        { priceListId: 'pl-customer', productId: 'p1', variantId: null, price: 70, companyId: 'c', active: true },
      ],
      customerLists: [{ customerId: 'cust1', priceListId: 'pl-customer', companyId: 'c', active: true }],
      variants: {},
      products: { p1: { price: 100, wholesalePrice: 80 } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolveUnitPrice(tx as any, {
      productId: 'p1',
      customerId: 'cust1',
      companyId: 'c',
      useWholesale: true,
    });
    expect(r.unitPrice).toBe(70);
    expect(r.source).toBe('CUSTOMER_PRICELIST');
  });

  it('3) wholesale gana sobre product.price si useWholesale=true', async () => {
    const tx = mkTx({
      priceListItems: [],
      customerLists: [],
      variants: {},
      products: { p1: { price: 100, wholesalePrice: 80 } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolveUnitPrice(tx as any, {
      productId: 'p1',
      companyId: 'c',
      useWholesale: true,
    });
    expect(r.unitPrice).toBe(80);
    expect(r.source).toBe('WHOLESALE');
  });

  it('4) product.price como fallback final', async () => {
    const tx = mkTx({
      priceListItems: [],
      customerLists: [],
      variants: {},
      products: { p1: { price: 100, wholesalePrice: null } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolveUnitPrice(tx as any, { productId: 'p1', companyId: 'c' });
    expect(r.unitPrice).toBe(100);
    expect(r.source).toBe('PRODUCT');
  });

  it('si hay múltiples listas asignadas al cliente, gana la más barata', async () => {
    const tx = mkTx({
      priceListItems: [
        { priceListId: 'plA', productId: 'p1', variantId: null, price: 60, companyId: 'c', active: true },
        { priceListId: 'plB', productId: 'p1', variantId: null, price: 70, companyId: 'c', active: true },
      ],
      customerLists: [
        { customerId: 'cust1', priceListId: 'plA', companyId: 'c', active: true },
        { customerId: 'cust1', priceListId: 'plB', companyId: 'c', active: true },
      ],
      variants: {},
      products: { p1: { price: 100, wholesalePrice: null } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolveUnitPrice(tx as any, { productId: 'p1', customerId: 'cust1', companyId: 'c' });
    expect(r.unitPrice).toBe(60);
  });
});
