import { describe, it, expect } from 'vitest';
import { calculateBono14, bono14MonthlyProvision } from '../bono14';

describe('payroll/bono14', () => {
  it('empleado contratado hace >12 meses cobra Bono14 completo (sueldo)', () => {
    const b = calculateBono14({
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2024, 0, 1)),
      payrollDate: new Date(Date.UTC(2026, 6, 14)),
    });
    expect(b).toBe(5000);
  });

  it('empleado contratado julio 2025 cobra full al pago julio 2026', () => {
    // hireDate = 1 jul 2025; periodo = 1 jul 2025 → 30 jun 2026 = 12 meses
    const b = calculateBono14({
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2025, 6, 1)),
      payrollDate: new Date(Date.UTC(2026, 6, 14)),
    });
    expect(b).toBeGreaterThan(4900);
    expect(b).toBeLessThanOrEqual(5000);
  });

  it('empleado contratado enero 2026 cobra proporcional ~6/12', () => {
    // hireDate = 1 ene 2026; periodo = 1 ene 2026 → 30 jun 2026 = 6 meses
    const b = calculateBono14({
      baseSalary: 6000,
      hireDate: new Date(Date.UTC(2026, 0, 1)),
      payrollDate: new Date(Date.UTC(2026, 6, 14)),
    });
    // 6 meses / 12 * 6000 = ~3000 (con tolerancia por días de mes 30)
    expect(b).toBeGreaterThan(2900);
    expect(b).toBeLessThan(3100);
  });

  it('empleado contratado DESPUÉS del fin del período → 0', () => {
    const b = calculateBono14({
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2026, 7, 1)), // agosto 2026
      payrollDate: new Date(Date.UTC(2026, 6, 14)),
    });
    expect(b).toBe(0);
  });

  it('provisión mensual = salario / 12', () => {
    expect(bono14MonthlyProvision(6000)).toBe(500);
    expect(bono14MonthlyProvision(12000)).toBe(1000);
    expect(bono14MonthlyProvision(0)).toBe(0);
  });
});
