import { describe, it, expect } from 'vitest';
import {
  calculateAguinaldo,
  aguinaldoMonthlyProvision,
} from '../aguinaldo';

describe('payroll/aguinaldo', () => {
  it('empleado con >12 meses cobra aguinaldo completo', () => {
    const a = calculateAguinaldo({
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2024, 0, 1)),
      payrollDate: new Date(Date.UTC(2026, 11, 15)),
    });
    expect(a).toBe(5000);
  });

  it('empleado contratado junio 2026 cobra proporcional ~6/12', () => {
    // periodo 1 dic 2025 → 30 nov 2026; hireDate 1 jun 2026 → ~6 meses
    const a = calculateAguinaldo({
      baseSalary: 6000,
      hireDate: new Date(Date.UTC(2026, 5, 1)),
      payrollDate: new Date(Date.UTC(2026, 11, 15)),
    });
    expect(a).toBeGreaterThan(2900);
    expect(a).toBeLessThan(3100);
  });

  it('provisión mensual = salario / 12', () => {
    expect(aguinaldoMonthlyProvision(6000)).toBe(500);
    expect(aguinaldoMonthlyProvision(0)).toBe(0);
  });

  it('hire date posterior al fin del período → 0', () => {
    const a = calculateAguinaldo({
      baseSalary: 5000,
      hireDate: new Date(Date.UTC(2027, 0, 1)),
      payrollDate: new Date(Date.UTC(2026, 11, 15)),
    });
    expect(a).toBe(0);
  });
});
