/**
 * Constantes de códigos del plan de cuentas (Fase 14).
 *
 * Estos códigos coinciden 1:1 con las cuentas hoja sembradas por
 * `seedChartOfAccounts` en `./seed.ts`. Cualquier call site que genere
 * un `JournalEntry` debe importar estas constantes en lugar de hardcodear
 * el código string — caso contrario, un typo o cambio futuro en la
 * codificación va a romper silenciosamente la integridad contable.
 *
 * No agregar entradas nuevas acá sin antes:
 *   1. Agregarla en `seedChartOfAccounts` (con su `type` y `parentId`).
 *   2. Confirmar que el código sigue el árbol jerárquico decimal.
 */
export const ACCOUNTS = {
  // ── Activos (1.x) ──────────────────────────────────────────────────
  CASH: '1.1.01',
  BANKS: '1.1.02',
  AR: '1.1.04', // Clientes (Cuentas por Cobrar)
  VAT_INPUT: '1.1.05', // IVA Crédito Fiscal
  INVENTORY: '1.2.01',
  PROPERTY_PLANT: '1.2.02', // Inmuebles/Equipo

  // ── Pasivos (2.x) ──────────────────────────────────────────────────
  AP: '2.1.01', // Proveedores (Cuentas por Pagar)
  VAT_OUTPUT: '2.1.02', // IVA Débito Fiscal
  ISR_PAYABLE: '2.1.03',
  IGSS_PAYABLE: '2.1.04',
  SALARIES_PAYABLE: '2.1.05',
  BONUS14_PROVISION: '2.1.06',
  AGUINALDO_PROVISION: '2.1.07',
  INDEMNIZACION_PROVISION: '2.1.08',

  // ── Patrimonio (3.x) ───────────────────────────────────────────────
  EQUITY: '3.1.01', // Capital Social
  RETAINED_EARNINGS: '3.2.01', // Utilidades Retenidas
  CURRENT_EARNINGS: '3.2.02', // Utilidad del Ejercicio

  // ── Ingresos (4.x) ─────────────────────────────────────────────────
  SALES: '4.1.01',
  SALES_RETURNS: '4.1.02', // Devoluciones sobre Ventas (contra-cuenta)
  FX_GAIN: '4.2.01', // Diferencia Cambiaria positiva

  // ── Egresos (5.x) ──────────────────────────────────────────────────
  COGS: '5.1.01', // Costo de Ventas
  SALARIES_EXPENSE: '5.2.01',
  IGSS_PATRONAL: '5.2.02',
  BONUS_INCENTIVE: '5.2.03',
  OPERATING_EXPENSES: '5.3.01',
  BANK_FEES: '5.3.02',
  FX_LOSS: '5.4.01', // Diferencia Cambiaria negativa
} as const;

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];
