import { describe, it, expect } from 'vitest';
import {
  jornadaHoursPerDay,
  hourlyRate,
  calculateOvertime,
} from '../overtime';

describe('payroll/overtime', () => {
  it('jornada base por turno (LGT art 116)', () => {
    expect(jornadaHoursPerDay('DIURNA')).toBe(8);
    expect(jornadaHoursPerDay('NOCTURNA')).toBe(6);
    expect(jornadaHoursPerDay('MIXTA')).toBe(7);
  });

  it('hora ordinaria diurna: 4800/30/8 = Q20', () => {
    expect(hourlyRate(4800, 'DIURNA')).toBe(20);
  });

  it('8 hrs extras diurnas a Q20/hr x 1.5 = Q240', () => {
    const r = calculateOvertime({
      baseSalary: 4800,
      shift: 'DIURNA',
      regularHours: 8,
      nightHours: 0,
      holidayHours: 0,
    });
    expect(r.hourlyRate).toBe(20);
    expect(r.regularAmount).toBe(240);
    expect(r.nightAmount).toBe(0);
    expect(r.holidayAmount).toBe(0);
    expect(r.total).toBe(240);
  });

  it('8 hrs extras nocturnas a Q20 x 2.0 = Q320', () => {
    // misma base, pero nocturnas
    const r = calculateOvertime({
      baseSalary: 4800,
      shift: 'DIURNA',
      regularHours: 0,
      nightHours: 8,
      holidayHours: 0,
    });
    expect(r.nightAmount).toBe(320);
    expect(r.total).toBe(320);
  });

  it('horas en feriado pagan 2.0x', () => {
    const r = calculateOvertime({
      baseSalary: 4800,
      shift: 'DIURNA',
      regularHours: 0,
      nightHours: 0,
      holidayHours: 5,
    });
    expect(r.holidayAmount).toBe(200); // 5 * 20 * 2
  });

  it('combinatoria suma correctamente', () => {
    const r = calculateOvertime({
      baseSalary: 4800,
      shift: 'DIURNA',
      regularHours: 4,
      nightHours: 4,
      holidayHours: 4,
    });
    // 4*20*1.5 + 4*20*2 + 4*20*2 = 120 + 160 + 160 = 440
    expect(r.total).toBe(440);
  });

  it('NOCTURNA: hora ordinaria es más cara (jornada más corta)', () => {
    // 4800/30/6 = 26.67
    expect(hourlyRate(4800, 'NOCTURNA')).toBe(26.67);
  });

  it('valores negativos o NaN se tratan como 0', () => {
    const r = calculateOvertime({
      baseSalary: 4800,
      shift: 'DIURNA',
      regularHours: -5,
      nightHours: NaN,
      holidayHours: 0,
    });
    expect(r.total).toBe(0);
  });
});
