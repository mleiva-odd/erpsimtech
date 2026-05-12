import { describe, it, expect } from 'vitest';
import { reserveCorrelativo } from '../series';
import { FelError } from '../types';

/**
 * Mock simple de `Prisma.TransactionClient` para `taxSeries` que simula
 * concurrencia: el método `updateMany` solo cuenta 1 si el `where` matchea
 * exactamente el estado actual. Si no, devuelve count=0 (lock perdido).
 */
function makeMockTx(initial: {
  id: string;
  companyId: string;
  branchId: string;
  documentType: 'FACT' | 'NCRE' | 'NDEB';
  prefix: string;
  nextNumber: number;
  rangeFrom?: number | null;
  rangeTo?: number | null;
  active?: boolean;
}) {
  const state = { ...initial, active: initial.active ?? true };
  return {
    taxSeries: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (
          where.companyId !== state.companyId ||
          where.branchId !== state.branchId ||
          where.documentType !== state.documentType
        ) {
          return null;
        }
        if (where.active !== undefined && where.active !== state.active) return null;
        if (where.prefix !== undefined && where.prefix !== state.prefix) return null;
        return { ...state };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; nextNumber?: number };
        data: { nextNumber: number };
      }) => {
        if (where.id !== state.id) return { count: 0 };
        if (where.nextNumber !== undefined && where.nextNumber !== state.nextNumber) {
          return { count: 0 };
        }
        state.nextNumber = data.nextNumber;
        return { count: 1 };
      },
    },
    _state: state,
  };
}

describe('reserveCorrelativo', () => {
  it('Reserva un correlativo y avanza el nextNumber', async () => {
    const tx = makeMockTx({
      id: 'series-1',
      companyId: 'c1',
      branchId: 'b1',
      documentType: 'FACT',
      prefix: 'A',
      nextNumber: 1,
    });

    const r = await reserveCorrelativo(tx as unknown as Parameters<typeof reserveCorrelativo>[0], {
      companyId: 'c1',
      branchId: 'b1',
      documentType: 'FACT',
    });
    expect(r.numero).toBe(1);
    expect(r.prefix).toBe('A');
    expect(r.numeroDisplay).toBe('A-000001');
    expect(tx._state.nextNumber).toBe(2);
  });

  it('Falla con FelError si no hay serie configurada', async () => {
    const tx = makeMockTx({
      id: 's1',
      companyId: 'c1',
      branchId: 'b1',
      documentType: 'FACT',
      prefix: 'A',
      nextNumber: 1,
    });
    await expect(
      reserveCorrelativo(tx as unknown as Parameters<typeof reserveCorrelativo>[0], {
        companyId: 'c2', // distinta
        branchId: 'b1',
        documentType: 'FACT',
      }),
    ).rejects.toBeInstanceOf(FelError);
  });

  it('Falla si el rangeTo está agotado', async () => {
    const tx = makeMockTx({
      id: 's1',
      companyId: 'c1',
      branchId: 'b1',
      documentType: 'FACT',
      prefix: 'A',
      nextNumber: 1001,
      rangeFrom: 1,
      rangeTo: 1000,
    });
    await expect(
      reserveCorrelativo(tx as unknown as Parameters<typeof reserveCorrelativo>[0], {
        companyId: 'c1',
        branchId: 'b1',
        documentType: 'FACT',
      }),
    ).rejects.toThrow(/agotado/i);
  });

  it('Dos llamadas concurrentes sobre el mismo mock no deberían colisionar', async () => {
    // Como nuestro mock es estado mutable serial, dos awaits paralelos no
    // representan verdadera concurrencia, pero verificamos que las
    // dos respuestas son distintas y consistentes.
    const tx = makeMockTx({
      id: 's1',
      companyId: 'c1',
      branchId: 'b1',
      documentType: 'FACT',
      prefix: 'A',
      nextNumber: 1,
    });

    const [a, b] = await Promise.all([
      reserveCorrelativo(tx as unknown as Parameters<typeof reserveCorrelativo>[0], {
        companyId: 'c1',
        branchId: 'b1',
        documentType: 'FACT',
      }),
      reserveCorrelativo(tx as unknown as Parameters<typeof reserveCorrelativo>[0], {
        companyId: 'c1',
        branchId: 'b1',
        documentType: 'FACT',
      }),
    ]);
    expect(a.numero).not.toBe(b.numero);
    expect([a.numero, b.numero].sort()).toEqual([1, 2]);
  });
});
