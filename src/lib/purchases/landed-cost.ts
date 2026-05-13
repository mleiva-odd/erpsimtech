/**
 * Fase 19 · Prorrateo de Landed Cost (costos adicionales de compra).
 *
 * "Landed cost" = costos accesorios (flete, seguro, aduana, manejo) que se
 * suman al costo unitario del inventario para reflejar el costo real puesto
 * en bodega. SAT y NIIF exigen incluirlos en el valor de inventario.
 *
 * Estrategia: prorratear proporcionalmente al `subtotal` (valor) de cada
 * línea. Líneas con mayor valor absorben mayor parte del landed cost.
 *
 * Alternativas no usadas:
 *  - Prorrateo por cantidad: distorsiona cuando hay productos de muy distinto
 *    precio mezclados.
 *  - Prorrateo por peso/volumen: requiere dato físico que no tenemos en
 *    schema; queda para fase futura.
 *
 * Cálculo:
 *
 *   shareLine_i = subtotal_i / Σ subtotal
 *   landedCost_i = totalLanded * shareLine_i
 *   adjustedUnitCost_i = unitCost_i + landedCost_i / quantity_i
 *
 * El último paso es lo que el GRN persiste como `unitCost` del movimiento
 * de stock, para que el WAC y `Product.cost` reflejen el costo real puesto.
 */

export interface PurchaseLineForLanding {
  /** Identificador interno para el caller (no usado en el cálculo). */
  key: string;
  /** Cantidad de la línea. */
  quantity: number;
  /** Costo unitario de la línea (sin landed cost). */
  unitCost: number;
}

export interface ProratedLandingResult {
  key: string;
  /** Porción del landed cost asignada a esta línea (en GTQ). */
  landedShare: number;
  /** Costo unitario ajustado: unitCost + landedShare/quantity. */
  adjustedUnitCost: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Prorratea `totalLandedCost` entre `lines` proporcionalmente al subtotal de
 * cada línea (quantity * unitCost). Devuelve para cada línea:
 *  - `landedShare`: monto absoluto asignado.
 *  - `adjustedUnitCost`: costo unitario incluyendo el landed cost.
 *
 * Reglas defensivas:
 *  - Si `totalLandedCost <= 0` o no hay líneas: cada línea recibe
 *    `landedShare=0` y `adjustedUnitCost=unitCost`.
 *  - Si Σ subtotal <= 0 (todos a costo 0): se prorratea por cantidad como
 *    fallback (evita división por cero y mantiene cierre).
 *  - El último elemento recibe el ajuste residual de redondeo para que
 *    Σ landedShare == totalLandedCost (sin pérdida por rounding).
 */
export function prorateLandedCost(
  lines: PurchaseLineForLanding[],
  totalLandedCost: number,
): ProratedLandingResult[] {
  if (!lines.length) return [];

  if (!totalLandedCost || totalLandedCost <= 0) {
    return lines.map((l) => ({
      key: l.key,
      landedShare: 0,
      adjustedUnitCost: round4(l.unitCost),
    }));
  }

  const totalSubtotal = lines.reduce(
    (acc, l) => acc + Math.max(0, Number(l.quantity)) * Math.max(0, Number(l.unitCost)),
    0,
  );
  const totalQty = lines.reduce(
    (acc, l) => acc + Math.max(0, Number(l.quantity)),
    0,
  );

  const useQtyFallback = totalSubtotal <= 0;

  const raw: ProratedLandingResult[] = lines.map((l) => {
    const qty = Math.max(0, Number(l.quantity));
    const cost = Math.max(0, Number(l.unitCost));
    const lineSubtotal = qty * cost;

    let share: number;
    if (useQtyFallback) {
      share = totalQty > 0 ? (qty / totalQty) * totalLandedCost : 0;
    } else {
      share = totalSubtotal > 0 ? (lineSubtotal / totalSubtotal) * totalLandedCost : 0;
    }
    share = round2(share);

    const perUnitExtra = qty > 0 ? share / qty : 0;
    const adjusted = round4(cost + perUnitExtra);

    return { key: l.key, landedShare: share, adjustedUnitCost: adjusted };
  });

  // Corrección de redondeo: ajustamos el último elemento para que la suma
  // exacta coincida con totalLandedCost.
  const sum = raw.reduce((acc, r) => acc + r.landedShare, 0);
  const diff = round2(totalLandedCost - sum);
  if (diff !== 0 && raw.length > 0) {
    const last = raw[raw.length - 1];
    last.landedShare = round2(last.landedShare + diff);
    const lastInput = lines[lines.length - 1];
    const qty = Math.max(0, Number(lastInput.quantity));
    const cost = Math.max(0, Number(lastInput.unitCost));
    last.adjustedUnitCost = round4(cost + (qty > 0 ? last.landedShare / qty : 0));
  }

  return raw;
}
