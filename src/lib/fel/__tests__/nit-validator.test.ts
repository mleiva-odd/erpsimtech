import { describe, it, expect } from 'vitest';
import { validateGuatemalanNit, isValidNit, isCF } from '../nit-validator';

/**
 * Helper local — calcula el dígito verificador de un cuerpo de NIT GT.
 * Útil para no hardcodear NITs reales en los tests; en su lugar generamos
 * un cuerpo arbitrario y consultamos cuál sería el verificador correcto.
 */
function expectedChecker(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[i]);
    const weight = body.length + 1 - i;
    sum += digit * weight;
  }
  const mod = sum % 11;
  const computed = mod === 0 ? 0 : 11 - mod;
  if (computed === 10) return 'K';
  if (computed === 11) return '0';
  return String(computed);
}

describe('validateGuatemalanNit', () => {
  it('Acepta "CF" tal cual', () => {
    const r = validateGuatemalanNit('CF');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('CF');
  });

  it('Acepta "cf" minúsculas y normaliza', () => {
    const r = validateGuatemalanNit('cf');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('CF');
  });

  it('Rechaza null/undefined/vacío', () => {
    expect(validateGuatemalanNit(null).ok).toBe(false);
    expect(validateGuatemalanNit(undefined).ok).toBe(false);
    expect(validateGuatemalanNit('').ok).toBe(false);
  });

  it('Acepta NIT válido construido con verificador correcto', () => {
    const body = '1234567';
    const checker = expectedChecker(body);
    const r = validateGuatemalanNit(`${body}${checker}`);
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe(`${body}${checker}`);
  });

  it('Acepta NIT con guion antes del verificador', () => {
    const body = '1234567';
    const checker = expectedChecker(body);
    const r = validateGuatemalanNit(`${body}-${checker}`);
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe(`${body}${checker}`);
  });

  it('Rechaza NIT con verificador incorrecto', () => {
    const body = '1234567';
    const correct = expectedChecker(body);
    const wrong = correct === '0' ? '1' : '0';
    const r = validateGuatemalanNit(`${body}${wrong}`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/verificador/i);
  });

  it('Rechaza NIT con caracteres no numéricos en el cuerpo', () => {
    const r = validateGuatemalanNit('12A45678');
    expect(r.ok).toBe(false);
  });

  it('Verificador K es aceptado cuando corresponde', () => {
    // Busco un body cuya función dé verificador K (mod=1).
    let found: { body: string; checker: string } | null = null;
    for (let n = 1; n < 10000 && !found; n++) {
      const body = String(n);
      const c = expectedChecker(body);
      if (c === 'K') found = { body, checker: c };
    }
    expect(found).not.toBeNull();
    const { body, checker } = found!;
    const r = validateGuatemalanNit(`${body}${checker}`);
    expect(r.ok).toBe(true);
    // Acepta también minúscula 'k' después de toUpperCase.
    const r2 = validateGuatemalanNit(`${body}${checker.toLowerCase()}`);
    expect(r2.ok).toBe(true);
  });

  it('NIT demasiado corto (1 char) es rechazado', () => {
    const r = validateGuatemalanNit('1');
    expect(r.ok).toBe(false);
  });

  it('isValidNit es atajo booleano correcto', () => {
    expect(isValidNit('CF')).toBe(true);
    expect(isValidNit('')).toBe(false);
  });

  it('isCF reconoce variantes', () => {
    expect(isCF('CF')).toBe(true);
    expect(isCF('cf')).toBe(true);
    expect(isCF('  cf ')).toBe(true);
    expect(isCF('12345678')).toBe(false);
    expect(isCF(null)).toBe(false);
  });
});
