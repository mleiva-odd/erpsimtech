import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Fase 27 · Plantillas contables por tipo de negocio.
 *
 * El seed base (`seedChartOfAccounts` en `./seed.ts`) cubre el plan estándar
 * GT — suficiente para comercio puro. Para otros giros (servicios,
 * restaurante, industria) hace falta extender el plan con cuentas
 * específicas del rubro. Estas plantillas NO reemplazan el seed base; lo
 * complementan agregando cuentas hoja bajo categorías existentes.
 *
 * Uso típico:
 *   await seedChartOfAccounts(tx, companyId);   // plan base
 *   await seedTemplateAccounts(tx, companyId, 'RESTAURANT');  // extras
 *
 * Idempotente: si una cuenta ya existe con ese código, no la duplica.
 *
 * Importante: los códigos extra usan números altos dentro de cada grupo
 * (e.g. 4.1.03, 4.1.04) para no chocar con el seed base. Si en el futuro
 * se agregan más cuentas al seed base, revisar que no colisionen.
 */

export type BusinessType = 'COMMERCE' | 'SERVICES' | 'RESTAURANT' | 'INDUSTRY';

export const BUSINESS_TYPES: BusinessType[] = [
  'COMMERCE',
  'SERVICES',
  'RESTAURANT',
  'INDUSTRY',
];

export interface AccountingTemplateExtraAccount {
  code: string;
  name: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  isPosting: boolean;
  parent?: string;
}

export interface AccountingTemplate {
  type: BusinessType;
  name: string;
  description: string;
  /**
   * Cuentas extra que se agregan al chart of accounts existente.
   * NO sobreescriben las del seed base — si el código ya existe, se omite.
   */
  extraAccounts: AccountingTemplateExtraAccount[];
}

export const TEMPLATES: AccountingTemplate[] = [
  {
    type: 'COMMERCE',
    name: 'Comercio (venta de productos)',
    description:
      'Para tiendas, distribuidoras, mayoristas. Plan estándar GT — no agrega cuentas extra porque el seed base ya cubre operación comercial típica.',
    extraAccounts: [],
  },
  {
    type: 'SERVICES',
    name: 'Servicios profesionales',
    description:
      'Para consultoras, abogados, agencias. Sin inventario relevante; agrega cuentas de ingresos por servicios y honorarios pagados.',
    extraAccounts: [
      {
        code: '4.1.03',
        name: 'Ingresos por Servicios',
        accountType: 'INCOME',
        isPosting: true,
        parent: '4.1',
      },
      {
        code: '5.2.04',
        name: 'Honorarios Pagados',
        accountType: 'EXPENSE',
        isPosting: true,
        parent: '5.2',
      },
    ],
  },
  {
    type: 'RESTAURANT',
    name: 'Restaurante',
    description:
      'Para restaurantes, cafés, food trucks. Incluye costo de insumos, propinas por pagar (pasivo) e ingreso por propinas.',
    extraAccounts: [
      {
        code: '5.1.02',
        name: 'Costo de Insumos',
        accountType: 'EXPENSE',
        isPosting: true,
        parent: '5.1',
      },
      {
        code: '2.1.09',
        name: 'Propinas por Pagar',
        accountType: 'LIABILITY',
        isPosting: true,
        parent: '2.1',
      },
      {
        code: '4.1.04',
        name: 'Ingresos Propinas',
        accountType: 'INCOME',
        isPosting: true,
        parent: '4.1',
      },
    ],
  },
  {
    type: 'INDUSTRY',
    name: 'Industria / Manufactura',
    description:
      'Para fábricas y manufactura. Incluye materias primas, productos en proceso (activo) y costos de producción.',
    extraAccounts: [
      {
        code: '1.2.03',
        name: 'Materias Primas',
        accountType: 'ASSET',
        isPosting: true,
        parent: '1.2',
      },
      {
        code: '1.2.04',
        name: 'Productos en Proceso',
        accountType: 'ASSET',
        isPosting: true,
        parent: '1.2',
      },
      {
        code: '5.1.03',
        name: 'Costos de Producción',
        accountType: 'EXPENSE',
        isPosting: true,
        parent: '5.1',
      },
    ],
  },
];

/**
 * Devuelve la plantilla por tipo. Null si el tipo es desconocido.
 * Útil para preview en la UI antes de hacer el POST de onboarding.
 */
export function getTemplate(type: BusinessType): AccountingTemplate | null {
  return TEMPLATES.find((t) => t.type === type) ?? null;
}

/**
 * Aplica una plantilla contable extra sobre el chart of accounts de una
 * empresa. Debe llamarse DESPUÉS de `seedChartOfAccounts` — si una cuenta
 * padre no existe, se omite la relación (no falla).
 *
 * Idempotente: códigos ya existentes se saltan.
 */
export async function seedTemplateAccounts(
  tx: Tx,
  companyId: string,
  type: BusinessType,
): Promise<{ created: number; skipped: number }> {
  const template = TEMPLATES.find((t) => t.type === type);
  if (!template || template.extraAccounts.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Mapa code -> id para resolver parents al final.
  const idsByCode = new Map<string, string>();
  let created = 0;
  let skipped = 0;

  // Primera pasada: crear cuentas que no existen.
  for (const acct of template.extraAccounts) {
    const existing = await tx.chartOfAccount.findUnique({
      where: { companyId_code: { companyId, code: acct.code } },
      select: { id: true },
    });
    if (existing) {
      idsByCode.set(acct.code, existing.id);
      skipped += 1;
      continue;
    }
    const newAcct = await tx.chartOfAccount.create({
      data: {
        companyId,
        code: acct.code,
        name: acct.name,
        type: acct.accountType,
        isPosting: acct.isPosting,
      },
      select: { id: true },
    });
    idsByCode.set(acct.code, newAcct.id);
    created += 1;
  }

  // Segunda pasada: vincular parents. Si el parent code no está en el mapa
  // local, intentamos resolverlo desde la DB (el seed base ya debería tener
  // los padres como 4.1, 5.1, 5.2, 2.1, 1.2).
  for (const acct of template.extraAccounts) {
    if (!acct.parent) continue;
    const id = idsByCode.get(acct.code);
    if (!id) continue;

    let parentId = idsByCode.get(acct.parent) ?? null;
    if (!parentId) {
      const parent = await tx.chartOfAccount.findUnique({
        where: { companyId_code: { companyId, code: acct.parent } },
        select: { id: true },
      });
      parentId = parent?.id ?? null;
    }
    if (!parentId) continue;

    await tx.chartOfAccount.update({
      where: { id },
      data: { parentId },
    });
  }

  return { created, skipped };
}
