/**
 * Catálogo de planes SaaS de SIMTECH ERP (v2 — alineado al mercado real GT).
 *
 * Decisión de precios y análisis competitivo:
 *   docs/business/pricing-strategy.md
 *
 * Cuando se conecte Stripe (Sprint 7), agregar `stripePriceId` por cada
 * precio (mensual y anual) y reemplazar las quotas hardcoded por lookups
 * de este catálogo en los handlers de creación de empresa, usuario,
 * sucursal, venta y FEL.
 *
 * Modelo comercial: el cliente paga TRES cosas separadas:
 *   1. Licencia recurrente (mensual o anual) — el SaaS.
 *   2. Implementación (one-time) — setup, capacitación, importación.
 *   3. FEL (opcional, por uso) — facturación electrónica certificada.
 *
 * NO empaquetamos FEL en el plan a precio fijo porque los certificadores
 * (Infile/Digifact) cobran por volumen y eso vuelve la economía del plan
 * imprevisible. Cliente elige una de tres opciones (ver FEL_OPTIONS).
 *
 * Moneda: GTQ. Para LatAm fuera GT, mostrar en USD con conversión 1 USD ≈ 7.7 GTQ.
 */

export type PlanId = 'trial' | 'lite' | 'starter' | 'professional' | 'enterprise';

export type BillingCycle = 'monthly' | 'annual';

export interface PlanQuotas {
  /** Sucursales máximas. */
  branches: number;
  /** Usuarios totales (excluye SUPER_ADMIN). */
  users: number;
  /** Productos en catálogo. -1 = ilimitado. */
  products: number;
  /** Ventas registrables por mes calendario. -1 = ilimitado. */
  salesPerMonth: number;
  /** Almacenamiento de imágenes en MB. */
  storageMb: number;
  /** Razones sociales / multi-empresa permitidas. */
  legalEntities: number;
  /** Acceso a API read-only. */
  apiAccess: boolean;
  /** Soporte por canal. */
  support: 'community' | 'email' | 'whatsapp_business_hours' | 'whatsapp_priority' | '24_7';
}

export interface PlanPricing {
  /** Precio mensual en GTQ. */
  monthly: number;
  /** Precio anual en GTQ (paga 10 meses, recibe 12). */
  annual: number;
  /** Stripe price IDs. Vacíos hasta conectar Stripe. */
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  /** Si true, lo destacamos como "más popular" en la página de precios. */
  highlight: boolean;
  /** Si true, se puede comprar (Trial es gratis, no "comprable"). */
  purchasable: boolean;
  pricing: PlanPricing;
  quotas: PlanQuotas;
  /**
   * Tier de implementación recomendado para este plan. El cliente puede
   * pedir un tier mayor si quiere más acompañamiento.
   */
  recommendedSetupTier: SetupTierId;
}

export type SetupTierId = 'express' | 'pro' | 'enterprise';

export interface SetupTier {
  id: SetupTierId;
  name: string;
  /** Precio fijo en GTQ. Para enterprise, es el piso (cotización a medida). */
  priceGtq: number;
  /** true para enterprise: el precio es a partir de, no fijo. */
  startingFrom?: boolean;
  /** Horas estimadas de trabajo. */
  hoursEstimated: number;
  description: string;
  includes: string[];
}

export const SETUP_TIERS: Record<SetupTierId, SetupTier> = {
  express: {
    id: 'express',
    name: 'Setup Express',
    priceGtq: 4500,
    hoursEstimated: 5,
    description:
      'Onboarding para comercio chico que arranca con el ERP completo (incluye contabilidad y RRHH básicos, no solo POS).',
    includes: [
      '3 horas de capacitación remota',
      'Importación de productos, clientes y proveedores vía CSV',
      'Configuración fiscal (NIT, régimen, dirección) y FEL',
      'Setup de sucursal principal y primera cuenta bancaria',
      'Seguimiento por WhatsApp primera semana',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Setup Pro',
    priceGtq: 12500,
    hoursEstimated: 15,
    description:
      'Onboarding completo para PYME con multi-sucursal y contabilidad operativa real. Recomendado para Professional.',
    includes: [
      '8 horas de capacitación (presencial GT capital o remoto extendido)',
      'Importación legacy completa (productos, clientes, proveedores, saldos)',
      'Configuración FEL gestionada o BYO',
      'Setup multi-sucursal con permisos por usuario',
      'Acompañamiento del primer cierre de caja en vivo',
      'Acompañamiento del primer cierre contable mensual',
      '1 mes de soporte premium gratis (WhatsApp 8-20h)',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Setup Enterprise',
    priceGtq: 30000,
    startingFrom: true,
    hoursEstimated: 35,
    description:
      'Plan a medida con migración de datos legacy, integraciones externas y acompañamiento prolongado. Cotización personalizada según complejidad.',
    includes: [
      'Plan de migración personalizado',
      'Migración de datos desde sistema legacy (productos, clientes, saldos, histórico de ventas)',
      'Integraciones con sistemas externos (e-commerce, contabilidad externa, banca electrónica)',
      'Capacitación a múltiples usuarios y sucursales en cascada',
      'Acompañamiento del primer mes operativo completo',
      'Documentación operativa interna a medida',
      'Línea directa con el implementador durante onboarding',
    ],
  },
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial',
    name: 'Prueba gratis',
    description:
      '30 días con todas las funciones de Professional. Sin tarjeta. Al vencer queda en modo lectura por 30 días más.',
    highlight: false,
    purchasable: false,
    pricing: { monthly: 0, annual: 0 },
    quotas: {
      branches: 2,
      users: 5,
      products: 500,
      salesPerMonth: 1000,
      storageMb: 200,
      legalEntities: 1,
      apiAccess: false,
      support: 'email',
    },
    recommendedSetupTier: 'express',
  },

  lite: {
    id: 'lite',
    name: 'Lite',
    description:
      'Punto de entrada para quien hoy compraría POS-only y compite por precio. POS + inventario + ventas + reportes básicos. SIN tesorería multi-banco, SIN contabilidad operativa, SIN RRHH/planilla — esos están en Starter+. Migración a Starter sin penalidad cuando lo necesite.',
    highlight: false,
    purchasable: true,
    pricing: { monthly: 599, annual: 5990 },
    quotas: {
      branches: 1,
      users: 3,
      products: 1500,
      salesPerMonth: 2000,
      storageMb: 500,
      legalEntities: 1,
      apiAccess: false,
      support: 'email',
    },
    recommendedSetupTier: 'express',
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    description:
      'ERP completo para PYME chica. POS + inventario + tesorería + contabilidad + RRHH básico. NO es solo POS — incluye toda la operación administrativa de un comercio único.',
    highlight: false,
    purchasable: true,
    pricing: { monthly: 899, annual: 8990 },
    quotas: {
      branches: 1,
      users: 5,
      products: 3000,
      salesPerMonth: 5000,
      storageMb: 1024,
      legalEntities: 1,
      apiAccess: false,
      support: 'email',
    },
    recommendedSetupTier: 'express',
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    description:
      'ERP completo para PYME establecida con varias sucursales. Multi-local, tesorería multi-banco, planilla GT-compliant (ISR/IGSS/Bono14/Aguinaldo), reportes contables, soporte WhatsApp en horario GT. Comparable a Bind ERP Pro a precio menor.',
    highlight: true,
    purchasable: true,
    pricing: { monthly: 1999, annual: 19990 },
    quotas: {
      branches: 5,
      users: 20,
      products: 15000,
      salesPerMonth: 30000,
      storageMb: 5120,
      legalEntities: 1,
      apiAccess: false,
      support: 'whatsapp_business_hours',
    },
    recommendedSetupTier: 'pro',
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description:
      'ERP para cadena con alto volumen y multi-empresa. Hasta 5 razones sociales, 60 usuarios, 20 sucursales, FEL incluida (1.000/mes), API, soporte prioritario, onboarding incluido, SLA 99.5%, account manager primer año. Comparable a SAP Business One Cloud a un cuarto del precio.',
    highlight: false,
    purchasable: true,
    pricing: { monthly: 4499, annual: 44990 },
    quotas: {
      branches: 20,
      users: 60,
      products: -1, // ilimitado
      salesPerMonth: 200000,
      storageMb: 25600,
      legalEntities: 5,
      apiAccess: true,
      support: 'whatsapp_priority',
    },
    recommendedSetupTier: 'enterprise',
  },
};

/**
 * Modelos de cobro de FEL. El cliente elige uno al hacer onboarding.
 */
export type FelModelId = 'byo' | 'managed' | 'enterprise_included';

export interface FelModel {
  id: FelModelId;
  name: string;
  description: string;
  /** Cuota mensual base que cobra SIMTECH (margen sobre certificador). */
  monthlyBaseGtq: number;
  /** Costo por factura emitida (margen). Si bracketed por volumen, ver `tieredPricing`. */
  perInvoiceGtq?: number;
  tieredPricing?: Array<{ upToInvoices: number; perInvoiceGtq: number }>;
  /** Para qué planes está disponible. */
  availableInPlans: PlanId[];
}

export const FEL_OPTIONS: Record<FelModelId, FelModel> = {
  byo: {
    id: 'byo',
    name: 'FEL por tu cuenta (Bring Your Own)',
    description:
      'Vos contratás Infile o Digifact directo. SIMTECH integra con tus credenciales API. SIMTECH no cobra nada por FEL.',
    monthlyBaseGtq: 0,
    availableInPlans: ['trial', 'lite', 'starter', 'professional', 'enterprise'],
  },
  managed: {
    id: 'managed',
    name: 'FEL gestionada por SIMTECH',
    description:
      'SIMTECH es el intermediario con el certificador. Cuota base mensual + tarifa por factura emitida. Útil para clientes que no quieren lidiar con dos vendors.',
    monthlyBaseGtq: 199,
    tieredPricing: [
      { upToInvoices: 100, perInvoiceGtq: 1.49 },
      { upToInvoices: 500, perInvoiceGtq: 1.19 },
      { upToInvoices: 2000, perInvoiceGtq: 0.89 },
      { upToInvoices: -1, perInvoiceGtq: 0.69 }, // unlimited tier
    ],
    availableInPlans: ['lite', 'starter', 'professional', 'enterprise'],
  },
  enterprise_included: {
    id: 'enterprise_included',
    name: 'FEL incluida (solo Enterprise)',
    description:
      '1.000 facturas/mes incluidas en el plan Enterprise. Excedente a Q0.79 c/u. Sin cuota base adicional.',
    monthlyBaseGtq: 0,
    perInvoiceGtq: 0.79,
    availableInPlans: ['enterprise'],
  },
};

/**
 * Add-ons que se compran encima de cualquier plan compatible.
 */
export interface AddOn {
  id: string;
  name: string;
  description: string;
  /** Precio mensual recurrente en GTQ. -1 si es one-time. */
  monthlyPriceGtq: number;
  /** Precio único (one-time) en GTQ. */
  oneTimePriceGtq?: number;
  /** Hourly rate si aplica (para capacitación adicional). */
  hourlyRateGtq?: number;
  stripePriceId?: string;
  availableInPlans: PlanId[];
}

export const ADDONS: Record<string, AddOn> = {
  extra_branch: {
    id: 'extra_branch',
    name: 'Sucursal adicional',
    description: 'Cada sucursal extra sobre el límite del plan.',
    monthlyPriceGtq: 299,
    availableInPlans: ['professional', 'enterprise'],
  },
  extra_user: {
    id: 'extra_user',
    name: 'Usuario adicional',
    description: 'Cada usuario extra sobre el límite del plan.',
    monthlyPriceGtq: 79,
    availableInPlans: ['professional', 'enterprise'],
  },
  extra_legal_entity: {
    id: 'extra_legal_entity',
    name: 'Razón social adicional',
    description: 'Cada razón social extra sobre el límite. Solo Enterprise (multi-empresa).',
    monthlyPriceGtq: 499,
    availableInPlans: ['enterprise'],
  },
  support_24_7: {
    id: 'support_24_7',
    name: 'Soporte 24/7',
    description:
      'Línea de soporte 24/7 para giros que operan fuera de horario laboral (turismo, hospitality, delivery).',
    monthlyPriceGtq: 899,
    availableInPlans: ['enterprise'],
  },
  hourly_backup: {
    id: 'hourly_backup',
    name: 'Backup horario',
    description:
      'Backup cada hora con retención de 30 días y restore on-demand. Para clientes con alto volumen o compliance estricto.',
    monthlyPriceGtq: 399,
    availableInPlans: ['professional', 'enterprise'],
  },
  custom_report: {
    id: 'custom_report',
    name: 'Reporte contable a medida',
    description: 'Diseño y desarrollo de un reporte específico para el negocio del cliente.',
    monthlyPriceGtq: -1,
    oneTimePriceGtq: 2500,
    availableInPlans: ['professional', 'enterprise'],
  },
  extra_training: {
    id: 'extra_training',
    name: 'Capacitación adicional',
    description: 'Horas adicionales de capacitación después del setup inicial.',
    monthlyPriceGtq: -1,
    hourlyRateGtq: 700,
    availableInPlans: ['lite', 'starter', 'professional', 'enterprise'],
  },
  on_site_training: {
    id: 'on_site_training',
    name: 'Capacitación in situ fuera de GT capital',
    description:
      'Capacitación presencial fuera del área metropolitana de Guatemala. Tarifa diaria + viáticos.',
    monthlyPriceGtq: -1,
    oneTimePriceGtq: 1500, // por día, sin viáticos
    availableInPlans: ['professional', 'enterprise'],
  },
  api_integration: {
    id: 'api_integration',
    name: 'Integración API custom',
    description: 'Integración a medida con sistemas legacy del cliente. Cotización personalizada.',
    monthlyPriceGtq: -1,
    oneTimePriceGtq: 8000, // piso, cotización a medida
    availableInPlans: ['enterprise'],
  },
};

// ──────────────────── Helpers ────────────────────

/** Format GTQ amount como Q1.234. */
export function formatGtq(amount: number): string {
  return `Q${amount.toLocaleString('es-GT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Calcula el ahorro al pagar anual vs mensual del mismo plan. */
export function annualSavingsPercent(plan: Plan): number {
  if (!plan.pricing.monthly || !plan.pricing.annual) return 0;
  const monthlyTotal = plan.pricing.monthly * 12;
  return Math.round(((monthlyTotal - plan.pricing.annual) / monthlyTotal) * 100);
}

/** Devuelve los planes purchasables ordenados por precio mensual ascendente. */
export function getPurchasablePlans(): Plan[] {
  return Object.values(PLANS)
    .filter((p) => p.purchasable)
    .sort((a, b) => a.pricing.monthly - b.pricing.monthly);
}

/**
 * Calcula el costo de FEL gestionada para un volumen mensual dado.
 * Útil para mostrar al cliente una estimación clara antes de firmar.
 */
export function calculateManagedFelCost(invoicesPerMonth: number): {
  baseGtq: number;
  perInvoiceGtq: number;
  totalInvoiceCostGtq: number;
  totalMonthlyGtq: number;
} {
  const model = FEL_OPTIONS.managed;
  const tier =
    model.tieredPricing?.find(
      (t) => t.upToInvoices === -1 || invoicesPerMonth <= t.upToInvoices,
    ) ?? model.tieredPricing?.[model.tieredPricing.length - 1];

  const perInvoice = tier?.perInvoiceGtq ?? 1.49;
  const totalInvoiceCost = invoicesPerMonth * perInvoice;
  return {
    baseGtq: model.monthlyBaseGtq,
    perInvoiceGtq: perInvoice,
    totalInvoiceCostGtq: totalInvoiceCost,
    totalMonthlyGtq: model.monthlyBaseGtq + totalInvoiceCost,
  };
}

export interface QuotaCheckResult {
  ok: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}

/**
 * Verifica si una empresa con plan dado puede crear N cosa más.
 * Devuelve `{ ok: true }` o `{ ok: false, reason }` para que el handler
 * decida si bloquear con 403 o mostrar upsell al usuario.
 */
export function checkQuota(
  planId: PlanId,
  resource: keyof PlanQuotas,
  current: number,
): QuotaCheckResult {
  const plan = PLANS[planId];
  if (!plan) {
    return { ok: false, reason: `Plan desconocido: ${planId}` };
  }
  const limit = plan.quotas[resource];

  // Boolean (apiAccess): no aplica check numérico.
  if (typeof limit === 'boolean') {
    return {
      ok: limit,
      reason: limit ? undefined : `Feature no disponible en plan ${plan.name}`,
    };
  }

  // String (support): no aplica check numérico.
  if (typeof limit === 'string') {
    return { ok: true };
  }

  // -1 = ilimitado.
  if (limit === -1) {
    return { ok: true, current, limit };
  }

  if (current >= limit) {
    return {
      ok: false,
      reason: `Alcanzaste el límite del plan ${plan.name}: ${limit} ${resource}.`,
      current,
      limit,
    };
  }

  return { ok: true, current, limit };
}
