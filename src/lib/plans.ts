/**
 * Catálogo de planes SaaS de SIMTECH ERP (v4 — Tecpán/Chimaltenango focus).
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
 *   2. Implementación (one-time) — TBD según costo del certificador FEL.
 *   3. FEL — cuota mensual incluida en el plan, excedente cobrable.
 *
 * Founder pricing: los primeros N clientes pagan precio reducido (founder).
 * Después del cap, los nuevos clientes pagan precio regular. Los founders
 * mantienen su precio mientras estén activos (grandfathering).
 *
 * Mercado objetivo: PYMEs pequeñas en Tecpán y región Chimaltenango.
 * Comerciantes con 1-3 empleados, 1 sucursal, ventas Q15K-Q150K/mes.
 */

export type PlanId = 'trial' | 'negocio' | 'comercial' | 'enterprise';

export type BillingCycle = 'monthly' | 'annual';

export interface PlanQuotas {
  branches: number;
  users: number;
  /** Productos en catálogo. -1 = ilimitado. */
  products: number;
  /** Ventas registrables por mes calendario. -1 = ilimitado. */
  salesPerMonth: number;
  storageMb: number;
  legalEntities: number;
  apiAccess: boolean;
  support: 'community' | 'email' | 'whatsapp_business_hours' | 'whatsapp_priority' | '24_7';
  /**
   * Empleados máximos en módulo de planilla. -1 = ilimitado.
   * En Negocio se mantiene activo pero limitado para que el cliente
   * pueda formalizar al crecer sin migrar plan.
   */
  payrollEmployees: number;
}

export interface PlanPricing {
  /** Precio mensual founder en GTQ (primeros N clientes). */
  founderMonthly: number;
  /** Precio anual founder en GTQ (paga 10 meses, recibe 12 — 16% off). */
  founderAnnual: number;
  /** Precio mensual regular en GTQ (después del cap de founders). */
  regularMonthly: number;
  /** Precio anual regular en GTQ. */
  regularAnnual: number;
  /** Stripe price IDs. Vacíos hasta conectar Stripe. */
  stripePriceIdFounderMonthly?: string;
  stripePriceIdFounderAnnual?: string;
  stripePriceIdRegularMonthly?: string;
  stripePriceIdRegularAnnual?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  highlight: boolean;
  purchasable: boolean;
  /**
   * Si true, el plan no tiene precio público. La UI muestra "Solicitar
   * cotización" en vez de número. Para cuentas que se salen del estándar
   * (3+ sucursales, 10+ usuarios, requerimientos custom).
   */
  requiresQuote: boolean;
  pricing: PlanPricing | null; // null cuando requiresQuote=true
  quotas: PlanQuotas;
  /** Tier de implementación recomendado. */
  recommendedSetupTier: SetupTierId;
  /**
   * Cupos disponibles del founder pricing. Se decrementa con cada nueva
   * empresa que se da de alta con plan founder. Cuando llega a 0, los
   * nuevos clientes pasan a precio regular.
   */
  founderCapacity?: number;
}

export type SetupTierId = 'negocio' | 'comercial' | 'custom';

export interface SetupTier {
  id: SetupTierId;
  name: string;
  /**
   * Precio en GTQ. NULL = pendiente de definición (depende de costos del
   * certificador FEL + tiempo de implementación + capacitación).
   * Cuando se confirme con Infile/Digifact, llenar estos números.
   */
  founderPriceGtq: number | null;
  regularPriceGtq: number | null;
  hoursEstimated: number;
  description: string;
  includes: string[];
  /** Notas internas para tu uso al cotizar. */
  internalNotes?: string;
}

export const SETUP_TIERS: Record<SetupTierId, SetupTier> = {
  negocio: {
    id: 'negocio',
    name: 'Setup Negocio',
    founderPriceGtq: null, // TBD — pendiente costo certificador FEL por cliente
    regularPriceGtq: null,
    hoursEstimated: 3,
    description:
      'Onboarding básico para Plan Negocio. Visita al local del cliente en Tecpán/región Chimaltenango. Una sola sucursal.',
    includes: [
      'Visita presencial al local del cliente (1-2h)',
      'Capacitación 1:1 con el dueño/cajero',
      'Importación inicial de productos (CSV o manual)',
      'Configuración fiscal (NIT, régimen, dirección)',
      'Implementación y certificación FEL con Infile/Digifact',
      'Setup de sucursal principal y caja',
      'Soporte WhatsApp primera semana',
    ],
    internalNotes:
      'Costo a calcular: tarifa Infile/Digifact por cliente nuevo + horas Marvin (incluye capacitación + dudas). Margen sugerido 60-80% sobre costos directos.',
  },
  comercial: {
    id: 'comercial',
    name: 'Setup Comercial',
    founderPriceGtq: null, // TBD
    regularPriceGtq: null,
    hoursEstimated: 8,
    description:
      'Onboarding para Plan Comercial. Capacitación al equipo (3-5 personas), multi-sucursal hasta 2 locales, integración FEL completa.',
    includes: [
      'Visita presencial a cada sucursal (hasta 2)',
      'Capacitación al equipo (4-6h total)',
      'Importación legacy completa (productos, clientes, proveedores, saldos)',
      'Configuración multi-sucursal con permisos por usuario',
      'Implementación y certificación FEL con Infile/Digifact',
      'Acompañamiento del primer cierre de caja en vivo',
      'Acompañamiento del primer cierre contable mensual',
      '1 mes de soporte premium gratis',
    ],
    internalNotes:
      'Costo a calcular: tarifas Infile/Digifact + horas Marvin (capacitación equipo + cierres + dudas múltiples).',
  },
  custom: {
    id: 'custom',
    name: 'Setup a medida',
    founderPriceGtq: null,
    regularPriceGtq: null,
    hoursEstimated: 0, // depende del proyecto
    description:
      'Cotización personalizada para cuentas grandes (3+ sucursales, equipos amplios, migración legacy compleja, integraciones externas).',
    includes: [
      'Plan de migración personalizado',
      'Migración de datos desde sistema legacy',
      'Integraciones con sistemas externos si los hay',
      'Capacitación a múltiples usuarios y sucursales en cascada',
      'Acompañamiento del primer mes operativo',
      'Documentación operativa interna a medida',
    ],
    internalNotes:
      'Cotizar caso por caso. Piso interno mental: Q12.000+ según escala. Cargo por hora extra: Q700/h.',
  },
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial',
    name: 'Prueba gratis',
    description:
      'Prueba gratis 30 días con todas las funciones del plan Negocio. La facturación electrónica (FEL) NO está disponible en el trial: se configura como parte del setup cuando contratás un plan pago (porque el certificador cobra por la configuración inicial de cada cliente nuevo). Sin tarjeta. Al vencer queda en modo lectura por 30 días para que recuperes tu data si decidís no contratar.',
    highlight: false,
    purchasable: false,
    requiresQuote: false,
    pricing: {
      founderMonthly: 0,
      founderAnnual: 0,
      regularMonthly: 0,
      regularAnnual: 0,
    },
    quotas: {
      // Cuotas idénticas a Negocio. El cliente prueba EXACTAMENTE el plan
      // que va a pagar — sin "wow effect" inflado que después lo hace dudar
      // al convertir.
      branches: 1,
      users: 1,
      products: 2000,
      salesPerMonth: 3000,
      storageMb: 500,
      legalEntities: 1,
      apiAccess: false,
      support: 'email',
      payrollEmployees: 5,
    },
    recommendedSetupTier: 'negocio',
  },

  negocio: {
    id: 'negocio',
    name: 'Negocio',
    description:
      'ERP completo para comercio chico de un solo local. POS, inventario, ventas, tesorería, contabilidad, planilla básica. Para tienda, ferretería, panadería, salón, lavandería: el dueño + un cajero atendiendo. Visita presencial al local incluida en setup.',
    highlight: true,
    purchasable: true,
    requiresQuote: false,
    pricing: {
      founderMonthly: 399,
      founderAnnual: 3990, // 16% off
      regularMonthly: 599,
      regularAnnual: 5990,
    },
    quotas: {
      branches: 1,
      users: 1,
      products: 2000,
      salesPerMonth: 3000,
      storageMb: 500,
      legalEntities: 1,
      apiAccess: false,
      support: 'whatsapp_business_hours',
      payrollEmployees: 5,
    },
    recommendedSetupTier: 'negocio',
    founderCapacity: 25,
  },

  comercial: {
    id: 'comercial',
    name: 'Comercial',
    description:
      'Para comercios que crecen. Equipo de hasta 5 personas, hasta 2 sucursales, multi-cuenta bancaria, planilla GT-compliant (ISR/IGSS/Bono14/Aguinaldo), reportes contables completos. Para el cliente que abrió un segundo local o se está formalizando con empleados.',
    highlight: false,
    purchasable: true,
    requiresQuote: false,
    pricing: {
      founderMonthly: 999,
      founderAnnual: 9990,
      regularMonthly: 1299,
      regularAnnual: 12990,
    },
    quotas: {
      branches: 2,
      users: 5,
      products: 5000,
      salesPerMonth: 10000,
      storageMb: 2048,
      legalEntities: 1,
      apiAccess: false,
      support: 'whatsapp_priority',
      payrollEmployees: 30,
    },
    recommendedSetupTier: 'comercial',
    founderCapacity: 10,
  },

  enterprise: {
    id: 'enterprise',
    name: 'Empresarial',
    description:
      'Para cuentas grandes con 3+ sucursales, equipos amplios, multi-empresa o necesidades específicas. Cotización personalizada según escala y requerimientos. Sin precio público — hablemos por WhatsApp.',
    highlight: false,
    purchasable: true,
    requiresQuote: true,
    pricing: null, // sin precio público
    quotas: {
      branches: -1,
      users: -1,
      products: -1,
      salesPerMonth: -1,
      storageMb: 25600,
      legalEntities: 5,
      apiAccess: true,
      support: 'whatsapp_priority',
      payrollEmployees: -1,
    },
    recommendedSetupTier: 'custom',
    // Sin founderCapacity — se cotiza siempre.
  },
};

/**
 * Modelos de cobro de FEL. El cliente elige uno al hacer onboarding.
 * Cuotas a definir cuando se confirme tarifa con certificador (Infile/Digifact).
 */
export type FelModelId = 'byo' | 'managed';

export interface FelModel {
  id: FelModelId;
  name: string;
  description: string;
  /**
   * Cuota mensual base que cobra SIMTECH. NULL = pendiente de definir
   * cuando se confirme costo del certificador.
   */
  monthlyBaseGtq: number | null;
  /** Costo por factura excedente. NULL = TBD. */
  perInvoiceOverageGtq: number | null;
  availableInPlans: PlanId[];
  internalNotes?: string;
}

export const FEL_OPTIONS: Record<FelModelId, FelModel> = {
  byo: {
    id: 'byo',
    name: 'FEL por tu cuenta (Bring Your Own)',
    description:
      'Vos contratás Infile o Digifact directo. SIMTECH integra con tus credenciales API. SIMTECH no cobra nada por FEL. Útil si ya tenés contrato con un certificador.',
    monthlyBaseGtq: 0,
    perInvoiceOverageGtq: 0,
    // Excluído `trial` a propósito: la configuración inicial con el
    // certificador tiene costo (~Q1.500) que SIMTECH no asume para una
    // cuenta que tal vez no convierte.
    availableInPlans: ['negocio', 'comercial', 'enterprise'],
  },
  managed: {
    id: 'managed',
    name: 'FEL gestionada por SIMTECH',
    description:
      'SIMTECH es el intermediario con el certificador. Cuota mensual mínima de facturas incluida en el plan; excedente se cobra por factura. La mayoría de clientes Negocio/Comercial elige esta opción por simplicidad.',
    monthlyBaseGtq: null, // TBD según certificador
    perInvoiceOverageGtq: null,
    availableInPlans: ['negocio', 'comercial', 'enterprise'],
    internalNotes:
      'Cuotas incluidas tentativas: Negocio 1.000/mes, Comercial 3.000/mes, Empresarial 8.000+/mes. Confirmar con tarifa real de Infile/Digifact y costo de implementación por cliente.',
  },
};

/**
 * Add-ons que se compran encima de cualquier plan compatible.
 */
export interface AddOn {
  id: string;
  name: string;
  description: string;
  monthlyPriceGtq: number;
  oneTimePriceGtq?: number;
  hourlyRateGtq?: number;
  stripePriceId?: string;
  availableInPlans: PlanId[];
}

export const ADDONS: Record<string, AddOn> = {
  extra_user: {
    id: 'extra_user',
    name: 'Usuario adicional',
    description:
      'Cada usuario extra sobre el límite del plan (e.g. cajero adicional en Negocio para un dueño que ahora tiene a alguien atendiendo).',
    monthlyPriceGtq: 49,
    availableInPlans: ['negocio', 'comercial', 'enterprise'],
  },
  extra_branch: {
    id: 'extra_branch',
    name: 'Sucursal adicional',
    description: 'Cada sucursal extra. Solo disponible en Comercial y Empresarial.',
    monthlyPriceGtq: 199,
    availableInPlans: ['comercial', 'enterprise'],
  },
  extra_training: {
    id: 'extra_training',
    name: 'Capacitación adicional',
    description:
      'Horas adicionales de capacitación después del setup inicial. Tarifa por hora.',
    monthlyPriceGtq: -1,
    hourlyRateGtq: 500,
    availableInPlans: ['negocio', 'comercial', 'enterprise'],
  },
  on_site_visit: {
    id: 'on_site_visit',
    name: 'Visita presencial adicional',
    description:
      'Visita presencial al local fuera de la programación regular. Aplica en Tecpán/Chimaltenango. Para visita fuera región: tarifa + viáticos.',
    monthlyPriceGtq: -1,
    oneTimePriceGtq: 500, // tarifa base regional
    availableInPlans: ['negocio', 'comercial', 'enterprise'],
  },
  custom_report: {
    id: 'custom_report',
    name: 'Reporte a medida',
    description:
      'Diseño y desarrollo de un reporte específico para el negocio del cliente.',
    monthlyPriceGtq: -1,
    oneTimePriceGtq: 1500,
    availableInPlans: ['comercial', 'enterprise'],
  },
};

// ──────────────────── Helpers ────────────────────

/** Format GTQ amount como Q1,234. */
export function formatGtq(amount: number): string {
  return `Q${amount.toLocaleString('es-GT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Calcula el ahorro al pagar anual vs mensual. */
export function annualSavingsPercent(monthlyPrice: number, annualPrice: number): number {
  if (!monthlyPrice || !annualPrice) return 0;
  const monthlyTotal = monthlyPrice * 12;
  return Math.round(((monthlyTotal - annualPrice) / monthlyTotal) * 100);
}

/** Devuelve los planes purchaseables ordenados por precio mensual ascendente. */
export function getPurchasablePlans(): Plan[] {
  return Object.values(PLANS)
    .filter((p) => p.purchasable)
    .sort((a, b) => {
      // Planes sin precio (cotización) van al final.
      if (!a.pricing && !b.pricing) return 0;
      if (!a.pricing) return 1;
      if (!b.pricing) return -1;
      return a.pricing.founderMonthly - b.pricing.founderMonthly;
    });
}

/**
 * Obtiene el precio efectivo aplicable para una empresa según su estatus.
 * Si la empresa fue creada con `founderPricing=true`, mantiene founder
 * mientras esté activa. Sino, paga regular.
 */
export function getEffectivePricing(
  plan: Plan,
  isFounderCustomer: boolean,
  cycle: BillingCycle,
): { amount: number | null; label: string } {
  if (!plan.pricing) {
    return { amount: null, label: 'Cotización personalizada' };
  }
  const p = plan.pricing;
  if (cycle === 'monthly') {
    return {
      amount: isFounderCustomer ? p.founderMonthly : p.regularMonthly,
      label: isFounderCustomer ? 'Founder mensual' : 'Mensual',
    };
  }
  return {
    amount: isFounderCustomer ? p.founderAnnual : p.regularAnnual,
    label: isFounderCustomer ? 'Founder anual' : 'Anual',
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

  if (typeof limit === 'boolean') {
    return {
      ok: limit,
      reason: limit ? undefined : `Feature no disponible en plan ${plan.name}`,
    };
  }

  if (typeof limit === 'string') {
    return { ok: true };
  }

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
