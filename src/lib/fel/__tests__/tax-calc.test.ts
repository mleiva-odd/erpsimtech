import { describe, it, expect } from 'vitest';
import { calculateLineTax, sumTaxLines } from '../tax-calc';

describe('calculateLineTax', () => {
  it('GENERAL: aplica 12% sobre subtotal post-descuento', () => {
    const r = calculateLineTax({
      unitPrice: 100,
      quantity: 1,
      discount: 0,
      isTaxExempt: false,
      companyTaxRegime: 'GENERAL',
    });
    expect(r.taxRate).toBe(0.12);
    expect(r.subtotal).toBe(100);
    expect(r.tax).toBe(12);
    expect(r.total).toBe(112);
  });

  it('PEQUEÑO_CONTRIBUYENTE: aplica 5% sobre subtotal post-descuento', () => {
    const r = calculateLineTax({
      unitPrice: 100,
      quantity: 2,
      discount: 0,
      isTaxExempt: false,
      companyTaxRegime: 'PEQUENO_CONTRIBUYENTE',
    });
    expect(r.taxRate).toBe(0.05);
    expect(r.subtotal).toBe(200);
    expect(r.tax).toBe(10);
    expect(r.total).toBe(210);
  });

  it('Producto exento: tax=0 SIEMPRE, independiente del régimen GENERAL', () => {
    const r = calculateLineTax({
      unitPrice: 100,
      quantity: 3,
      discount: 0,
      isTaxExempt: true,
      companyTaxRegime: 'GENERAL',
    });
    expect(r.taxRate).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.subtotal).toBe(300);
    expect(r.total).toBe(300);
  });

  it('Producto exento: tax=0 SIEMPRE, independiente del régimen PEQUEÑO', () => {
    const r = calculateLineTax({
      unitPrice: 50,
      quantity: 2,
      discount: 0,
      isTaxExempt: true,
      companyTaxRegime: 'PEQUENO_CONTRIBUYENTE',
    });
    expect(r.tax).toBe(0);
    expect(r.taxRate).toBe(0);
  });

  it('Descuento en GTQ reduce el subtotal antes de IVA (General)', () => {
    const r = calculateLineTax({
      unitPrice: 100,
      quantity: 1,
      discount: 20,
      isTaxExempt: false,
      companyTaxRegime: 'GENERAL',
    });
    expect(r.subtotal).toBe(80);
    expect(r.tax).toBe(9.6);
    expect(r.total).toBe(89.6);
  });

  it('Descuento que iguala el bruto deja subtotal y tax en 0', () => {
    const r = calculateLineTax({
      unitPrice: 100,
      quantity: 1,
      discount: 100,
      isTaxExempt: false,
      companyTaxRegime: 'GENERAL',
    });
    expect(r.subtotal).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(0);
  });

  it('Descuento mayor al bruto lanza error', () => {
    expect(() =>
      calculateLineTax({
        unitPrice: 100,
        quantity: 1,
        discount: 150,
        isTaxExempt: false,
        companyTaxRegime: 'GENERAL',
      }),
    ).toThrowError(/no puede ser negativo/);
  });

  it('Cantidad <= 0 lanza error', () => {
    expect(() =>
      calculateLineTax({
        unitPrice: 100,
        quantity: 0,
        discount: 0,
        isTaxExempt: false,
        companyTaxRegime: 'GENERAL',
      }),
    ).toThrowError(/Cantidad/);
  });

  it('Precio unitario negativo lanza error', () => {
    expect(() =>
      calculateLineTax({
        unitPrice: -10,
        quantity: 1,
        discount: 0,
        isTaxExempt: false,
        companyTaxRegime: 'GENERAL',
      }),
    ).toThrowError(/Precio unitario/);
  });

  it('Descuento negativo lanza error', () => {
    expect(() =>
      calculateLineTax({
        unitPrice: 100,
        quantity: 1,
        discount: -5,
        isTaxExempt: false,
        companyTaxRegime: 'GENERAL',
      }),
    ).toThrowError(/Descuento/);
  });

  it('Redondea tax a 2 decimales (GENERAL sobre 33.33 = 4.00)', () => {
    const r = calculateLineTax({
      unitPrice: 33.33,
      quantity: 1,
      discount: 0,
      isTaxExempt: false,
      companyTaxRegime: 'GENERAL',
    });
    expect(r.tax).toBe(4);
    expect(r.total).toBe(37.33);
  });

  it('Cantidades grandes (1000 unidades x 99.99) sin overflow', () => {
    const r = calculateLineTax({
      unitPrice: 99.99,
      quantity: 1000,
      discount: 0,
      isTaxExempt: false,
      companyTaxRegime: 'GENERAL',
    });
    expect(r.subtotal).toBe(99990);
    expect(r.tax).toBe(11998.8);
    expect(r.total).toBe(111988.8);
  });
});

describe('sumTaxLines', () => {
  it('Suma 3 líneas y reporta totales redondeados', () => {
    const lines = [
      { subtotal: 100, tax: 12, total: 112, taxRate: 0.12 },
      { subtotal: 50, tax: 6, total: 56, taxRate: 0.12 },
      { subtotal: 10, tax: 0, total: 10, taxRate: 0 }, // exento
    ];
    const r = sumTaxLines(lines);
    expect(r.subtotal).toBe(160);
    expect(r.tax).toBe(18);
    expect(r.total).toBe(178);
  });

  it('Lista vacía devuelve ceros', () => {
    const r = sumTaxLines([]);
    expect(r.subtotal).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(0);
  });
});
