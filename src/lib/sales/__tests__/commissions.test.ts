import { describe, it, expect } from 'vitest';
import { calculateCommissions, type CommissionRuleLike, type CommissionSaleItemLike } from '../commissions';

const items: CommissionSaleItemLike[] = [
  { productId: 'p1', subtotal: 1000, unitCost: 600, quantity: 1, categoryId: 'electronics' },
  { productId: 'p2', subtotal: 500, unitCost: 200, quantity: 1, categoryId: 'food' },
];

describe('calculateCommissions (Fase 20)', () => {
  it('basis=SUBTOTAL, sin categoría: 5% del subtotal total', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: null, basis: 'SUBTOTAL', rate: 0.05, active: true },
    ];
    const res = calculateCommissions(items, rules);
    expect(res).toHaveLength(1);
    expect(res[0].ruleId).toBe('r1');
    expect(res[0].amount).toBeCloseTo(75); // 5% de 1500
  });

  it('basis=MARGIN, sin categoría: 10% del margen total', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: null, basis: 'MARGIN', rate: 0.1, active: true },
    ];
    const res = calculateCommissions(items, rules);
    // margen = (1000-600) + (500-200) = 400 + 300 = 700
    expect(res[0].amount).toBeCloseTo(70);
  });

  it('basis=SUBTOTAL filtrado por categoría', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: 'electronics', basis: 'SUBTOTAL', rate: 0.1, active: true },
    ];
    const res = calculateCommissions(items, rules);
    expect(res[0].amount).toBeCloseTo(100); // 10% solo de p1
  });

  it('regla inactiva no genera', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: null, basis: 'SUBTOTAL', rate: 0.05, active: false },
    ];
    expect(calculateCommissions(items, rules)).toHaveLength(0);
  });

  it('múltiples reglas se acumulan', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: null, basis: 'SUBTOTAL', rate: 0.05, active: true },
      { id: 'r2', companyId: 'c', categoryId: 'electronics', basis: 'MARGIN', rate: 0.05, active: true },
    ];
    const res = calculateCommissions(items, rules);
    expect(res).toHaveLength(2);
    expect(res[0].amount).toBeCloseTo(75);
    expect(res[1].amount).toBeCloseTo(20); // 5% de margen electronics (400)
  });

  it('regla con base 0 no produce comisión', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: 'inexistente', basis: 'SUBTOTAL', rate: 0.05, active: true },
    ];
    expect(calculateCommissions(items, rules)).toHaveLength(0);
  });

  it('vincula employeeId al output', () => {
    const rules: CommissionRuleLike[] = [
      { id: 'r1', companyId: 'c', categoryId: null, basis: 'SUBTOTAL', rate: 0.01, active: true },
    ];
    const res = calculateCommissions(items, rules, { employeeId: 'emp-42' });
    expect(res[0].employeeId).toBe('emp-42');
  });
});
