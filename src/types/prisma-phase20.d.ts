/**
 * Augmentación de tipos para los modelos/enums nuevos de Fase 20 (ventas
 * enterprise: PriceList, StockReservation, Promotion, Coupon, Commission,
 * DeliveryNoteSequence + nuevos valores de SaleStatus).
 *
 * Igual que los shims previos: existe porque el sandbox no puede correr
 * `prisma generate`. Cuando el dueño regenere el cliente, los tipos reales
 * tienen precedencia y este shim queda inocuo.
 *
 * Borrable en Fase 25 (cleanup).
 */

import '@prisma/client';

declare module '@prisma/client' {
  /** Valores agregados al enum SaleStatus (Fase 20). */
  type SaleStatus =
    | 'COMPLETED'
    | 'PENDING'
    | 'CANCELLED'
    | 'QUOTE'
    | 'OVERDUE'
    | 'ORDER'
    | 'PARTIALLY_DELIVERED'
    | 'DELIVERED'
    | 'INVOICED';

  type PromotionType = 'BUY_N_GET_M' | 'PERCENTAGE_OFF' | 'FIXED_PRICE';
  type CouponType = 'FIXED_AMOUNT' | 'PERCENTAGE_OFF';
  type CommissionBasis = 'MARGIN' | 'SUBTOTAL';
  type CommissionStatus = 'ACCRUED' | 'PAID' | 'CANCELLED';

  interface PrismaClient {
    priceList: SalesDelegate;
    priceListItem: SalesDelegate;
    customerPriceList: SalesDelegate;
    stockReservation: SalesDelegate;
    promotion: SalesDelegate;
    coupon: SalesDelegate;
    couponRedemption: SalesDelegate;
    commissionRule: SalesDelegate;
    commission: SalesDelegate;
    deliveryNoteSequence: SalesDelegate;
  }

  namespace Prisma {
    interface TransactionClient {
      priceList: SalesDelegate;
      priceListItem: SalesDelegate;
      customerPriceList: SalesDelegate;
      stockReservation: SalesDelegate;
      promotion: SalesDelegate;
      coupon: SalesDelegate;
      couponRedemption: SalesDelegate;
      commissionRule: SalesDelegate;
      commission: SalesDelegate;
      deliveryNoteSequence: SalesDelegate;
    }

    // Loosen filters/selects/creates para campos nuevos en Sale, SaleItem,
    // Customer, Company, Product, ProductVariant, Branch, Employee, Category.
    interface SaleWhereInput {
      [key: string]: unknown;
    }
    interface SaleCreateInput {
      [key: string]: unknown;
    }
    interface SaleUncheckedCreateInput {
      [key: string]: unknown;
    }
    interface SaleUpdateInput {
      [key: string]: unknown;
    }
    interface SaleUncheckedUpdateInput {
      [key: string]: unknown;
    }
    interface SaleItemCreateInput {
      [key: string]: unknown;
    }
    interface SaleItemUncheckedCreateInput {
      [key: string]: unknown;
    }
    interface CustomerSelect {
      [key: string]: unknown;
    }
    interface CustomerInclude {
      [key: string]: unknown;
    }
    interface CompanyInclude {
      [key: string]: unknown;
    }
    interface CompanySelect {
      [key: string]: unknown;
    }
    interface ProductSelect {
      [key: string]: unknown;
    }
    interface ProductVariantSelect {
      [key: string]: unknown;
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SalesDelegate {
  findFirst(args?: any): Promise<any>;
  findMany(args?: any): Promise<any[]>;
  findUnique(args?: any): Promise<any>;
  findUniqueOrThrow(args?: any): Promise<any>;
  create(args: any): Promise<any>;
  createMany(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<any>;
  upsert(args: any): Promise<any>;
  delete(args: any): Promise<any>;
  deleteMany(args?: any): Promise<any>;
  count(args?: any): Promise<number>;
  aggregate(args?: any): Promise<any>;
  groupBy(args?: any): Promise<any[]>;
}
