import { describe, it, expect } from 'vitest';
import { mapAuthError, KNOWN_RAW_PATTERNS } from '../error-messages';

describe('mapAuthError', () => {
  it('mapea "Demasiados intentos..." a rate-limit', () => {
    const r = mapAuthError('Demasiados intentos. Esperá unos minutos antes de volver a probar.');
    expect(r.kind).toBe('rate-limit');
    expect(r.userMessage).toContain('Demasiados intentos');
  });

  it('mapea "La empresa está suspendida" a suspended-company', () => {
    const r = mapAuthError('La empresa está suspendida. Contacte al administrador.');
    expect(r.kind).toBe('suspended-company');
    expect(r.userMessage).toContain('suspendida');
  });

  it('mapea "Usuario inactivo" a inactive-user', () => {
    const r = mapAuthError('Usuario inactivo');
    expect(r.kind).toBe('inactive-user');
  });

  it('cae a fallback con error desconocido', () => {
    const r = mapAuthError('Some unexpected error');
    expect(r.kind).toBe('invalid-credentials');
    expect(r.userMessage).toContain('Credenciales');
  });

  it('cae a fallback con null/undefined', () => {
    expect(mapAuthError(null).kind).toBe('invalid-credentials');
    expect(mapAuthError(undefined).kind).toBe('invalid-credentials');
    expect(mapAuthError('').kind).toBe('invalid-credentials');
  });

  it('cae a fallback con CredentialsSignin (código default NextAuth)', () => {
    const r = mapAuthError('CredentialsSignin');
    expect(r.kind).toBe('invalid-credentials');
    expect(r.userMessage).not.toContain('CredentialsSignin');
  });

  it('NUNCA expone el raw técnico al usuario', () => {
    const dangerous = 'Database connection refused at host=192.168.1.5';
    const r = mapAuthError(dangerous);
    expect(r.userMessage).not.toContain('Database');
    expect(r.userMessage).not.toContain('192.168');
  });

  it('todas las KNOWN_RAW_PATTERNS son strings no vacíos', () => {
    expect(KNOWN_RAW_PATTERNS.length).toBeGreaterThan(0);
    for (const p of KNOWN_RAW_PATTERNS) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    }
  });
});
