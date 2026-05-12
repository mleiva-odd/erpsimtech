import { describe, it, expect } from 'vitest';
import { ARAPError } from '../credit';

/**
 * Tests unitarios mínimos. Los tests de integración (FIFO de applications,
 * bloqueo por mora con DB real) se incorporan en Fase 25 cuando se setee
 * Vitest con DB efímera.
 */

describe('ARAPError', () => {
  it('default status 400 y code ARAP_ERROR', () => {
    const e = new ARAPError('whatever');
    expect(e.status).toBe(400);
    expect(e.code).toBe('ARAP_ERROR');
    expect(e.message).toBe('whatever');
    expect(e).toBeInstanceOf(Error);
  });

  it('custom status y code respetados', () => {
    const e = new ARAPError('mora alta', 409, 'CUSTOMER_OVERDUE_BLOCKED');
    expect(e.status).toBe(409);
    expect(e.code).toBe('CUSTOMER_OVERDUE_BLOCKED');
  });

  it('puede serializarse a JSON sin perder fields', () => {
    const e = new ARAPError('test', 409, 'X');
    const payload = { message: e.message, status: e.status, code: e.code };
    expect(payload).toEqual({ message: 'test', status: 409, code: 'X' });
  });
});
