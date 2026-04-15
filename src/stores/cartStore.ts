import { create } from 'zustand';

function createCheckoutRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

export interface CartProduct {
  id: string;
  variantId?: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
}

export interface CartItem {
  product: CartProduct;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface CartStore {
  items: CartItem[];
  discount: number;
  customerId: string | null;
  customerName: string | null;
  checkoutRequestId: string | null;

  // Computed getters
  subtotal: () => number;
  totalWithDiscount: () => number;
  itemCount: () => number;

  // Actions
  addItem: (product: CartProduct) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  setDiscount: (discount: number) => void;
  setCustomer: (id: string | null, name: string | null) => void;
  ensureCheckoutRequestId: () => string;
  resetCheckoutRequestId: () => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discount: 0,
  customerId: null,
  customerName: null,
  checkoutRequestId: null,

  subtotal: () => {
    return get().items.reduce((acc, item) => acc + item.subtotal, 0);
  },

  totalWithDiscount: () => {
    const subtotal = get().subtotal();
    const discount = get().discount;
    return subtotal - (subtotal * discount) / 100;
  },

  itemCount: () => {
    return get().items.reduce((acc, item) => acc + item.quantity, 0);
  },

  addItem: (product) => {
    set((state) => {
      const existing = state.items.find(
        (i) => i.product.id === product.id && i.product.variantId === product.variantId
      );

      if (existing) {
        if (existing.quantity >= product.stock) return state;

        return {
          checkoutRequestId: null,
          items: state.items.map((i) =>
            i.product.id === product.id && i.product.variantId === product.variantId
              ? {
                  ...i,
                  quantity: i.quantity + 1,
                  subtotal: (i.quantity + 1) * i.unitPrice,
                }
              : i
          ),
        };
      }

      const newItem: CartItem = {
        product,
        quantity: 1,
        unitPrice: product.price,
        subtotal: product.price,
      };
      return { items: [...state.items, newItem], checkoutRequestId: null };
    });
  },

  removeItem: (productId, variantId) => {
    set((state) => ({
      items: state.items.filter((i) => !(i.product.id === productId && i.product.variantId === variantId)),
      checkoutRequestId: null,
    }));
  },

  updateQuantity: (productId, quantity, variantId) => {
    if (quantity <= 0) {
      get().removeItem(productId, variantId);
      return;
    }
    set((state) => ({
      checkoutRequestId: null,
      items: state.items.map((i) =>
        (i.product.id === productId && i.product.variantId === variantId)
          ? {
              ...i,
              quantity,
              subtotal: quantity * i.unitPrice,
            }
          : i
      ),
    }));
  },

  setDiscount: (discount) => set({ discount: Math.min(100, Math.max(0, discount)), checkoutRequestId: null }),
  setCustomer: (id, name) => set({ customerId: id, customerName: name, checkoutRequestId: null }),
  ensureCheckoutRequestId: () => {
    const existing = get().checkoutRequestId;
    if (existing) return existing;

    const next = createCheckoutRequestId();
    set({ checkoutRequestId: next });
    return next;
  },
  resetCheckoutRequestId: () => set({ checkoutRequestId: null }),

  clearCart: () =>
    set({ items: [], discount: 0, customerId: null, customerName: null, checkoutRequestId: null }),
}));
