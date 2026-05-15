/**
 * Fase 22d-5 · Tipos compartidos para plantillas de documentos.
 *
 * `DocumentTemplate.items` y `DocumentTemplate.metadata` son JSONB en
 * Prisma; este módulo define el shape mínimo que los consumidores
 * (UI + API) usan para construir y aplicar plantillas.
 *
 * Cada `DocumentTemplateType` usa el mismo `TemplateItem`, pero
 * dependiendo del tipo, algunos campos son relevantes:
 *  - QUOTE / SALE      → `unitPrice`, `discountRate`
 *  - RFQ               → `specifications`, `observations`, `unit`
 *  - PURCHASE_REQUEST  → `estimatedUnitCost`, `notes`
 *  - PURCHASE_ORDER    → `estimatedUnitCost`, `notes`
 *
 * Esto no se enforza en DB; la UI/API lee los que aplican y los demás
 * los ignora.
 */
import type { DocumentTemplateType } from '@prisma/client';

export interface TemplateItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  // Para QUOTE/SALE puede incluir snapshot de precio sugerido (opcional):
  unitPrice?: number | null;
  discountRate?: number | null;
  // Para RFQ:
  specifications?: string | null;
  observations?: string | null;
  // Para PR/PO:
  estimatedUnitCost?: number | null;
}

export interface TemplateMetadata {
  deliveryPlace?: string;
  paymentTerms?: string;
  /** RFQ/PR motivo */
  reason?: string;
  /** Sucursal default a aplicar */
  branchId?: string;
  /** RFQ/QUOTE: días validez */
  quoteValidityDays?: number;
}

export type { DocumentTemplateType };

/**
 * Validador en runtime de un item de plantilla. Lanza string descriptivo
 * si encuentra problemas; útil para los endpoints POST/PUT donde el body
 * llega como JSON sin tipar.
 */
export function isValidTemplateItem(raw: unknown): raw is TemplateItem {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.productId !== 'string' || obj.productId.length === 0) {
    return false;
  }
  const q = obj.quantity;
  if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0) {
    return false;
  }
  // Resto de campos opcionales: si vienen, deben ser del tipo correcto.
  const optionalString = ['variantId', 'unit', 'notes', 'specifications', 'observations'] as const;
  for (const k of optionalString) {
    if (k in obj && obj[k] !== null && obj[k] !== undefined && typeof obj[k] !== 'string') {
      return false;
    }
  }
  const optionalNumber = ['unitPrice', 'discountRate', 'estimatedUnitCost'] as const;
  for (const k of optionalNumber) {
    const v = obj[k];
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      return false;
    }
  }
  return true;
}

/**
 * Valida y normaliza un array de items. Devuelve el array tipado o lanza
 * un error con el primer problema encontrado.
 */
export function parseTemplateItems(raw: unknown): TemplateItem[] {
  if (!Array.isArray(raw)) {
    throw new Error('El campo "items" debe ser un arreglo.');
  }
  if (raw.length === 0) {
    throw new Error('La plantilla debe tener al menos un ítem.');
  }
  const out: TemplateItem[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const it = raw[i];
    if (!isValidTemplateItem(it)) {
      throw new Error(`Ítem inválido en la posición ${i + 1}.`);
    }
    out.push({
      productId: it.productId,
      variantId: it.variantId ?? null,
      quantity: it.quantity,
      unit: it.unit ?? null,
      notes: it.notes ?? null,
      unitPrice: it.unitPrice ?? null,
      discountRate: it.discountRate ?? null,
      specifications: it.specifications ?? null,
      observations: it.observations ?? null,
      estimatedUnitCost: it.estimatedUnitCost ?? null,
    });
  }
  return out;
}

/**
 * Valida y normaliza metadata. Acepta `undefined`/`null` (vuelve a `null`).
 */
export function parseTemplateMetadata(raw: unknown): TemplateMetadata | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El campo "metadata" debe ser un objeto.');
  }
  const obj = raw as Record<string, unknown>;
  const out: TemplateMetadata = {};
  if (typeof obj.deliveryPlace === 'string') out.deliveryPlace = obj.deliveryPlace;
  if (typeof obj.paymentTerms === 'string') out.paymentTerms = obj.paymentTerms;
  if (typeof obj.reason === 'string') out.reason = obj.reason;
  if (typeof obj.branchId === 'string') out.branchId = obj.branchId;
  if (typeof obj.quoteValidityDays === 'number' && Number.isFinite(obj.quoteValidityDays)) {
    out.quoteValidityDays = obj.quoteValidityDays;
  }
  return Object.keys(out).length > 0 ? out : null;
}
