import { describe, it, expect } from 'vitest';
import {
  generateResetToken,
  hashResetToken,
  constantTimeEqual,
} from '../password-reset';

/**
 * Fase 31b · Tests unitarios de helpers crypto.
 *
 * Tests con DB van en integration (fuera de scope acá).
 */

describe('password-reset · helpers crypto', () => {
  it('generateResetToken produce strings url-safe únicos', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
    // base64url no incluye + / =
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → base64url ≈ 43 chars
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('hashResetToken es determinístico y produce hex 64', () => {
    const t = 'token-fijo-test-12345';
    const h1 = hashResetToken(t);
    const h2 = hashResetToken(t);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashResetToken difiere para tokens distintos', () => {
    const a = hashResetToken('token-a');
    const b = hashResetToken('token-b');
    expect(a).not.toBe(b);
  });

  it('constantTimeEqual devuelve true para strings iguales', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
  });

  it('constantTimeEqual devuelve false para strings distintos', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
  });

  it('constantTimeEqual devuelve false para longitudes distintas', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
