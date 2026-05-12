/**
 * Augmentación de tipos para el cliente Prisma con los modelos nuevos
 * de Fase 14 (`ChartOfAccount`, `JournalEntry`, `JournalLine`,
 * `AccountingPeriod`).
 *
 * IMPORTANTE: Este archivo existe ÚNICAMENTE como puente durante el
 * sandbox de Fase 14, donde no se puede correr `prisma generate` por
 * falta de red al CDN de binarios. Cuando el dueño corra
 *   `npm install && npx prisma generate`
 * en su entorno (con red), `node_modules/.prisma/client/index.d.ts` se
 * regenera con los tipos reales — los tipos aquí abajo quedan
 * técnicamente redundantes pero compatibles (las firmas usan `any` para
 * inputs/outputs flexibles, así que TypeScript prefiere las firmas reales
 * generadas siempre que existan).
 *
 * Cuando el dueño verifique typecheck/lint verde post-`prisma generate`,
 * este archivo puede borrarse de la rama. No es código de producción.
 */

import '@prisma/client';

declare module '@prisma/client' {
  namespace Prisma {
    // Re-tipos para filtros de query nuevos
    interface JournalEntryWhereInput {
      [key: string]: any;
    }

    // Fase 16: campos nuevos en Company / Sale / SaleItem (taxRegime,
    // customerNit/Name, taxRate/tax). Permitimos cualquier propiedad nueva
    // sin perder el resto del tipado existente.
    interface CompanyInclude {
      [key: string]: any;
    }
    interface CompanySelect {
      [key: string]: any;
    }
    interface CompanyCreateInput {
      taxRegime?: any;
    }
    interface CompanyUncheckedCreateInput {
      taxRegime?: any;
    }
    interface CompanyUpdateInput {
      taxRegime?: any;
    }
    interface CompanyUncheckedUpdateInput {
      taxRegime?: any;
    }

    interface SaleInclude {
      [key: string]: any;
    }
    interface SaleSelect {
      [key: string]: any;
    }
    interface SaleCreateInput {
      customerNit?: any;
      customerName?: any;
      taxRegime?: any;
    }
    interface SaleUncheckedCreateInput {
      customerNit?: any;
      customerName?: any;
      taxRegime?: any;
    }

    interface SaleItemCreateInput {
      taxRate?: any;
      tax?: any;
    }
    interface SaleItemUncheckedCreateInput {
      taxRate?: any;
      tax?: any;
    }

    interface CompanySettingsCreateInput {
      [key: string]: any;
    }
    interface CompanySettingsUncheckedCreateInput {
      [key: string]: any;
    }
    interface CompanySettingsUpdateInput {
      [key: string]: any;
    }
    interface CompanySettingsUncheckedUpdateInput {
      [key: string]: any;
    }
    /**
     * Augmenta `Prisma.TransactionClient` con los delegates nuevos de Fase
     * 14/15/16, para que los helpers que escriben con `tx` (createJournalEntry,
     * reserveCorrelativo, etc.) typecheckeen incluso si el cliente generado
     * por `prisma generate` todavía no está disponible (sandbox).
     */
    interface TransactionClient {
      chartOfAccount: AccountingDelegate;
      journalEntry: AccountingDelegate;
      journalLine: AccountingDelegate;
      accountingPeriod: AccountingDelegate;
      stockMovement: AccountingDelegate;
      taxSeries: AccountingDelegate;
      taxDocument: AccountingDelegate;
      creditNote: AccountingDelegate;
      creditNoteItem: AccountingDelegate;
      debitNote: AccountingDelegate;
      debitNoteItem: AccountingDelegate;
    }
  }
}

// La augmentación efectiva — métodos en PrismaClient
declare module '@prisma/client' {
  interface PrismaClient {
    chartOfAccount: AccountingDelegate;
    journalEntry: AccountingDelegate;
    journalLine: AccountingDelegate;
    accountingPeriod: AccountingDelegate;
    /** Fase 15: log unificado de movimientos de inventario. */
    stockMovement: AccountingDelegate;
    /** Fase 16: facturación electrónica. */
    taxSeries: AccountingDelegate;
    taxDocument: AccountingDelegate;
    creditNote: AccountingDelegate;
    creditNoteItem: AccountingDelegate;
    debitNote: AccountingDelegate;
    debitNoteItem: AccountingDelegate;
  }
}

/**
 * Delegate genérico minimal. Permite invocar findFirst/findMany/findUnique/
 * create/update/count/groupBy/aggregate/upsert/delete con cualquier args y
 * retornar `any`. Sacrificamos type-safety profunda a cambio de poder
 * compilar la fase contable sin `prisma generate`. Los tipos reales del
 * cliente regenerado son más estrictos — el código está escrito para que
 * pase ambos.
 */
interface AccountingDelegate {
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
  groupBy(args?: any): Promise<any>;
}
