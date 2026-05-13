import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  nextStatusAfterReception,
} from '../state-machine';

describe('purchases/state-machine', () => {
  it('DRAFT permite PENDING_APPROVAL, APPROVED y CANCELLED', () => {
    expect(canTransition('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(true);
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('DRAFT', 'INVOICED')).toBe(false);
  });

  it('PENDING_APPROVAL solo permite APPROVED o CANCELLED', () => {
    expect(canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'CANCELLED')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'RECEIVED')).toBe(false);
  });

  it('APPROVED puede ir a PARTIALLY_RECEIVED, RECEIVED, CANCELLED', () => {
    expect(canTransition('APPROVED', 'PARTIALLY_RECEIVED')).toBe(true);
    expect(canTransition('APPROVED', 'RECEIVED')).toBe(true);
    expect(canTransition('APPROVED', 'CANCELLED')).toBe(true);
    expect(canTransition('APPROVED', 'INVOICED')).toBe(false);
  });

  it('PARTIALLY_RECEIVED puede mantenerse o pasar a RECEIVED/CANCELLED', () => {
    expect(canTransition('PARTIALLY_RECEIVED', 'PARTIALLY_RECEIVED')).toBe(true);
    expect(canTransition('PARTIALLY_RECEIVED', 'RECEIVED')).toBe(true);
    expect(canTransition('PARTIALLY_RECEIVED', 'CANCELLED')).toBe(true);
    expect(canTransition('PARTIALLY_RECEIVED', 'INVOICED')).toBe(false);
  });

  it('RECEIVED solo puede ir a INVOICED o CANCELLED', () => {
    expect(canTransition('RECEIVED', 'INVOICED')).toBe(true);
    expect(canTransition('RECEIVED', 'CANCELLED')).toBe(true);
    expect(canTransition('RECEIVED', 'APPROVED')).toBe(false);
  });

  it('INVOICED solo a CANCELLED', () => {
    expect(canTransition('INVOICED', 'CANCELLED')).toBe(true);
    expect(canTransition('INVOICED', 'RECEIVED')).toBe(false);
  });

  it('CANCELLED es terminal', () => {
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false);
    expect(canTransition('CANCELLED', 'APPROVED')).toBe(false);
  });

  it('COMPLETED (legacy) solo permite CANCELLED', () => {
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(true);
    expect(canTransition('COMPLETED', 'INVOICED')).toBe(false);
  });

  it('assertTransition lanza con mensaje legible si la transición es ilegal', () => {
    expect(() => assertTransition('DRAFT', 'INVOICED')).toThrow(
      /DRAFT.*INVOICED/,
    );
  });

  it('nextStatusAfterReception: todas las líneas completas → RECEIVED', () => {
    const next = nextStatusAfterReception([
      { quantity: 10, received: 10 },
      { quantity: 5, received: 5 },
    ]);
    expect(next).toBe('RECEIVED');
  });

  it('nextStatusAfterReception: una línea incompleta → PARTIALLY_RECEIVED', () => {
    const next = nextStatusAfterReception([
      { quantity: 10, received: 10 },
      { quantity: 5, received: 3 },
    ]);
    expect(next).toBe('PARTIALLY_RECEIVED');
  });

  it('nextStatusAfterReception: tolera redondeo de 1mm (0.001)', () => {
    // 9.9999 vs 10: dentro de la tolerancia → RECEIVED
    const next = nextStatusAfterReception([{ quantity: 10, received: 9.9999 }]);
    expect(next).toBe('RECEIVED');
  });

  it('nextStatusAfterReception: 0 recibido → PARTIALLY_RECEIVED', () => {
    const next = nextStatusAfterReception([
      { quantity: 10, received: 0 },
    ]);
    expect(next).toBe('PARTIALLY_RECEIVED');
  });
});
