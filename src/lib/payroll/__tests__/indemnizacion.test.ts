import { describe, it, expect } from 'vitest';
import {
  calculateIndemnizacion,
  indemnizacionMonthlyProvision,
} from '../indemnizacion';

describe('payroll/indemnizacion', () => {
  it('empleado 3.5 años a Q5,000 → liquidación completa', () => {
    // hireDate 1 ene 2023, terminationDate 1 jul 2026 = 42 meses = 3.5 años
    const r = calculateIndemnizacion({
      averageSalary: 5000,
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2023, 0, 1)),
      terminationDate: new Date(Date.UTC(2026, 6, 1)),
      vacationDaysTaken: 0,
    });
    expect(r.yearsOfService).toBeCloseTo(3.5, 1);
    // indemnización = 5000 * 3.5 = 17500
    expect(r.indemnizacion).toBeCloseTo(17500, 0);
    // bono14 prop: período jul-jun = 12 meses → completo 5000
    expect(r.bono14Proporcional).toBeCloseTo(5000, 0);
    // aguinaldo prop: dic-nov; hireDate < 1-dic-2025 → 12m completo desde
    // ese período. Pero terminación 1-jul-2026 → 7 meses dentro del año
    // dic 2025–nov 2026. Esperamos ~7/12 * 5000 ≈ 2917
    expect(r.aguinaldoProporcional).toBeGreaterThan(2800);
    expect(r.aguinaldoProporcional).toBeLessThan(3100);
    // vacaciones: 3.5 años * 15 = 52.5 días devengados, 0 tomados, *166.67
    // (5000/30 = 166.67) ≈ 8750
    expect(r.vacacionesNoGozadas).toBeGreaterThan(8500);
    expect(r.vacacionesNoGozadas).toBeLessThan(9000);
    // total razonablemente sumado
    expect(r.total).toBeGreaterThan(34000);
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
