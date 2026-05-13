/**
 * Augmentación de tipos para el cliente Prisma con los modelos y campos
 * nuevos de Fase 18 (planilla GT completa):
 *   - Nuevos enums: PayrollFrequency, Shift, PayrollType, EmployeeLoanStatus.
 *   - Nuevos modelos: EmployeeLoan, EmployeeBalance.
 *   - Columnas nuevas en Employee, Payroll, PayrollItem.
 *
 * Mismo patrón que `prisma-phase14.d.ts` / `prisma-phase17.d.ts`. Este shim
 * solo existe porque el sandbox no puede correr `prisma generate`. Cuando el
 * dueño regenere el cliente, los tipos reales tienen precedencia.
 *
 * Borrable en Fase 25 cleanup.
 */

import '@prisma/client';

declare module '@prisma/client' {
  type PayrollFrequency = 'MONTHLY' | 'BIWEEKLY';
  type Shift = 'DIURNA' | 'NOCTURNA' | 'MIXTA';
  type PayrollType =
    | 'REGULAR'
    | 'BONO14'
    | 'AGUINALDO'
    | 'INDEMNIZACION'
    | 'EXTRAORDINARIA';
  type EmployeeLoanStatus = 'ACTIVE' | 'PAID' | 'CANCELLED';

  interface PrismaClient {
    employeeLoan: PayrollDelegate;
    employeeBalance: PayrollDelegate;
  }

  namespace Prisma {
    interface TransactionClient {
      employeeLoan: PayrollDelegate;
      employeeBalance: PayrollDelegate;
    }

    interface EmployeeWhereInput {
      [key: string]: unknown;
    }
    interface EmployeeSelect {
      [key: string]: unknown;
    }
    interface EmployeeInclude {
      [key: string]: unknown;
    }
    interface EmployeeUpdateInput {
      [key: string]: unknown;
    }
    interface EmployeeUncheckedUpdateInput {
      [key: string]: unknown;
    }
    interface EmployeeCreateInput {
      [key: string]: unknown;
    }
    interface EmployeeUncheckedCreateInput {
      [key: string]: unknown;
    }

    interface PayrollWhereInput {
      [key: string]: unknown;
    }
    interface PayrollSelect {
      [key: string]: unknown;
    }
    interface PayrollInclude {
      [key: string]: unknown;
    }
    interface PayrollUpdateInput {
      [key: string]: unknown;
    }
    interface PayrollUncheckedUpdateInput {
      [key: string]: unknown;
    }
    interface PayrollCreateInput {
      [key: string]: unknown;
    }
    interface PayrollUncheckedCreateInput {
      [key: string]: unknown;
    }

    interface PayrollItemWhereInput {
      [key: string]: unknown;
    }
    interface PayrollItemSelect {
      [key: string]: unknown;
    }
    interface PayrollItemInclude {
      [key: string]: unknown;
    }
    interface PayrollItemUpdateInput {
      [key: string]: unknown;
    }
    interface PayrollItemUncheckedUpdateInput {
      [key: string]: unknown;
    }
    interface PayrollItemCreateInput {
      [key: string]: unknown;
    }
    interface PayrollItemUncheckedCreateInput {
      [key: string]: unknown;
    }
  }
}

/** Delegate genérico — mismo patrón que prisma-phase17.d.ts. */
interface PayrollDelegate {
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
