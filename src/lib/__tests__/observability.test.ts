import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Test del contract de observability.ts (Fase 35).
 *
 * Garantiza que:
 *   - Sin SENTRY_DSN, captureException SOLO loguea (no rompe).
 *   - withCapture re-throws después de capturar (no silencia errores).
 *   - captureMessage acepta info|warning|error sin lanzar.
 */

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  },
}));

describe('observability — Sentry wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  it('captureException no lanza si Sentry está desactivado', async () => {
    const mod = await import('../observability');
    expect(() => mod.captureException(new Error('test'))).not.toThrow();
    expect(() => mod.captureException('string error')).not.toThrow();
    expect(() => mod.captureException({ custom: 'obj' })).not.toThrow();
  });

  it('captureMessage no lanza con cualquier nivel', async () => {
    const mod = await import('../observability');
    expect(() => mod.captureMessage('test info')).not.toThrow();
    expect(() => mod.captureMessage('test warn', 'warning')).not.toThrow();
    expect(() => mod.captureMessage('test error', 'error')).not.toThrow();
  });

  it('withCapture re-throws después de capturar', async () => {
    const mod = await import('../observability');
    const boom = mod.withCapture(async () => {
      throw new Error('boom');
    });
    await expect(boom()).rejects.toThrow('boom');
  });

  it('withCapture devuelve el valor si no hay error', async () => {
    const mod = await import('../observability');
    const ok = mod.withCapture(async (x: number) => x * 2);
    expect(await ok(21)).toBe(42);
  });

  it('isEnabled es false sin DSN (test env)', async () => {
    const mod = await import('../observability');
    expect(mod.observability.isEnabled()).toBe(false);
  });
});
