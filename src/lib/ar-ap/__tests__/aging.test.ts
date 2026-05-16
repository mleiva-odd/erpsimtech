import { describe, it, expect } from 'vitest';
import { computeBucket, daysOverdue } from '../aging';

describe('computeBucket', () => {
  const asOf = new Date('2026-05-12T10:00:00Z');

  it('returns current when dueDate is null', () => {
    expect(computeBucket(null, asOf)).toBe('current');
    expect(computeBucket(undefined, asOf)).toBe('current');
  });

  it('returns current when dueDate is in the future', () => {
    const future = new Date('2026-06-15T10:00:00Z');
    expect(computeBucket(future, asOf)).toBe('current');
  });

  it('returns current when dueDate equals asOf', () => {
    expect(computeBucket(asOf, asOf)).toBe('current');
  });

  it('returns d1_30 for 15 days overdue', () => {
    const due = new Date('2026-04-27T10:00:00Z'); // 15 days before asOf
    expect(computeBucket(due, asOf)).toBe('d1_30');
  });

  it('returns d31_60 for 45 days overdue', () => {
    const due = new Date('2026-03-28T10:00:00Z'); // 45 days before asOf
    expect(computeBucket(due, asOf)).toBe('d31_60');
  });

  it('returns d61_90 for 75 days overdue', () => {
    const due = new Date('2026-02-26T10:00:00Z'); // 75 days before asOf
    expect(computeBucket(due, asOf)).toBe('d61_90');
  });

  it('returns d90_plus for 100 days overdue', () => {
    const due = new Date('2026-02-01T10:00:00Z'); // 100 days before asOf
    expect(computeBucket(due, asOf)).toBe('d90_plus');
  });

  it('boundary: exactly 30 days = d1_30', () => {
    const due = new Date('2026-04-12T10:00:00Z'); // 30 days before
    expect(computeBucket(due, asOf)).toBe('d1_30');
  });

  it('boundary: exactly 31 days = d31_60', () => {
    const due = new Date('2026-04-11T10:00:00Z'); // 31 days before
    expect(computeBucket(due, asOf)).toBe('d31_60');
  });

  it('boundary: exactly 90 days = d61_90', () => {
    const due = new Date('2026-02-11T10:00:00Z'); // 90 days before
    expect(computeBucket(due, asOf)).toBe('d61_90');
  });

  it('boundary: exactly 91 days = d90_plus', () => {
    const due = new Date('2026-02-10T10:00:00Z'); // 91 days before
    expect(computeBucket(due, asOf)).toBe('d90_plus');
  });
});

describe('daysOverdue', () => {
  it('counts whole days between dates, ignoring time of day', () => {
    // NOTA: daysOverdue usa fecha LOCAL (getFullYear/getMonth/getDate, no UTC)
    // porque la contabilidad GT cuenta días por calendario local. Usar fechas
    // sin componente UTC para evitar timezone shift en el test.
    const due = new Date(2026, 4, 1); // may 1 local
    const asOf = new Date(2026, 4, 12); // may 12 local
    expect(daysOverdue(due, asOf)).toBe(11);
  });

  it('returns 0 when same day', () => {
    const due = new Date('2026-05-12T08:00:00Z');
    const asOf = new Date('2026-05-12T22:00:00Z');
    expect(daysOverdue(due, asOf)).toBe(0);
  });

  it('returns negative when asOf is before dueDate', () => {
    const due = new Date('2026-06-01T00:00:00Z');
    const asOf = new Date('2026-05-12T00:00:00Z');
    const result = daysOverdue(due, asOf);
    expect(result < 0).toBe(true);
  });
});
