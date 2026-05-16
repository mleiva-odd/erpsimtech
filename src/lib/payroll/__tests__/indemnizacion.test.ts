import { describe, it, expect } from 'vitest';
import {
  calculateIndemnizacion,
  indemnizacionMonthlyProvision,
} from '../indemnizacion';

describe('payroll/indemnizacion', () => {
  it('empleado 3.5 años a Q5,000 → liquidación completa', () => {
    // hireDate 1 ene 2023, terminationDate 30 jun 2026 ≈ 3.5 años exactos.
    // 30-jun cierra el período legal del bono14 (jul-jun = 12 meses completos).
    // Si la termDate fuera 1-jul, el código correctamente paga 0 de bono14
    // proporcional (el del año anterior ya se pagó en su quincena natural,
    // el del nuevo período tiene 0 días).
    const r = calculateIndemnizacion({
      averageSalary: 5000,
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2023, 0, 1)),
      terminationDate: new Date(Date.UTC(2026, 5, 30)),
      vacationDaysTaken: 0,
    });
    expect(r.yearsOfService).toBeGreaterThan(3.4);
    expect(r.yearsOfService).toBeLessThan(3.6);
    // indemnización = 5000 * ~3.5 ≈ 17500 (tolerancia por monthsBetween=days/30).
    expect(r.indemnizacion).toBeGreaterThan(17400);
    expect(r.indemnizacion).toBeLessThan(17800);
    // bono14 prop: período jul-2025 → jun-2026 = 12 meses → 5000 completo
    expect(r.bono14Proporcional).toBeCloseTo(5000, 0);
    // aguinaldo prop: dic-2025 → jun-2026 = 7 meses → ~2917
    expect(r.aguinaldoProporcional).toBeGreaterThan(2800);
    expect(r.aguinaldoProporcional).toBeLessThan(3100);
    // vacaciones: 3.5 años * 15 = 52.5 días devengados, *166.67 ≈ 8750
    expect(r.vacacionesNoGozadas).toBeGreaterThan(8500);
    expect(r.vacacionesNoGozadas).toBeLessThan(9000);
    // total razonablemente sumado
    expect(r.total).toBeGreaterThan(33000);
    expect(r.total).toBeLessThan(36000);
  });

  it('provisión mensual = salario / 12', () => {
    expect(indemnizacionMonthlyProvision(6000)).toBe(500);
    expect(indemnizacionMonthlyProvision(0)).toBe(0);
  });

  it('empleado con vacaciones ya tomadas reduce el monto', () => {
    const r0 = calculateIndemnizacion({
      averageSalary: 5000,
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2025, 0, 1)),
      terminationDate: new Date(Date.UTC(2026, 0, 1)),
      vacationDaysTaken: 0,
    });
    const r1 = calculateIndemnizacion({
      averageSalary: 5000,
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2025, 0, 1)),
      terminationDate: new Date(Date.UTC(2026, 0, 1)),
      vacationDaysTaken: 15,
    });
    expect(r0.vacacionesNoGozadas).toBeGreaterThan(r1.vacacionesNoGozadas);
  });
});
