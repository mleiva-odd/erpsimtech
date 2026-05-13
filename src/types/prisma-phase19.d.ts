/**
 * Augmentación de tipos para los modelos y enums nuevos de Fase 19
 * (Compras enterprise: PR/RFQ/PO/GRN/Invoice).
 *
 * Igual que los shims previos: solo existe porque el sandbox no puede correr
 * `prisma generate`. Cuando el dueño regenere el cliente, los tipos reales
 * tienen precedencia y este shim queda inocuo.
 *
 * Borrable en Fase 25 (cleanup).
 */

import '@prisma/client';

declare module '@prisma/client' {
  /** Valores agregados al enum PurchaseStatus. */
  type PurchaseStatus =
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'INVOICED'
    | 'COMPLETED'
    | 'CANCELLED';

  /** Status de una Purchase Request. */
  type PurchaseRequestStatus =
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'CONVERTED_TO_PO'
    | 'CANCELLED';

  /** Status de un RFQ. */
  type RFQStatus = 'OPEN' | 'AWARDED' | 'CANCELLED' | 'CLOSED';

  interface PrismaClient {
    purchaseRequest: PurchasingDelegate;
    purchaseRequestItem: PurchasingDelegate;
    /** Prisma genera `model RFQRequest` como `prisma.rFQRequest` */
    rFQRequest: PurchasingDelegate;
    rFQRequestItem: PurchasingDelegate;
    rFQQuote: PurchasingDelegate;
    rFQQuoteItem: PurchasingDelegate;
    goodsReceivedNote: PurchasingDelegate;
    goodsReceivedNoteItem: PurchasingDelegate;
    supplierInvoice: PurchasingDelegate;
    supplierCreditNote: PurchasingDelegate;
  }

  namespace Prisma {
    interface TransactionClient {
      purchaseRequest: PurchasingDelegate;
      purchaseRequestItem: PurchasingDelegate;
      rFQRequest: PurchasingDelegate;
      rFQRequestItem: PurchasingDelegate;
      rFQQuote: PurchasingDelegate;
      rFQQuoteItem: PurchasingDelegate;
      goodsReceivedNote: PurchasingDelegate;
      goodsReceivedNoteItem: PurchasingDelegate;
      supplierInvoice: PurchasingDelegate;
      supplierCreditNote: PurchasingDelegate;
    }

    // Loosen filters/selects para campos nuevos en Supplier, Company,
    // PurchaseOrder, PurchaseOrderItem.
    interface SupplierWhereInput {
      [key: string]: unknown;
    }
    interface SupplierSelect {
      [key: string]: unknown;
    }
    interface SupplierUpdateInput {
      [key: string]: unknown;
    }
    interface CompanyWhereInput {
      [key: string]: unknown;
    }
    interface CompanySelect {
      [key: string]: unknown;
    }
    interface PurchaseOrderWhereInput {
      [key: string]: unknown;
    }
    interface PurchaseOrderSelect {
      [key: string]: unknown;
    }
    interface PurchaseOrderUpdateInput {
      [key: string]: unknown;
    }
    interface PurchaseOrderItemSelect {
      [key: string]: unknown;
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Mismo patrón Fase 14: retornar `any` (no unknown) para que los call sites
// puedan acceder a propiedades sin cast adicional. Cuando el dueño corra
// `prisma generate`, los tipos reales del cliente Prisma tienen precedencia
// y son más estrictos.
interface PurchasingDelegate {
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
