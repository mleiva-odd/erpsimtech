import { describe, it, expect } from 'vitest';
import {
  IGSS_LABORAL_RATE,
  IGSS_PATRONAL_RATE,
  IRTRA_RATE,
  INTECAP_RATE,
  IGSS_TOTAL_PATRONAL_RATE,
  calculateIgssLaboral,
  calculateIgssPatronal,
} from '../igss';

describe('payroll/igss', () => {
  it('expone tasas exactas de ley GT', () => {
    expect(IGSS_LABORAL_RATE).toBe(0.0483);
    expect(IGSS_PATRONAL_RATE).toBe(0.1067);
    expect(IRTRA_RATE).toBe(0.01);
    expect(INTECAP_RATE).toBe(0.01);
    // 12.67%
    expect(IGSS_TOTAL_PATRONAL_RATE).toBeCloseTo(0.1267, 4);
  });

  it('calcula IGSS laboral 4.83% sobre base', () => {
    // Q5,000 * 4.83% = Q241.50
    expect(calculateIgssLaboral(5000, true)).toBe(241.5);
    // Q10,000 * 4.83% = Q483.00
    expect(calculateIgssLaboral(10000, true)).toBe(483);
  });

  it('IGSS laboral = 0 si empleado NO afiliado', () => {
    expect(calculateIgssLaboral(5000, false)).toBe(0);
    expect(calculateIgssLaboral(50000, false)).toBe(0);
  });

  it('IGSS laboral = 0 si base inválida o cero', () => {
    expect(calculateIgssLaboral(0, true)).toBe(0);
    expect(calculateIgssLaboral(-100, true)).toBe(0);
    expect(calculateIgssLaboral(NaN, true)).toBe(0);
  });

  it('calcula cargas patronales 10.67% + 1% + 1%', () => {
    const r = calculateIgssPatronal(5000, true);
    expect(r.igssPatronal).toBe(533.5); // 5000 * 0.1067
    expect(r.irtra).toBe(50);
    expect(r.intecap).toBe(50);
    expect(r.total).toBe(633.5);
  });

  it('cargas patronales = 0 si NO afiliado', () => {
    const r = calculateIgssPatronal(5000, false);
    expect(r).toEqual({ igssPatronal: 0, irtra: 0, intecap: 0, total: 0 });
  });
});
