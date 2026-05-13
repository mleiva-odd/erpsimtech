/**
 * Motor de promociones (Fase 20).
 *
 * Soporta tres tipos:
 *   - BUY_N_GET_M  (compra N lleva N+M): descuenta el precio de M unidades.
 *   - PERCENTAGE_OFF: descuento porcentual (discountRate 0..1) a líneas elegibles.
 *   - FIXED_PRICE: setea el precio unitario de las líneas elegibles a `fixedPrice`.
 *
 * Reglas:
 *   - `applicableProductIds` vacío = aplica a todas las líneas. Si tiene IDs,
 *     solo aplica a esas líneas.
 *   - `minPurchase` se evalúa contra el subtotal bruto pre-promo.
 *   - Una promoción se aplica solo si está activa y dentro del rango temporal.
 *
 * El helper recibe items con su precio resuelto y devuelve items ajustados
 * con `lineDiscount` actualizado (el descuento total acumulado por línea).
 * El caller decide si lo persiste como `discount`/`discountRate` o lo
 * usa para recálculo.
 *
 * Si dos promociones coinciden, se aplican secuencialmente en el orden
 * recibido. Si esto es indeseable el caller debe ordenar por prioridad.
 */

export interface PromoLineInput {
  productId: string;
  variantId?: string | null;
  unitPrice: number;
  quantity: number;
  /** Descuento ya acumulado en la línea (GTQ). */
  lineDiscount: number;
}

export interface PromoLineResult extends PromoLineInput {
  /** Lista de IDs de promo aplicadas a la línea (debug). */
  appliedPromotionIds: string[];
}

export interface PromotionLike {
  id: string;
  type: 'BUY_N_GET_M' | 'PERCENTAGE_OFF' | 'FIXED_PRICE';
  minPurchase: unknown; // Decimal | null
  applicableProductIds: string[];
  quantityRequired: number | null;
  quantityFree: number | null;
  discountRate: unknown; // Decimal | null
  fixedPrice: unknown; // Decimal | null
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}

export interface ApplyPromotionsResult {
  items: PromoLineResult[];
  /** Suma total de descuento promocional adicional (GTQ). */
  totalPromoDiscount: number;
  appliedPromotionIds: string[];
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  if (typeof v === 'object' && 'toString' in (v as object)) {
    const s = (v as { toString: () => string }).toString();
    return Number(s) || 0;
  }
  return 0;
}

function isApplicable(promo: PromotionLike, productId: string): boolean {
  if (!promo.applicableProductIds || promo.applicableProductIds.length === 0) return true;
  return promo.applicableProductIds.includes(productId);
}

function isWithinWindow(promo: PromotionLike, now: Date): boolean {
  if (!promo.active) return false;
  return promo.startsAt <= now && promo.endsAt >= now;
}

export function applyPromotions(
  items: PromoLineInput[],
  promotions: PromotionLike[],
  options: { now?: Date } = {},
): ApplyPromotionsResult {
  const now = options.now ?? new Date();
  const out: PromoLineResult[] = items.map((it) => ({ ...it, appliedPromotionIds: [] }));
  const appliedIds: string[] = [];
  let totalPromoDiscount = 0;

  const grossSubtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

  for (const promo of promotions) {
    if (!isWithinWindow(promo, now)) continue;
    const minP = num(promo.minPurchase);
    if (minP > 0 && grossSubtotal < minP) continue;

    if (promo.type === 'BUY_N_GET_M') {
      const N = promo.quantityRequired ?? 0;
      const M = promo.quantityFree ?? 0;
      if (N <= 0 || M <= 0) continue;
      for (const line of out) {
        if (!isApplicable(promo, line.productId)) continue;
        const groups = Math.floor(line.quantity / (N + M));
        if (groups <= 0) continue;
        const freeUnits = groups * M;
        const lineExtraDiscount = freeUnits * line.unitPrice;
        line.lineDiscount += lineExtraDiscount;
        line.appliedPromotionIds.push(promo.id);
        totalPromoDiscount += lineExtraDiscount;
      }
      appliedIds.push(promo.id);
    } else if (promo.type === 'PERCENTAGE_OFF') {
      const rate = num(promo.discountRate);
      if (rate <= 0) continue;
      for (const line of out) {
        if (!isApplicable(promo, line.productId)) continue;
        const lineGross = line.unitPrice * line.quantity;
        const remaining = lineGross - line.lineDiscount;
        const extra = Math.max(0, remaining * rate);
        line.lineDiscount += extra;
        line.appliedPromotionIds.push(promo.id);
        totalPromoDiscount += extra;
      }
      appliedIds.push(promo.id);
    } else if (promo.type === 'FIXED_PRICE') {
      const fp = num(promo.fixedPrice);
      if (fp <= 0) continue;
      for (const line of out) {
        if (!isApplicable(promo, line.productId)) continue;
        if (fp >= line.unitPrice) continue; // no descuento si el precio fijo es igual/mayor
        const lineGross = line.unitPrice * line.quantity;
        const targetSubtotal = fp * line.quantity;
        const remainingAfter = lineGross - line.lineDiscount;
        const desiredDiscount = Math.max(0, remainingAfter - targetSubtotal);
        if (desiredDiscount <= 0) continue;
        line.lineDiscount += desiredDiscount;
        line.appliedPromotionIds.push(promo.id);
        totalPromoDiscount += desiredDiscount;
      }
      appliedIds.push(promo.id);
    }
  }

  return { items: out, totalPromoDiscount: round2(totalPromoDiscount), appliedPromotionIds: appliedIds };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
