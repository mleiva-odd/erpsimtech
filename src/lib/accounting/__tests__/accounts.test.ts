import { describe, it, expect } from 'vitest';
import { ACCOUNTS } from '../accounts';
import { CHART_OF_ACCOUNTS_SEED } from '../seed';

describe('ACCOUNTS constants vs seed', () => {
  const seedCodes = new Set(CHART_OF_ACCOUNTS_SEED.map((a) => a.code));

  it('cada constante ACCOUNTS apunta a una cuenta hoja del seed', () => {
    const missing: string[] = [];
    for (const [name, code] of Object.entries(ACCOUNTS)) {
      const acct = CHART_OF_ACCOUNTS_SEED.find((a) => a.code === code);
      if (!acct) {
        missing.push(`${name} (${code}) — no aparece en seed`);
      } else if (!acct.isPosting) {
        missing.push(`${name} (${code}) — es padre (no-posting)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no hay códigos huérfanos sin parent (excepto raíces 1,2,3,4,5)', () => {
    const orphans = CHART_OF_ACCOUNTS_SEED.filter((a) => {
      if (a.code === '1' || a.code === '2' || a.code === '3' || a.code === '4' || a.code === '5') return false;
      if (!a.parent) return true;
      return !seedCodes.has(a.parent);
    });
    expect(orphans).toEqual([]);
  });

  it('todas las cuentas posting tienen al menos un ancestro de tipo coincidente', () => {
    for (const acct of CHART_OF_ACCOUNTS_SEED) {
      if (!acct.isPosting) continue;
      // Verifica que el padre (si existe) tenga el mismo `type`
      if (acct.parent) {
        const parent = CHART_OF_ACCOUNTS_SEED.find((a) => a.code === acct.parent);
        expect(parent?.type).toBe(acct.type);
      }
    }
  });
});
