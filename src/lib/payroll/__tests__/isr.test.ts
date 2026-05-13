import { describe, it, expect } from 'vitest';
import {
  ISR_TRAMO1_LIMIT,
  ISR_TRAMO1_RATE,
  ISR_TRAMO2_RATE,
  DEDUCCION_PERSONAL,
  calculateAnnualIsr,
  monthlyIsrWithholding,
  calculateMonthlyIsr,
} from '../isr';

describe('payroll/isr', () => {
  it('expone parámetros legales', () => {
    expect(ISR_TRAMO1_LIMIT).toBe(300000);
    expect(ISR_TRAMO1_RATE).toBe(0.05);
    expect(ISR_TRAMO2_RATE).toBe(0.07);
    expect(DEDUCCION_PERSONAL).toBe(48000);
  });

  it('renta neta ≤ 0 → ISR 0 (sueldo bajo, deducciones cubren)', () => {
    // Q4,000/mes (Q48k/año) − Q48k deducción = 0
    const isr = calculateAnnualIsr({ annualSalary: 48000, annualIgss: 0 });
    expect(isr).toBe(0);
  });

  it('sueldo Q5,000/mes (Q60k/año), sin IGSS afecto adicional', () => {
    // 60,000 − 48,000 (deducción) − 0 IGSS = 12,000 afecto * 5% = Q600 anual
    const isr = calculateAnnualIsr({ annualSalary: 60000, annualIgss: 0 });
    expect(isr).toBe(600);
    expect(monthlyIsrWithholding(isr)).toBe(50);
  });

  it('sueldo Q5,000/mes con IGSS retenido anual Q2,898', () => {
    // 60,000 − 48,000 − 2,898 = 9,102 * 5% = 455.10
    const isr = calculateAnnualIsr({
      annualSalary: 60000,
      annualIgss: 2898, // 5000 * 0.0483 * 12
    });
    expect(isr).toBe(455.1);
  });

  it('sueldo alto Q400,000/año cae en tramo 2 (7%)', () => {
    // 400,000 − 48,000 = 352,000 afecto
    // 352,000 > 300,000 → 15,000 + (52,000 * 7%) = 15,000 + 3,640 = 18,640
    const isr = calculateAnnualIsr({ annualSalary: 400000, annualIgss: 0 });
    expect(isr).toBe(18640);
  });

  it('aplica tope de gastos médicos comprobados Q12,000', () => {
    // 60,000 − 48,000 − 12,000 (tope) = 0 → ISR 0
    const isrCapado = calculateAnnualIsr({
      annualSalary: 60000,
      annualIgss: 0,
      gastosMedicosOC: 50000, // intenta declarar más, se topea
    });
    expect(isrCapado).toBe(0);
  });

  it('atajo calculateMonthlyIsr coincide con anual/12', () => {
    // Q15,000/mes = Q180k/año, sin IGSS, sin gastos
    // 180k − 48k = 132k * 5% = 6,600 anual → 550 mensual
    const monthly = calculateMonthlyIsr({
      monthlyAfectoSalary: 15000,
      monthlyIgss: 0,
    });
    expect(monthly).toBe(550);
  });

  it('Q25,000/mes (Q300k/año) cae justo al tope del tramo 1', () => {
    // 300k − 48k = 252k * 5% = 12,600 anual → 1,050 mensual
    const m = calculateMonthlyIsr({
      monthlyAfectoSalary: 25000,
      monthlyIgss: 0,
    });
    expect(m).toBe(1050);
  });
});
