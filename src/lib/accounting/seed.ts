import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Definición de cuentas del plan de cuentas estándar guatemalteco.
 *
 * Estructura jerárquica decimal:
 *   1     · Activo                  (no posting)
 *   1.1   · Activo Corriente        (no posting)
 *   1.1.01 · Caja                   (posting)
 *   ...
 *
 * Las cuentas padre (`isPosting=false`) no aceptan asientos directos —
 * solo agrupan en reportes. Las cuentas hoja (`isPosting=true`) son las
 * que el sistema toca al generar `JournalEntry` (ver `ACCOUNTS` en
 * `./accounts.ts`).
 */
type SeedAccount = {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  isPosting: boolean;
  parent?: string; // código del padre
};

const SEED_ACCOUNTS: SeedAccount[] = [
  // ── Activo (1.x) ───────────────────────────────────────────────────
  { code: '1', name: 'Activo', type: 'ASSET', isPosting: false },
  { code: '1.1', name: 'Activo Corriente', type: 'ASSET', isPosting: false, parent: '1' },
  { code: '1.1.01', name: 'Caja', type: 'ASSET', isPosting: true, parent: '1.1' },
  { code: '1.1.02', name: 'Bancos', type: 'ASSET', isPosting: true, parent: '1.1' },
  { code: '1.1.04', name: 'Clientes', type: 'ASSET', isPosting: true, parent: '1.1' },
  { code: '1.1.05', name: 'IVA Crédito Fiscal', type: 'ASSET', isPosting: true, parent: '1.1' },
  { code: '1.2', name: 'Activo No Corriente', type: 'ASSET', isPosting: false, parent: '1' },
  { code: '1.2.01', name: 'Inventario', type: 'ASSET', isPosting: true, parent: '1.2' },
  { code: '1.2.02', name: 'Inmuebles y Equipo', type: 'ASSET', isPosting: true, parent: '1.2' },

  // ── Pasivo (2.x) ───────────────────────────────────────────────────
  { code: '2', name: 'Pasivo', type: 'LIABILITY', isPosting: false },
  { code: '2.1', name: 'Pasivo Corriente', type: 'LIABILITY', isPosting: false, parent: '2' },
  { code: '2.1.01', name: 'Proveedores', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.02', name: 'IVA Débito Fiscal', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.03', name: 'ISR Retenido por Pagar', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.04', name: 'IGSS por Pagar', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.05', name: 'Sueldos por Pagar', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.06', name: 'Provisión Bono 14', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.07', name: 'Provisión Aguinaldo', type: 'LIABILITY', isPosting: true, parent: '2.1' },
  { code: '2.1.08', name: 'Provisión Indemnización', type: 'LIABILITY', isPosting: true, parent: '2.1' },

  // ── Patrimonio (3.x) ───────────────────────────────────────────────
  { code: '3', name: 'Patrimonio', type: 'EQUITY', isPosting: false },
  { code: '3.1', name: 'Capital', type: 'EQUITY', isPosting: false, parent: '3' },
  { code: '3.1.01', name: 'Capital Social', type: 'EQUITY', isPosting: true, parent: '3.1' },
  { code: '3.2', name: 'Resultados', type: 'EQUITY', isPosting: false, parent: '3' },
  { code: '3.2.01', name: 'Utilidades Retenidas', type: 'EQUITY', isPosting: true, parent: '3.2' },
  { code: '3.2.02', name: 'Utilidad del Ejercicio', type: 'EQUITY', isPosting: true, parent: '3.2' },

  // ── Ingresos (4.x) ─────────────────────────────────────────────────
  { code: '4', name: 'Ingresos', type: 'INCOME', isPosting: false },
  { code: '4.1', name: 'Ingresos Operativos', type: 'INCOME', isPosting: false, parent: '4' },
  { code: '4.1.01', name: 'Ventas', type: 'INCOME', isPosting: true, parent: '4.1' },
  { code: '4.1.02', name: 'Devoluciones sobre Ventas', type: 'INCOME', isPosting: true, parent: '4.1' },
  { code: '4.2', name: 'Otros Ingresos', type: 'INCOME', isPosting: false, parent: '4' },
  { code: '4.2.01', name: 'Diferencia Cambiaria (Ingreso)', type: 'INCOME', isPosting: true, parent: '4.2' },

  // ── Egresos (5.x) ──────────────────────────────────────────────────
  { code: '5', name: 'Egresos', type: 'EXPENSE', isPosting: false },
  { code: '5.1', name: 'Costo de Ventas', type: 'EXPENSE', isPosting: false, parent: '5' },
  { code: '5.1.01', name: 'Costo de Ventas', type: 'EXPENSE', isPosting: true, parent: '5.1' },
  { code: '5.2', name: 'Gastos de Personal', type: 'EXPENSE', isPosting: false, parent: '5' },
  { code: '5.2.01', name: 'Sueldos y Salarios', type: 'EXPENSE', isPosting: true, parent: '5.2' },
  { code: '5.2.02', name: 'IGSS Patronal (Gasto)', type: 'EXPENSE', isPosting: true, parent: '5.2' },
  { code: '5.2.03', name: 'Bonificación Incentivo', type: 'EXPENSE', isPosting: true, parent: '5.2' },
  { code: '5.3', name: 'Gastos Operativos', type: 'EXPENSE', isPosting: false, parent: '5' },
  { code: '5.3.01', name: 'Gastos Operativos', type: 'EXPENSE', isPosting: true, parent: '5.3' },
  { code: '5.3.02', name: 'Gastos Bancarios', type: 'EXPENSE', isPosting: true, parent: '5.3' },
  { code: '5.4', name: 'Otros Gastos', type: 'EXPENSE', isPosting: false, parent: '5' },
  { code: '5.4.01', name: 'Diferencia Cambiaria (Gasto)', type: 'EXPENSE', isPosting: true, parent: '5.4' },
];

/**
 * Lista de cuentas planas para tests / verificadores externos.
 */
export const CHART_OF_ACCOUNTS_SEED: ReadonlyArray<SeedAccount> = SEED_ACCOUNTS;

/**
 * Siembra el plan de cuentas estándar para una empresa.
 * Idempotente: si ya existe el código, no lo duplica.
 * Devuelve un Map<code, accountId> útil para callers que necesiten
 * resolver IDs inmediatamente.
 *
 * Debe llamarse:
 *   - En `prisma/seed.ts` para cada empresa demo.
 *   - En `POST /api/onboarding` cuando se crea una empresa nueva.
 *   - En `POST /api/admin/companies` (superadmin).
 */
export async function seedChartOfAccounts(
  tx: Tx,
  companyId: string,
): Promise<Map<string, string>> {
  const idsByCode = new Map<string, string>();

  // Primera pasada: creo padres antes que hijos. Como la lista está ordenada
  // por longitud creciente del código, los padres siempre aparecen antes.
  // De todas formas resolvemos parentId en una segunda pasada para no
  // depender del orden.
  for (const acct of SEED_ACCOUNTS) {
    const existing = await tx.chartOfAccount.findUnique({
      where: { companyId_code: { companyId, code: acct.code } },
      select: { id: true },
    });
    if (existing) {
      idsByCode.set(acct.code, existing.id);
      continue;
    }
    const created = await tx.chartOfAccount.create({
      data: {
        companyId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        isPosting: acct.isPosting,
      },
      select: { id: true },
    });
    idsByCode.set(acct.code, created.id);
  }

  // Segunda pasada: vincular parentId
  for (const acct of SEED_ACCOUNTS) {
    if (!acct.parent) continue;
    const id = idsByCode.get(acct.code);
    const parentId = idsByCode.get(acct.parent);
    if (!id || !parentId) continue;
    await tx.chartOfAccount.update({
      where: { id },
      data: { parentId },
    });
  }

  return idsByCode;
}

/**
 * Alias semántico: el plan original de Fase 14 lo nombra así, y la
 * función huérfana en `src/lib/accounting.ts` se llamaba
 * `initializeAccountingCategories`. Mantenemos el nombre nuevo en este
 * módulo y exponemos un alias para reemplazar la huérfana.
 */
export const initializeChartOfAccounts = seedChartOfAccounts;

/**
 * Crea el período contable mensual para `date`, si no existe.
 * Idempotente. Útil al onboarding y como fallback en `createJournalEntry`.
 */
export async function ensureAccountingPeriod(
  tx: Tx,
  companyId: string,
  date: Date,
): Promise<{ id: string; status: 'OPEN' | 'CLOSED' }> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const existing = await tx.accountingPeriod.findUnique({
    where: { companyId_year_month: { companyId, year, month } },
    select: { id: true, status: true },
  });
  if (existing) return existing as { id: string; status: 'OPEN' | 'CLOSED' };

  const created = await tx.accountingPeriod.create({
    data: { companyId, year, month, status: 'OPEN' },
    select: { id: true, status: true },
  });
  return created as { id: string; status: 'OPEN' | 'CLOSED' };
}
