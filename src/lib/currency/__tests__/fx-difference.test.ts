import { describe, it, expect } from 'vitest';
import { calculateFxDifference } from '../fx-difference';

describe('calculateFxDifference · COLLECTION (cobramos a un cliente)', () => {
  it('rate sube → GAIN positivo (recibimos más GTQ que lo provisionado)', () => {
    // Factura USD 100 a 7.80, cobrada a 7.85 → diferencia 0.05 × 100 = Q5.00 GAIN.
    const fx = calculateFxDifference({
      originalRate: 7.80,
      currentRate: 7.85,
      foreignAmount: 100,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx.gain).toBe(5);
    expect(fx.loss).toBe(0);
  });

  it('rate baja → LOSS (recibimos menos GTQ que la CxC libros)', () => {
    // Factura USD 100 a 7.85, cobrada a 7.70 → 0.15 × 100 = Q15.00 LOSS.
    const fx = calculateFxDifference({
      originalRate: 7.85,
      currentRate: 7.70,
      foreignAmount: 100,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx.loss).toBe(15);
    expect(fx.gain).toBe(0);
  });

  it('rate igual → sin diferencia', () => {
    const fx = calculateFxDifference({
      originalRate: 7.80,
      currentRate: 7.80,
      foreignAmount: 250,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx.gain).toBe(0);
    expect(fx.loss).toBe(0);
  });
});

describe('calculateFxDifference · PAYMENT (pagamos a un proveedor)', () => {
  it('rate sube → LOSS (pagamos más GTQ de los provisionados)', () => {
    // PO USD 200 a 7.80, pagamos a 7.85 → 0.05 × 200 = Q10 LOSS.
    const fx = calculateFxDifference({
      originalRate: 7.80,
      currentRate: 7.85,
      foreignAmount: 200,
      side: 'PAYMENT',
      currency: 'USD',
    });
    expect(fx.loss).toBe(10);
    expect(fx.gain).toBe(0);
  });

  it('rate baja → GAIN (pagamos menos GTQ de los provisionados)', () => {
    // PO USD 200 a 7.85, pagamos a 7.70 → 0.15 × 200 = Q30 GAIN.
    const fx = calculateFxDifference({
      originalRate: 7.85,
      currentRate: 7.70,
      foreignAmount: 200,
      side: 'PAYMENT',
      currency: 'USD',
    });
    expect(fx.gain).toBe(30);
    expect(fx.loss).toBe(0);
  });
});

describe('calculateFxDifference · moneda funcional GTQ', () => {
  it('currency=GTQ siempre devuelve 0/0 incluso con rates distintos', () => {
    const fx = calculateFxDifference({
      originalRate: 1.0,
      currentRate: 1.5, // imposible pero defensivo
      foreignAmount: 1000,
      side: 'COLLECTION',
      currency: 'GTQ',
    });
    expect(fx.gain).toBe(0);
    expect(fx.loss).toBe(0);
  });

  it('currency en lowercase también detectada', () => {
    const fx = calculateFxDifference({
      originalRate: 1.0,
      currentRate: 2.0,
      foreignAmount: 100,
      side: 'PAYMENT',
      currency: 'gtq',
    });
    expect(fx.gain).toBe(0);
    expect(fx.loss).toBe(0);
  });
});

describe('calculateFxDifference · inputs defensivos', () => {
  it('foreignAmount=0 → 0/0', () => {
    const fx = calculateFxDifference({
      originalRate: 7.80,
      currentRate: 7.85,
      foreignAmount: 0,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx).toEqual({ gain: 0, loss: 0 });
  });

  it('rate negativo → 0/0 (no se calcula nada raro)', () => {
    const fx = calculateFxDifference({
      originalRate: -1,
      currentRate: 7.85,
      foreignAmount: 100,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx).toEqual({ gain: 0, loss: 0 });
  });

  it('NaN/Infinity → 0/0', () => {
    const fx = calculateFxDifference({
      originalRate: NaN,
      currentRate: 7.85,
      foreignAmount: 100,
      side: 'PAYMENT',
      currency: 'USD',
    });
    expect(fx).toEqual({ gain: 0, loss: 0 });
  });
});

describe('calculateFxDifference · redondeo', () => {
  it('redondea a 2 decimales (centavos GTQ)', () => {
    // 0.0033 × 100 = 0.33
    const fx = calculateFxDifference({
      originalRate: 7.8000,
      currentRate: 7.8033,
      foreignAmount: 100,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx.gain).toBe(0.33);
  });

  it('redondeo bancario clásico: 0.005 redondea hacia arriba', () => {
    // 0.0001 × 50 = 0.005 → 0.01
    const fx = calculateFxDifference({
      originalRate: 7.8000,
      currentRate: 7.8001,
      foreignAmount: 50,
      side: 'COLLECTION',
      currency: 'USD',
    });
    expect(fx.gain).toBe(0.01);
  });
});
