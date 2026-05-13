import { describe, it, expect } from 'vitest';
import { canTransitionSale } from '../state-machine';

describe('canTransitionSale (Fase 20)', () => {
  it('QUOTE → ORDER permitido', () => {
    expect(canTransitionSale('QUOTE', 'ORDER')).toBe(true);
  });

  it('QUOTE → CANCELLED permitido', () => {
    expect(canTransitionSale('QUOTE', 'CANCELLED')).toBe(true);
  });

  it('QUOTE → INVOICED NO permitido (debe pasar por ORDER → DELIVERED)', () => {
    expect(canTransitionSale('QUOTE', 'INVOICED')).toBe(false);
  });

  it('ORDER → PARTIALLY_DELIVERED permitido', () => {
    expect(canTransitionSale('ORDER', 'PARTIALLY_DELIVERED')).toBe(true);
  });

  it('ORDER → DELIVERED permitido (despacho 100% en un solo paso)', () => {
    expect(canTransitionSale('ORDER', 'DELIVERED')).toBe(true);
  });

  it('PARTIALLY_DELIVERED → DELIVERED permitido', () => {
    expect(canTransitionSale('PARTIALLY_DELIVERED', 'DELIVERED')).toBe(true);
  });

  it('DELIVERED → INVOICED permitido', () => {
    expect(canTransitionSale('DELIVERED', 'INVOICED')).toBe(true);
  });

  it('INVOICED → DELIVERED NO permitido (no se puede retroceder)', () => {
    expect(canTransitionSale('INVOICED', 'DELIVERED')).toBe(false);
  });

  it('CANCELLED es terminal', () => {
    expect(canTransitionSale('CANCELLED', 'QUOTE')).toBe(false);
    expect(canTransitionSale('CANCELLED', 'ORDER')).toBe(false);
    expect(canTransitionSale('CANCELLED', 'INVOICED')).toBe(false);
  });

  it('COMPLETED → CANCELLED permitido (legacy POS)', () => {
    expect(canTransitionSale('COMPLETED', 'CANCELLED')).toBe(true);
  });

  it('Transición a sí mismo es idempotente', () => {
    expect(canTransitionSale('ORDER', 'ORDER')).toBe(true);
  });
});
