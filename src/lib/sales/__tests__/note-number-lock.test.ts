import { describe, it, expect } from 'vitest';
import { reserveNoteNumber } from '../sequences';

/**
 * Mock minimal tx para validar el comportamiento de lock optimista.
 * Simula que el updateMany devuelve count=1 cuando candidate matchea el
 * estado actual de `nextNumber`, y count=0 si otro request ya lo movió.
 */
function mkTxWithSequence(initialNext = 1): { tx: unknown; getCurrent: () => number; bump: () => void } {
  let nextNumber = initialNext;
  const tx = {
    deliveryNoteSequence: {
      findUnique: async () => ({ id: 'seq1', companyId: 'c', nextNumber, prefix: 'ND-' }),
      create: async (a: { data: { companyId: string; nextNumber: number; prefix: string } }) => ({
        id: 'seq1',
        ...a.data,
      }),
      updateMany: async (a: { where: { companyId: string; nextNumber: number }; data: { nextNumber: number } }) => {
        if (a.where.nextNumber !== nextNumber) return { count: 0 };
        nextNumber = a.data.nextNumber;
        return { count: 1 };
      },
    },
    deliveryNote: {
      findMany: async () => [],
    },
  };
  return {
    tx,
    getCurrent: () => nextNumber,
    bump: () => {
      nextNumber += 1;
    },
  };
}

describe('reserveNoteNumber (Fase 20)', () => {
  it('reserva el primer correlativo y avanza el contador', async () => {
    const { tx } = mkTxWithSequence(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await reserveNoteNumber(tx as any, 'c');
    expect(r.numero).toBe(1);
    expect(r.noteNumber).toBe('ND-000001');
  });

  it('reserva consecutivos en serie', async () => {
    const { tx } = mkTxWithSequence(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r1 = await reserveNoteNumber(tx as any, 'c');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = await reserveNoteNumber(tx as any, 'c');
    expect(r1.numero).toBe(10);
    expect(r2.numero).toBe(11);
    expect(r1.noteNumber).toBe('ND-000010');
    expect(r2.noteNumber).toBe('ND-000011');
  });

  it('retry: si alguien más bumpea entre find y updateMany, reintenta', async () => {
    let attempts = 0;
    let nextNumber = 1;
    const tx = {
      deliveryNoteSequence: {
        findUnique: async () => ({ id: 'seq1', companyId: 'c', nextNumber, prefix: 'ND-' }),
        create: async () => ({ id: 'seq1', companyId: 'c', nextNumber, prefix: 'ND-' }),
        updateMany: async (a: { where: { nextNumber: number }; data: { nextNumber: number } }) => {
          attempts += 1;
          // primera vez: race-lost (alguien ya tomó).
          if (attempts === 1) {
            nextNumber += 1;
            return { count: 0 };
          }
          if (a.where.nextNumber !== nextNumber) return { count: 0 };
          nextNumber = a.data.nextNumber;
          return { count: 1 };
        },
      },
      deliveryNote: { findMany: async () => [] },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await reserveNoteNumber(tx as any, 'c');
    expect(r.numero).toBe(2); // tomó el siguiente tras la carrera
    expect(attempts).toBe(2);
  });
});
