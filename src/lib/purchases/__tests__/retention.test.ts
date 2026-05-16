import { describe, it, expect } from 'vitest';
import {
  calculateRetention,
  suggestedIsrRate,
  IVA_RETENTION_PC_RATE,
  IVA_RETENTION_GENERAL_RATE,
  ISR_RATE_TRAMO_I,
  ISR_RATE_TRAMO_II,
  ISR_TRAMO_THRESHOLD_MONTHLY,
} from '../retention';

describe('purchases/retention', () => {
  it('expone constantes legales correctas', () => {
    expect(IVA_RETENTION_PC_RATE).toBe(0.05);
    expect(IVA_RETENTION_GENERAL_RATE).toBe(0.15);
    expect(ISR_RATE_TRAMO_I).toBe(0.05);
    expect(ISR_RATE_TRAMO_II).toBe(0.07);
    expect(ISR_TRAMO_THRESHOLD_MONTHLY).toBe(30000);
  });

  it('proveedor PC con withholdsIVA retiene 5% del subtotal', () => {
    // Subtotal Q1000, tax 0 (PC no factura IVA débito)
    const r = calculateRetention({
      subtotal: 1000,
      tax: 0,
      supplierTaxRegime: 'PEQUENO_CONTRIBUYENTE',
      withholdsIVA: true,
      withholdsISR: false,
    });
    expect(r.withheldIVA).toBe(50);
    expect(r.withheldISR).toBe(0);
    expect(r.total).toBe(950);
  });

  it('proveedor PC SIN withholdsIVA NO retiene IVA', () => {
    const r = calculateRetention({
      subtotal: 1000,
      tax: 0,
      supplierTaxRegime: 'PEQUENO_CONTRIBUYENTE',
      withholdsIVA: false,
      withholdsISR: false,
    });
    expect(r.withheldIVA).toBe(0);
    expect(r.total).toBe(1000);
  });

  it('proveedor GENERAL con withholdsIVA aplica 15% sobre el IVA débito', () => {
    // Subtotal Q1000, IVA 12% = Q120 → retención = 15% * 120 = 18
    const r = calculateRetention({
      subtotal: 1000,
      tax: 120,
      supplierTaxRegime: 'GENERAL',
      withholdsIVA: true,
      withholdsISR: false,
    });
    expect(r.withheldIVA).toBe(18);
    expect(r.withheldISR).toBe(0);
    // total = 1000 + 120 - 18 = 1102
    expect(r.total).toBe(1102);
  });

  it('retención ISR 5% servicios profesionales', () => {
    const r = calculateRetention({
      subtotal: 10000,
      tax: 1200,
      supplierTaxRegime: 'GENERAL',
      withholdsIVA: false,
      withholdsISR: true,
      isrRate: 0.05,
    });
    expect(r.withheldIVA).toBe(0);
    expect(r.withheldISR).toBe(500);
    // total = 10000 + 1200 - 0 - 500 = 10700
    expect(r.total).toBe(10700);
  });

  it('retención ISR 7% sobre tramo II', () => {
    const r = calculateRetention({
      subtotal: 50000,
      tax: 6000,
      supplierTaxRegime: 'GENERAL',
      withholdsIVA: false,
      withholdsISR: true,
      isrRate: 0.07,
    });
    expect(r.withheldISR).toBe(3500);
    expect(r.total).toBe(50000 + 6000 - 3500);
  });

  it('PC con ambas retenciones (IVA + ISR)', () => {
    const r = calculateRetention({
      subtotal: 2000,
      tax: 0,
      supplierTaxRegime: 'PEQUENO_CONTRIBUYENTE',
      withholdsIVA: true,
      withholdsISR: true,
      isrRate: 0.05,
    });
    expect(r.withheldIVA).toBe(100); // 5% de 2000
    expect(r.withheldISR).toBe(100); // 5% de 2000
    expect(r.total).toBe(1800);
  });

  it('proveedor sin régimen clasificado no retiene IVA aunque withholdsIVA=true', () => {
    const r = calculateRetention({
      subtotal: 1000,
      tax: 0,
      supplierTaxRegime: null,
      withholdsIVA: true,
      withholdsISR: false,
    });
    expect(r.withheldIVA).toBe(0);
  });

  it('subtotal 0 deja todo en 0', () => {
    const r = calculateRetention({
      subtotal: 0,
      tax: 0,
      supplierTaxRegime: 'GENERAL',
      withholdsIVA: true,
      withholdsISR: true,
    });
    expect(r.withheldIVA).toBe(0);
    expect(r.withheldISR).toBe(0);
    expect(r.total).toBe(0);
  });

  it('suggestedIsrRate sube a 7% si supera umbral mensual', () => {
    expect(suggestedIsrRate(20000)).toBe(ISR_RATE_TRAMO_I);
    expect(suggestedIsrRate(30000)).toBe(ISR_RATE_TRAMO_I);
    expect(suggestedIsrRate(30001)).toBe(ISR_RATE_TRAMO_II);
    expect(suggestedIsrRate(100000)).toBe(ISR_RATE_TRAMO_II);
  });

  it('redondea a 2 decimales en todos los campos', () => {
    // subtotal con cifra que produce decimales
    const r = calculateRetention({
      subtotal: 333.33,
      tax: 0,
      supplierTaxRegime: 'PEQUENO_CONTRIBUYENTE',
      withholdsIVA: true,
      withholdsISR: false,
    });
    // 333.33 * 0.05 = 16.6665 → round 16.67
    expect(r.withheldIVA).toBe(16.67);
    // total ya viene redondeado a 2 decimales por la función. Usamos
    // toBeCloseTo para evitar el bug clásico de floating point JS
    // (333.33 - 16.67 = 316.65999999999997 sin redondear).
    expect(r.total).toBeCloseTo(316.66, 2);
  });
});
