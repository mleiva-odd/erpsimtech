import { describe, it, expect } from 'vitest';
import { prorateLandedCost } from '../landed-cost';

describe('purchases/landed-cost', () => {
  it('prorratea proporcional al subtotal de cada línea', () => {
    // Línea A: 10 * 10 = 100  (66.67%)
    // Línea B: 5  * 10 = 50   (33.33%)
    // Landed total 150 → A=100, B=50
    const out = prorateLandedCost(
      [
        { key: 'A', quantity: 10, unitCost: 10 },
        { key: 'B', quantity: 5, unitCost: 10 },
      ],
      150,
    );
    expect(out).toHaveLength(2);
    // El resultado del último item es ajustado para cerrar la suma exacta.
    const sum = out.reduce((acc, r) => acc + r.landedShare, 0);
    expect(sum).toBeCloseTo(150, 2);
    // Línea A tiene 2/3 = ~100
    expect(out[0].landedShare).toBeCloseTo(100, 1);
    // Línea B tiene 1/3 = ~50
    expect(out[1].landedShare).toBeCloseTo(50, 1);
  });

  it('ajusta unit cost agregando landed cost / quantity', () => {
    // A: 10 unidades a Q10 → recibe Q50 de landed → +Q5/unidad
    const out = prorateLandedCost(
      [
        { key: 'A', quantity: 10, unitCost: 10 },
        { key: 'B', quantity: 10, unitCost: 10 },
      ],
      100,
    );
    // 50% y 50%: cada uno recibe 50
    expect(out[0].landedShare).toBeCloseTo(50, 1);
    expect(out[0].adjustedUnitCost).toBeCloseTo(15, 2);
    expect(out[1].adjustedUnitCost).toBeCloseTo(15, 2);
  });

  it('landed cost 0 → no toca unit cost', () => {
    const out = prorateLandedCost(
      [{ key: 'A', quantity: 5, unitCost: 20 }],
      0,
    );
    expect(out[0].landedShare).toBe(0);
    expect(out[0].adjustedUnitCost).toBe(20);
  });

  it('sin líneas → array vacío', () => {
    const out = prorateLandedCost([], 100);
    expect(out).toEqual([]);
  });

  it('si todas las líneas tienen costo 0, prorratea por cantidad como fallback', () => {
    const out = prorateLandedCost(
      [
        { key: 'A', quantity: 1, unitCost: 0 },
        { key: 'B', quantity: 3, unitCost: 0 },
      ],
      40,
    );
    const sum = out.reduce((acc, r) => acc + r.landedShare, 0);
    expect(sum).toBeCloseTo(40, 2);
    // A debe llevar 1/4 = 10; B 3/4 = 30
    expect(out[0].landedShare).toBeCloseTo(10, 1);
    expect(out[1].landedShare).toBeCloseTo(30, 1);
  });

  it('suma exacta de shares == totalLandedCost (residuo de redondeo asignado al último)', () => {
    // 3 líneas con shares irregulares fuerzan redondeo
    const out = prorateLandedCost(
      [
        { key: 'A', quantity: 1, unitCost: 7 },
        { key: 'B', quantity: 1, unitCost: 7 },
        { key: 'C', quantity: 1, unitCost: 7 },
      ],
      100,
    );
    const sum = out.reduce((acc, r) => acc + r.landedShare, 0);
    expect(sum).toBe(100); // exactamente 100, no 99.99 o 100.01
  });
});
