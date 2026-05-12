/**
 * Fase 17 · AR/AP · Cuentas por Cobrar / Cuentas por Pagar.
 *
 * Helpers:
 *   - aging.ts: cálculo de buckets aging (0-30, 31-60, 61-90, 90+).
 *   - overdue.ts: cron diario que marca documentos vencidos como OVERDUE.
 *   - credit.ts: CustomerCredit (anticipos + saldos a favor) + bloqueo
 *                de venta a crédito por mora.
 *
 * Consumido principalmente por:
 *   - `src/app/api/reports/accounting/aging-{receivables,payables}/route.ts`
 *   - `src/app/api/cron/mark-overdue/route.ts`
 *   - `src/app/api/sales/route.ts` (assertCustomerCanBuyOnCredit + applyCustomerCreditsToSale)
 *   - `src/app/api/sales/[id]/return/route.ts` y `pos/returns/route.ts`
 *     (createSaleReturnCredit cuando la venta era a crédito)
 */

export {
  computeBucket,
  daysOverdue,
  computeReceivablesAging,
  computePayablesAging,
} from './aging';
export type {
  AgingBuckets,
  CustomerAging,
  SupplierAging,
  BucketKey,
} from './aging';

export { markOverdueDocuments, notifyOverdueSales } from './overdue';

export {
  applyCustomerCreditsToSale,
  assertCustomerCanBuyOnCredit,
  createSaleReturnCredit,
  ARAPError,
} from './credit';
