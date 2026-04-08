import { create } from 'zustand';

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
  clearCart: () => void;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discount: 0,
  customerId: null,
  customerName: null,

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
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (productId, variantId) => {
    set((state) => ({
      items: state.items.filter((i) => !(i.product.id === productId && i.product.variantId === variantId)),
    }));
  },

  updateQuantity: (productId, quantity, variantId) => {
    if (quantity <= 0) {
      get().removeItem(productId, variantId);
      return;
    }
    set((state) => ({
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

  setDiscount: (discount) => set({ discount: Math.min(100, Math.max(0, discount)) }),
  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  clearCart: () =>
    set({ items: [], discount: 0, customerId: null, customerName: null }),
}));
