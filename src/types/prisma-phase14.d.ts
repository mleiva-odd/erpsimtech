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
  }
}

// La augmentación efectiva — métodos en PrismaClient
declare module '@prisma/client' {
  interface PrismaClient {
    chartOfAccount: AccountingDelegate;
    journalEntry: AccountingDelegate;
    journalLine: AccountingDelegate;
    accountingPeriod: AccountingDelegate;
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
