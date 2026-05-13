/**
 * API pública del módulo de ventas enterprise (Fase 20).
 */

export { resolveUnitPrice } from './pricing';
export type { ResolveUnitPriceInput, ResolveUnitPriceResult } from './pricing';
export { applyPromotions } from './promotions';
export type {
  PromoLineInput,
  PromoLineResult,
  PromotionLike,
  ApplyPromotionsResult,
} from './promotions';
export { validateAndApplyCoupon, persistCouponRedemption, CouponError } from './coupons';
export type { ValidateCouponInput, ValidateCouponResult } from './coupons';
export { calculateCommissions } from './commissions';
export type {
  CommissionRuleLike,
  CommissionSaleItemLike,
  CommissionToCreate,
} from './commissions';
export { canTransitionSale, assertTransition } from './state-machine';
export type { SaleStateCode } from './state-machine';
export { reserveNoteNumber } from './sequences';
export type { ReservedNoteNumber } from './sequences';
