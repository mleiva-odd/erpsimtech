/**
 * Tipos compartidos del motor de planilla GT (Fase 18).
 *
 * Estos enums duplican a los de `@prisma/client` para que los helpers
 * puros (sin DB) puedan tipar sus inputs sin importar Prisma. El cliente
 * Prisma exporta los mismos string-literals: ambos son intercambiables.
 */

export type PayrollFrequency = 'MONTHLY' | 'BIWEEKLY';
export type Shift = 'DIURNA' | 'NOCTURNA' | 'MIXTA';
export type PayrollType =
  | 'REGULAR'
  | 'BONO14'
  | 'AGUINALDO'
  | 'INDEMNIZACION'
  | 'EXTRAORDINARIA';
export type EmployeeLoanStatus = 'ACTIVE' | 'PAID' | 'CANCELLED';
