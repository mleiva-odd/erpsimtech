import { describe, it, expect } from 'vitest';
import { getExchangeRate, toFunctionalAmount, ExchangeRateError } from '../exchange-rate';

/**
 * Mock minimalista para `tx.exchangeRate.findFirst`.
 * Almacena rates en memoria y devuelve el más reciente <= fecha pedida.
 */
type Rate = {
  companyId: string;
  currency: string;
  date: Date;
  rate: number;
};

function makeMockTx(rates: Rate[] = []) {
  return {
    exchangeRate: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { companyId: string; currency: string; date?: { lte: Date } };
        orderBy?: { date: 'desc' | 'asc' };
      }) => {
        let candidates = rates.filter(
          (r) =>
            r.companyId === where.companyId &&
            r.currency === where.currency &&
            (!where.date?.lte || r.date <= where.date.lte),
        );
        if (orderBy?.date === 'desc') {
          candidates = candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
        } else {
          candidates = candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
        }
        const found = candidates[0];
        if (!found) return null;
        return { rate: found.rate, date: found.date };
      },
    },
  };
}

const companyId = 'co-1';

describe('getExchangeRate', () => {
  it('GTQ funcional retorna 1.0 sin tocar la DB', async () => {
    const tx = makeMockTx([]);
    const rate = await getExchangeRate(tx as never, companyId, 'GTQ', new Date('2026-05-12'));
    expect(rate).toBe(1.0);
  });

  it('Currency=gtq en minúsculas se normaliza a GTQ → 1.0', async () => {
    const tx = makeMockTx([]);
    const rate = await getExchangeRate(tx as never, companyId, 'gtq', new Date('2026-05-12'));
    expect(rate).toBe(1.0);
  });

  it('USD con rate exacto en la fecha devuelve ese rate', async () => {
    const tx = makeMockTx([
      { companyId, currency: 'USD', date: new Date(Date.UTC(2026, 4, 12)), rate: 7.85 },
    ]);
    const rate = await getExchangeRate(tx as never, companyId, 'USD', new Date('2026-05-12'));
    expect(rate).toBe(7.85);
  });

  it('USD con fechas previas: devuelve la más reciente <= fecha pedida', async () => {
    const tx = makeMockTx([
      { companyId, currency: 'USD', date: new Date(Date.UTC(2026, 4, 10)), rate: 7.80 },
      { companyId, currency: 'USD', date: new Date(Date.UTC(2026, 4, 11)), rate: 7.82 },
      // 12-may no tiene rate
      { companyId, currency: 'USD', date: new Date(Date.UTC(2026, 4, 13)), rate: 7.90 },
    ]);
    // Pedimos rate del 12-may → debería devolver 7.82 (del 11-may).
    const rate = await getExchangeRate(tx as never, companyId, 'USD', new Date('2026-05-12'));
    expect(rate).toBe(7.82);
  });

  it('Currency inexistente lanza ExchangeRateError(422)', async () => {
    const tx = makeMockTx([]);
    await expect(
      getExchangeRate(tx as never, companyId, 'USD', new Date('2026-05-12')),
    ).rejects.toThrow(ExchangeRateError);
  });

  it('Currency inexistente: el mensaje del error es accionable', async () => {
    const tx = makeMockTx([]);
    let thrown: unknown = null;
    try {
      await getExchangeRate(tx as never, companyId, 'EUR', new Date('2026-05-12'));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ExchangeRateError);
    expect((thrown as ExchangeRateError).status).toBe(422);
    expect((thrown as Error).message).toContain('EUR');
  });

  it('Solo respeta el companyId solicitado (aislamiento de tenant)', async () => {
    const tx = makeMockTx([
      { companyId: 'otra-empresa', currency: 'USD', date: new Date(Date.UTC(2026, 4, 12)), rate: 7.99 },
    ]);
    await expect(
      getExchangeRate(tx as never, companyId, 'USD', new Date('2026-05-12')),
    ).rejects.toThrow(ExchangeRateError);
  });
});

describe('toFunctionalAmount', () => {
  it('multiplica amount × rate y redondea a 2 decimales', () => {
    expect(toFunctionalAmount(100, 7.85)).toBe(785);
    expect(toFunctionalAmount(123.45, 7.85)).toBe(969.08); // 969.0825 → 969.08
    expect(toFunctionalAmount(0, 7.85)).toBe(0);
  });

  it('rate=1 (GTQ) → retorna el mismo monto', () => {
    expect(toFunctionalAmount(123.45, 1)).toBe(123.45);
  });

  it('inputs inválidos retornan 0 defensivo', () => {
    expect(toFunctionalAmount(NaN, 7.85)).toBe(0);
    expect(toFunctionalAmount(100, NaN)).toBe(0);
    expect(toFunctionalAmount(Infinity, 7.85)).toBe(0);
  });
});
