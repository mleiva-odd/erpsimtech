import { describe, it, expect } from 'vitest';
import { nextStatusAfterReception } from '../state-machine';

/**
 * Simulación pura de GRN parcial: el endpoint real (POST .../grn) hace todo
 * dentro de una $transaction Prisma. Acá testeamos la lógica determinística
 * de avance de estado dada la acumulación de quantityReceived por item.
 *
 * Para tests de integración con DB ver tests/e2e (Playwright + Supabase test).
 */
describe('purchases/grn-partial · state advance logic', () => {
  it('PO con 2 líneas: GRN1 cubre la línea 1 → PARTIALLY_RECEIVED', () => {
    // PO: A=10, B=5
    // GRN1: A=10 (línea 2 sigue en 0)
    const next = nextStatusAfterReception([
      { quantity: 10, received: 10 },
      { quantity: 5, received: 0 },
    ]);
    expect(next).toBe('PARTIALLY_RECEIVED');
  });

  it('GRN2 completa el resto → RECEIVED', () => {
    const next = nextStatusAfterReception([
      { quantity: 10, received: 10 },
      { quantity: 5, received: 5 },
    ]);
    expect(next).toBe('RECEIVED');
  });

  it('GRN1 entrega parcial de TODAS las líneas → PARTIALLY_RECEIVED', () => {
    // PO: A=10, B=10
    // GRN1: A=4, B=6 (parcial en ambas)
    const next = nextStatusAfterReception([
      { quantity: 10, received: 4 },
      { quantity: 10, received: 6 },
    ]);
    expect(next).toBe('PARTIALLY_RECEIVED');
  });

  it('GRN entrega cantidades fraccionarias (granel) → respeta decimales', () => {
    // 1.5 kg de A, 0.25 kg de B
    const next = nextStatusAfterReception([
      { quantity: 1.5, received: 1.5 },
      { quantity: 0.25, received: 0.25 },
    ]);
    expect(next).toBe('RECEIVED');
  });

  it('GRN sobre PO sin recepciones previas → PARTIALLY_RECEIVED si queda pendiente', () => {
    const next = nextStatusAfterReception([
      { quantity: 100, received: 30 },
    ]);
    expect(next).toBe('PARTIALLY_RECEIVED');
  });

  it('PO ya completamente recibida → RECEIVED', () => {
    const next = nextStatusAfterReception([
      { quantity: 7, received: 7 },
    ]);
    expect(next).toBe('RECEIVED');
  });

  it('PO con cantidades 0 en todas las líneas → RECEIVED trivial', () => {
    // edge case defensivo: no debería pasar en producción
    const next = nextStatusAfterReception([{ quantity: 0, received: 0 }]);
    expect(next).toBe('RECEIVED');
  });
});
