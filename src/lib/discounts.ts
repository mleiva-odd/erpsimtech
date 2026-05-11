/**
 * Catálogo de descuentos, promociones y mecanismos de cierre.
 *
 * Diseñado para mercado guatemalteco price-sensitive: en vez de bajar
 * el precio público (erosiona valor percibido y dificulta subir después),
 * usamos PALANCAS LATERALES que mantienen el sticker price firme y dan
 * margen para negociar en el cierre.
 *
 * Cada palanca tiene un costo de oportunidad calculable. Ver
 * docs/business/pricing-tactics.md para la justificación completa.
 */

export type DiscountType =
  | 'percent_off' // X% sobre el precio base
  | 'fixed_off' // Q fijos sobre el precio base
  | 'first_n_months_off' // primeros N meses gratis o con %
  | 'setup_off' // descuento sobre setup
  | 'free_addon'; // addon regalado por X meses

export type DiscountTrigger =
  | 'annual_prepay' // automático al elegir pago anual
  | 'multi_year' // contrato 2 o 3 años
  | 'fast_close' // firma en N días desde demo
  | 'referral' // viene referido por cliente activo
  | 'migration' // viene migrando de competidor
  | 'beta_program' // beta cerrada
  | 'manual_code'; // cupón manual aplicado por sales

export interface Discount {
  id: string;
  name: string;
  description: string;
  type: DiscountType;
  trigger: DiscountTrigger;
  /** Valor del descuento. Para percent_off: 0-100. Para fixed_off: GTQ. */
  value: number;
  /** Para first_n_months_off: cuántos meses afecta. */
  months?: number;
  /** Aplicable en estos planes. Vacío = todos. */
  applicablePlans?: string[];
  /** Si es manual, el código que el cliente ingresa. */
  code?: string;
  /** Cuándo expira el descuento (ISO date) si tiene fecha. */
  expiresAt?: string;
  /** Cantidad máxima de redenciones. -1 = ilimitado. */
  maxRedemptions?: number;
  /** Es solo para clientes nuevos. */
  newCustomersOnly: boolean;
  /** Costo estimado para SIMTECH (para reporting). */
  estimatedCostNote: string;
}

export const DISCOUNTS: Record<string, Discount> = {
  // ──────── Automáticos ────────

  annual_prepay: {
    id: 'annual_prepay',
    name: 'Pago anual',
    description: 'Paga 10 meses, recibe 12. Aplica en todos los planes purchasables.',
    type: 'percent_off',
    trigger: 'annual_prepay',
    value: 16, // ≈ 2 meses gratis
    newCustomersOnly: false,
    estimatedCostNote: 'Costo: 2 meses de licencia regalados. Compensado por menor churn y mejor cashflow.',
  },

  // ──────── Compromisos largos ────────

  two_year_commit: {
    id: 'two_year_commit',
    name: 'Compromiso 2 años',
    description:
      'Firmá contrato de 24 meses pagado por adelantado y obtené 22% off vs precio mensual. Reembolso prorrateado si cancelás antes.',
    type: 'percent_off',
    trigger: 'multi_year',
    value: 22,
    newCustomersOnly: false,
    estimatedCostNote: 'Cost: ~3 meses de licencia regalados. Compensado por revenue garantizado 24 meses.',
  },

  three_year_commit: {
    id: 'three_year_commit',
    name: 'Compromiso 3 años',
    description:
      'Firmá 36 meses pagado por adelantado y obtené 28% off + setup tier inferior gratis (e.g. Setup Express gratis si firmás Pro a 3 años).',
    type: 'percent_off',
    trigger: 'multi_year',
    value: 28,
    newCustomersOnly: false,
    estimatedCostNote:
      'Cost: ~4 meses + 1 setup. Compensado por revenue garantizado 36 meses. Bueno para acelerar ARR temprano.',
  },

  // ──────── Cierre rápido ────────

  fast_close_7d: {
    id: 'fast_close_7d',
    name: 'Cierre en 7 días',
    description:
      'Si firmás dentro de 7 días desde la demo, recibís 25% de descuento en el setup.',
    type: 'setup_off',
    trigger: 'fast_close',
    value: 25,
    newCustomersOnly: true,
    estimatedCostNote: 'Cost: hasta Q7.500 sobre Enterprise. Acelera ciclo de venta y cashflow.',
  },

  first_month_half: {
    id: 'first_month_half',
    name: 'Primer mes al 50%',
    description: 'Pagás solo la mitad de la primera mensualidad. Ideal para reducir sticker shock.',
    type: 'first_n_months_off',
    trigger: 'fast_close',
    value: 50,
    months: 1,
    newCustomersOnly: true,
    estimatedCostNote: 'Cost: Q449 (Pro) o Q2.249 (Enterprise) por cliente.',
  },

  // ──────── Referidos ────────

  referral_giver: {
    id: 'referral_giver',
    name: 'Mes gratis por referido',
    description:
      'Cada cliente activo que te recomiende y firme un plan pago, vos ganás 1 mes gratis aplicado a tu siguiente facturación.',
    type: 'first_n_months_off',
    trigger: 'referral',
    value: 100,
    months: 1,
    newCustomersOnly: false,
    estimatedCostNote: 'Cost: 1 mes del plan del referente. ROI: ~3-5x si el referido se queda 12+ meses.',
  },

  referral_receiver: {
    id: 'referral_receiver',
    name: 'Setup -50% por venir referido',
    description:
      'Si te recomendó un cliente actual de SIMTECH, tu setup baja 50% (de Q4.500/Q12.500/Q30.000 a Q2.250/Q6.250/Q15.000).',
    type: 'setup_off',
    trigger: 'referral',
    value: 50,
    newCustomersOnly: true,
    estimatedCostNote:
      'Cost: 50% del setup. Combinado con el bono al referente, costo total ≈ 1 mes + 50% setup. ROI alto si LTV > 12 meses.',
  },

  // ──────── Migración desde competidor ────────

  migration_from_competitor: {
    id: 'migration_from_competitor',
    name: 'Migra desde tu sistema actual',
    description:
      'Migrá desde Bind, Alegra, SIAC, SDIG, Microsip o cualquier ERP/POS y obtené 3 meses al 50% + migración de datos básica gratis (productos + clientes).',
    type: 'first_n_months_off',
    trigger: 'migration',
    value: 50,
    months: 3,
    newCustomersOnly: true,
    estimatedCostNote:
      'Cost: ~Q3.000 (Pro × 3 al 50%) + ~3h trabajo de migración. ROI: capturas churn de competidores con mucho menor CAC.',
  },

  // ──────── Beta y casos de uso ────────

  beta_program: {
    id: 'beta_program',
    name: 'Beta paga cerrada',
    description:
      'Programa cerrado para 5 clientes invitados. Pro a Q999/mes durante 12 meses + setup gratis a cambio de testimonio escrito + uso real continuado.',
    type: 'fixed_off',
    trigger: 'beta_program',
    value: 1000, // Q1.000 off del precio Pro mensual (Q1.999 → Q999)
    months: 12,
    applicablePlans: ['comercial'],
    newCustomersOnly: true,
    maxRedemptions: 5,
    estimatedCostNote:
      'Cost: Q60.000 descuento + Q62.500 setup × 5 = Q122.500. Genera 5 testimonios reales y casos de uso para landing.',
  },

  // ──────── Cupones manuales (para sales) ────────

  manual_close_10: {
    id: 'manual_close_10',
    name: 'Cierre por sales (-10%)',
    description:
      'Descuento manual del 10% sobre la mensualidad para cerrar leads tibios. Aplicable solo por sales con autorización.',
    type: 'percent_off',
    trigger: 'manual_code',
    value: 10,
    code: 'CIERRE10',
    newCustomersOnly: true,
    estimatedCostNote: 'Cost: 10% del MRR. Usar solo cuando no haya otra palanca disponible.',
  },

  manual_close_15: {
    id: 'manual_close_15',
    name: 'Cierre por sales (-15%)',
    description:
      'Descuento manual del 15%. Solo para leads con plan anual + cuenta importante. Requiere autorización dual.',
    type: 'percent_off',
    trigger: 'manual_code',
    value: 15,
    code: 'CIERRE15',
    newCustomersOnly: true,
    estimatedCostNote: 'Cost: 15% del MRR. Solo cuentas estratégicas.',
  },
};

/**
 * Calcula el precio efectivo después de aplicar descuentos.
 * Importante: si hay varios descuentos del mismo tipo (e.g. dos percent_off),
 * NO se aplican en cascada — gana el más beneficioso para el cliente.
 *
 * Para multi-trigger (e.g. anual + referido), sí se permiten dos:
 *   - annual_prepay (16% off)
 *   - referral_receiver (50% off setup)
 * Esos son ejes distintos (mensualidad vs setup) y se acumulan.
 */
export interface PriceWithDiscounts {
  basePriceMonthly: number;
  basePriceAnnual: number;
  effectiveMonthly: number;
  effectiveAnnual: number;
  appliedDiscountIds: string[];
  setupDiscountPercent: number;
  notes: string[];
}

export function applyDiscounts(
  base: { monthly: number; annual: number },
  discountIds: string[],
): PriceWithDiscounts {
  let effectiveMonthly = base.monthly;
  let effectiveAnnual = base.annual;
  let setupDiscountPercent = 0;
  const notes: string[] = [];
  const applied: string[] = [];

  // Procesamos en orden de aplicación esperada
  for (const id of discountIds) {
    const d = DISCOUNTS[id];
    if (!d) {
      notes.push(`Descuento desconocido: ${id} (ignorado)`);
      continue;
    }
    applied.push(id);

    switch (d.type) {
      case 'percent_off':
        effectiveMonthly = Math.round(effectiveMonthly * (1 - d.value / 100));
        effectiveAnnual = Math.round(effectiveAnnual * (1 - d.value / 100));
        notes.push(`${d.name}: -${d.value}% sobre licencia.`);
        break;
      case 'fixed_off':
        effectiveMonthly = Math.max(0, effectiveMonthly - d.value);
        effectiveAnnual = Math.max(0, effectiveAnnual - d.value * 12);
        notes.push(`${d.name}: -Q${d.value.toLocaleString('es-GT')} sobre licencia.`);
        break;
      case 'setup_off':
        setupDiscountPercent = Math.max(setupDiscountPercent, d.value);
        notes.push(`${d.name}: -${d.value}% sobre setup.`);
        break;
      case 'first_n_months_off':
        notes.push(
          `${d.name}: ${d.months} ${d.months === 1 ? 'mes' : 'meses'} con ${d.value}% off al inicio.`,
        );
        break;
      case 'free_addon':
        notes.push(`${d.name}: addon regalado.`);
        break;
    }
  }

  return {
    basePriceMonthly: base.monthly,
    basePriceAnnual: base.annual,
    effectiveMonthly,
    effectiveAnnual,
    appliedDiscountIds: applied,
    setupDiscountPercent,
    notes,
  };
}

/** Garantía de devolución pública. */
export const SATISFACTION_GUARANTEE = {
  daysToFullRefund: 30,
  description:
    'Si en los primeros 30 días el sistema no cumple lo prometido durante la demo, devolvemos el 100% de la licencia y del setup pagado. Sin preguntas.',
  excludesSetupOver: 30000, // setup Enterprise queda fuera por riesgo de migración legacy
};
