/**
 * Mock minimal de `Prisma.TransactionClient` para tests unitarios de Fase 15
 * (helpers de costeo promedio ponderado + StockMovement).
 *
 * Soporta los métodos que `recordStockMovement`, `getCurrentCost` y
 * `logStockMovementInline` consumen:
 *   - product.findUnique / update
 *   - productVariant.findUnique / update
 *   - productStock.findMany / findFirst / findUnique / update / create
 *   - stockMovement.create / findMany
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let idCounter = 1;
function newId() {
  return `id-${idCounter++}`;
}

type ProductRow = {
  id: string;
  companyId: string;
  cost: number;
  isBundle: boolean;
  bundleItems: Array<{ componentId: string; variantId: string | null; quantity: number }>;
};

type VariantRow = {
  id: string;
  productId: string;
  cost: number;
};

type StockRow = {
  id: string;
  productId: string;
  variantId: string | null;
  branchId: string;
  quantity: number;
  minStock: number;
};

type MovementRow = {
  id: string;
  companyId: string;
  productId: string;
  variantId: string | null;
  branchId: string;
  type: string;
  quantity: number;
  unitCost: number;
  balanceAfter: number;
  costAfter: number;
  referenceType: string;
  referenceId: string;
  date: Date;
  userId: string;
  notes: string | null;
};

type Decimalable = { toString(): string; valueOf?: () => number };
const toNumber = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toString' in (v as any)) {
    return Number((v as Decimalable).toString());
  }
  return Number(v);
};

const decimalize = (v: unknown) => {
  const n = toNumber(v);
  return {
    toString: () => String(n),
    valueOf: () => n,
  };
};

export function makeMockTx(seed: {
  products?: Array<Partial<ProductRow> & { id: string; companyId: string }>;
  variants?: Array<Partial<VariantRow> & { id: string; productId: string }>;
  stocks?: Array<Partial<StockRow> & { productId: string; branchId: string }>;
} = {}) {
  const products: ProductRow[] = (seed.products ?? []).map((p) => ({
    cost: 0,
    isBundle: false,
    bundleItems: [],
    ...p,
  } as ProductRow));
  const variants: VariantRow[] = (seed.variants ?? []).map((v) => ({
    cost: 0,
    ...v,
  } as VariantRow));
  const stocks: StockRow[] = (seed.stocks ?? []).map((s) => ({
    id: newId(),
    variantId: s.variantId ?? null,
    quantity: 0,
    minStock: 5,
    ...s,
  } as StockRow));
  const movements: MovementRow[] = [];

  const tx = {
    product: {
      findUnique: async ({ where, select }: any) => {
        const p = products.find((x) => x.id === where.id);
        if (!p) return null;
        const out: any = {};
        if (!select) return p;
        if (select.cost) out.cost = decimalize(p.cost);
        if (select.isBundle) out.isBundle = p.isBundle;
        if (select.bundleItems) out.bundleItems = p.bundleItems;
        return out;
      },
      update: async ({ where, data }: any) => {
        const p = products.find((x) => x.id === where.id);
        if (!p) throw new Error('product not found');
        if (data.cost !== undefined) p.cost = toNumber(data.cost);
        return p;
      },
    },
    productVariant: {
      findUnique: async ({ where, select }: any) => {
        const v = variants.find((x) => x.id === where.id);
        if (!v) return null;
        if (!select) return v;
        const out: any = {};
        if (select.cost) out.cost = decimalize(v.cost);
        return out;
      },
      update: async ({ where, data }: any) => {
        const v = variants.find((x) => x.id === where.id);
        if (!v) throw new Error('variant not found');
        if (data.cost !== undefined) v.cost = toNumber(data.cost);
        return v;
      },
    },
    productStock: {
      findMany: async ({ where, select }: any) => {
        const rows = stocks.filter((s) => {
          if (where.productId && s.productId !== where.productId) return false;
          if ('variantId' in where) {
            if ((where.variantId ?? null) !== s.variantId) return false;
          }
          if (where.branchId && s.branchId !== where.branchId) return false;
          return true;
        });
        if (!select) return rows;
        return rows.map((r) => {
          const out: any = {};
          for (const k of Object.keys(select)) out[k] = (r as any)[k];
          return out;
        });
      },
      findFirst: async ({ where, select }: any) => {
        const rows = await tx.productStock.findMany({ where, select });
        return rows[0] ?? null;
      },
      findUnique: async ({ where, select }: any) => {
        const k = where.productId_branchId_variantId;
        if (!k) return null;
        const found = stocks.find(
          (s) =>
            s.productId === k.productId &&
            s.branchId === k.branchId &&
            (s.variantId ?? null) === (k.variantId ?? null),
        );
        if (!found) return null;
        if (!select) return found;
        const out: any = {};
        for (const key of Object.keys(select)) out[key] = (found as any)[key];
        return out;
      },
      update: async ({ where, data, select }: any) => {
        const s = stocks.find((x) => x.id === where.id);
        if (!s) throw new Error('stock not found');
        if (data.quantity?.increment !== undefined) {
          s.quantity += Number(data.quantity.increment);
        } else if (typeof data.quantity === 'number') {
          s.quantity = data.quantity;
        }
        if (data.minStock !== undefined) s.minStock = Number(data.minStock);
        if (!select) return s;
        const out: any = {};
        for (const key of Object.keys(select)) out[key] = (s as any)[key];
        return out;
      },
      create: async ({ data, select }: any) => {
        const created: StockRow = {
          id: newId(),
          productId: data.productId,
          variantId: data.variantId ?? null,
          branchId: data.branchId,
          quantity: Number(data.quantity ?? 0),
          minStock: Number(data.minStock ?? 5),
        };
        stocks.push(created);
        if (!select) return created;
        const out: any = {};
        for (const key of Object.keys(select)) out[key] = (created as any)[key];
        return out;
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        const created: MovementRow = {
          id: newId(),
          companyId: data.companyId,
          productId: data.productId,
          variantId: data.variantId ?? null,
          branchId: data.branchId,
          type: data.type,
          quantity: toNumber(data.quantity),
          unitCost: toNumber(data.unitCost),
          balanceAfter: toNumber(data.balanceAfter),
          costAfter: toNumber(data.costAfter),
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          date: data.date ?? new Date(),
          userId: data.userId,
          notes: data.notes ?? null,
        };
        movements.push(created);
        return created;
      },
      findMany: async ({ where }: any) => {
        return movements.filter((m) => {
          if (where?.productId && m.productId !== where.productId) return false;
          if (where?.companyId && m.companyId !== where.companyId) return false;
          return true;
        });
      },
    },
    _state: { products, variants, stocks, movements },
  };

  return tx;
}

export type MockTx = ReturnType<typeof makeMockTx>;
