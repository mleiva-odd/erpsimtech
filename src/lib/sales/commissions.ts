/**
 * Motor de comisiones (Fase 20).
 *
 * Reglas:
 *   - `CommissionRule` activa con `companyId == sale.companyId`.
 *   - Si `categoryId` está seteado, la regla aplica solo a líneas cuyos
 *     productos pertenezcan a esa categoría.
 *   - Si `categoryId` es null, la regla aplica a TODAS las líneas (global).
 *   - `basis = SUBTOTAL`: comisión = rate * Σ líneas elegibles (subtotal post-descuento).
 *   - `basis = MARGIN`: comisión = rate * Σ (subtotal_línea - unitCost * qty).
 *
 * Se calculan TODAS las reglas que aplican (acumulativas). Si la empresa
 * solo quiere una regla a la vez, debe desactivar las otras.
 *
 * Resultado: array de Commission a crear (uno por regla activa que produjo
 * monto > 0).
 */

export interface CommissionRuleLike {
  id: string;
  companyId: string;
  categoryId: string | null;
  basis: 'MARGIN' | 'SUBTOTAL';
  rate: unknown; // Decimal 0..1
  active: boolean;
}

export interface CommissionSaleItemLike {
  productId: string;
  /** Subtotal post-descuento pre-IVA. */
  subtotal: unknown;
  unitCost: unknown;
  quantity: number;
  /** Categoría del producto. Required: el caller debe joinear. */
  categoryId: string | null;
}

export interface CommissionToCreate {
  ruleId: string;
  amount: number;
  /** Empleado vinculado al vendedor de la venta (si existe). */
  employeeId?: string | null;
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number((v as { toString: () => string }).toString()) || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateCommissions(
  items: CommissionSaleItemLike[],
  rules: CommissionRuleLike[],
  options: { employeeId?: string | null } = {},
): CommissionToCreate[] {
  const out: CommissionToCreate[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const eligible = rule.categoryId
      ? items.filter((it) => it.categoryId === rule.categoryId)
      : items;
    if (eligible.length === 0) continue;
    let base = 0;
    if (rule.basis === 'SUBTOTAL') {
      base = eligible.reduce((s, it) => s + num(it.subtotal), 0);
    } else {
      base = eligible.reduce(
        (s, it) => s + (num(it.subtotal) - num(it.unitCost) * it.quantity),
        0,
      );
    }
    if (base <= 0) continue;
    const amount = round2(base * num(rule.rate));
    if (amount <= 0) continue;
    out.push({ ruleId: rule.id, amount, employeeId: options.employeeId ?? null });
  }
  return out;
}
