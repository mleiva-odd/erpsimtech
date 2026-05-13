import { describe, it, expect } from 'vitest';
import { calculateSeventhDayPay } from '../seventh-day';

describe('payroll/seventh-day', () => {
  it('empleado mensual (no jornalero) → 0 (ya incluido)', () => {
    expect(
      calculateSeventhDayPay({
        isJornalero: false,
        weeklyEarnings: 600,
        weeksInPeriod: 4,
      }),
    ).toBe(0);
  });

  it('jornalero Q100/día * 6 días = Q600 → séptimo Q100', () => {
    const r = calculateSeventhDayPay({
      isJornalero: true,
      weeklyEarnings: 600,
      weeksInPeriod: 1,
    });
    expect(r).toBe(100);
  });

  it('jornalero 4 semanas, Q600 c/u → Q400 séptimos día acumulado', () => {
    const r = calculateSeventhDayPay({
      isJornalero: true,
      weeklyEarnings: 600,
      weeksInPeriod: 4,
    });
    expect(r).toBe(400);
  });

  it('sin earnings o semanas → 0', () => {
    expect(
      calculateSeventhDayPay({
        isJornalero: true,
        weeklyEarnings: 0,
        weeksInPeriod: 4,
      }),
    ).toBe(0);
    expect(
      calculateSeventhDayPay({
        isJornalero: true,
        weeklyEarnings: 600,
        weeksInPeriod: 0,
      }),
    ).toBe(0);
  });
});
