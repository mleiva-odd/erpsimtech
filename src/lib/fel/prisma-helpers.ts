/**
 * Helpers de cast para el módulo FEL (Fase 16).
 *
 * Los tipos del cliente Prisma generados antes de `npx prisma generate`
 * (sandbox) no incluyen las columnas/relaciones nuevas de Fase 16. Estos
 * helpers encapsulan el cast en un solo lugar para no contaminar los
 * handlers con `as` repetidos.
 *
 * Cuando el cliente se regenera con `prisma generate`, los tipos reales
 * son más estrictos pero compatibles — los handlers siguen funcionando.
 */

/** Forma esperada del Company para flujos FEL. */
export interface CompanyForFel {
  id?: string;
  name: string;
  nit: string | null;
  taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
}

/** Cast a `CompanyForFel`. */
export function asCompanyForFel(c: unknown): CompanyForFel | null {
  return c as CompanyForFel | null;
}

/** Forma esperada del Sale para flujos FEL. */
export interface SaleForFel {
  id: string;
  branchId: string;
  status: string;
  createdAt: Date;
  subtotal: unknown;
  tax: unknown;
  total: unknown;
  customerNit: string | null;
  customerName: string | null;
  taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    unitPrice: unknown;
    discount: unknown;
    subtotal: unknown;
    taxRate: unknown;
    tax: unknown;
    product: { id: string; sku: string; name: string; isTaxExempt: boolean };
  }>;
  taxDocument?: unknown;
}

export function asSaleForFel(s: unknown): SaleForFel | null {
  return s as SaleForFel | null;
}
