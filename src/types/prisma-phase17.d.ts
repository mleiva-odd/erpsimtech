/**
 * Augmentación de tipos para el cliente Prisma con los modelos y campos
 * nuevos de Fase 17 (`CustomerCredit`, `CustomerCreditApplication`,
 * `Sale.dueDate`, `Customer.creditDaysDefault`, `Customer.maxOverdueDays`,
 * `Supplier.creditDaysDefault`, valor `OVERDUE` en `SaleStatus`).
 *
 * Igual que `prisma-phase14.d.ts` y `prisma-phase15.d.ts`: este shim solo
 * existe porque el sandbox no puede correr `prisma generate` (sin red al
 * CDN de binarios). Cuando el dueño corra `npm install && npx prisma generate`
 * en su Mac/CI, los tipos reales del cliente regenerado tienen precedencia
 * y este shim queda inocuo.
 *
 * Borrar este archivo en Fase 25 (cleanup) cuando se valide el pipeline.
 */

import '@prisma/client';

declare module '@prisma/client' {
  /** Se permite el valor 'OVERDUE' a nivel literal sin error. */
  type SaleStatus =
    | 'COMPLETED'
    | 'PENDING'
    | 'CANCELLED'
    | 'QUOTE'
    | 'OVERDUE';

  /** Status de un CustomerCredit (Fase 17). */
  type CustomerCreditStatus =
    | 'ACTIVE'
    | 'PARTIALLY_APPLIED'
    | 'FULLY_APPLIED'
    | 'CANCELLED';

  /** Razón de origen de un CustomerCredit (Fase 17). */
  type CustomerCreditReason =
    | 'ADVANCE_PAYMENT'
    | 'SALE_RETURN'
    | 'MANUAL_CREDIT';

  /** Delegates nuevos en PrismaClient. */
  interface PrismaClient {
    customerCredit: ARAPDelegate;
    customerCreditApplication: ARAPDelegate;
  }

  namespace Prisma {
    /**
     * Permitir que TransactionClient tenga los mismos delegates.
     * Sin esto, el código que usa `tx.customerCredit` falla.
     */
    interface TransactionClient {
      customerCredit: ARAPDelegate;
      customerCreditApplication: ARAPDelegate;
    }

    // Loosen filters/selects for Sale + Customer + SupplierPayable porque
    // tienen campos nuevos (dueDate, maxOverdueDays, etc.) que el cliente
    // Prisma generado pre-Fase 17 no conoce.
    interface SaleWhereInput {
      [key: string]: unknown;
    }
    interface SaleSelect {
      [key: string]: unknown;
    }
    interface SaleOrderByWithRelationInput {
      [key: string]: unknown;
    }
    interface SaleUpdateInput {
      [key: string]: unknown;
    }
    interface SaleUncheckedUpdateInput {
      [key: string]: unknown;
    }
    interface CustomerWhereInput {
      [key: string]: unknown;
    }
    interface CustomerSelect {
      [key: string]: unknown;
    }
    interface CustomerUpdateInput {
      [key: string]: unknown;
    }
    interface SupplierPayableWhereInput {
      [key: string]: unknown;
    }
    interface SupplierPayableSelect {
      [key: string]: unknown;
    }
    interface SupplierPayableUpdateManyMutationInput {
      [key: string]: unknown;
    }
  }
}

/** Delegate genérico — mismo patrón que prisma-phase14.d.ts. */
interface ARAPDelegate {
  findFirst(args?: unknown): Promise<unknown>;
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args?: unknown): Promise<unknown>;
  findUniqueOrThrow(args?: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
  upsert(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
  deleteMany(args?: unknown): Promise<unknown>;
  count(args?: unknown): Promise<number>;
  aggregate(args?: unknown): Promise<unknown>;
  groupBy(args?: unknown): Promise<unknown[]>;
}
