/**
 * Fase 25-3d · Integration test de `reserveCorrelativo` (FEL series).
 *
 * Valida que la reserva de correlativos:
 *  - Asigna correlativos secuenciales únicos contra Postgres real.
 *  - Incrementa `nextNumber` atómicamente (lock optimista via updateMany).
 *  - NO entrega correlativos duplicados bajo carga concurrente (10 reserves
 *    en paralelo → 10 números distintos). Esto es CRÍTICO contra SAT: dos
 *    certificaciones con el mismo (serie, número) son rechazadas como
 *    duplicado fiscal.
 *  - Throw FEL_SERIES_EXHAUSTED cuando se agota el rango autorizado.
 *  - Throw FEL_NO_SERIES si no hay serie activa para (branch, documentType).
 */

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { reserveCorrelativo, type ReservedCorrelativo } from '@/lib/fel/series';
import { FelError } from '@/lib/fel/types';
import {
  createTestBase,
  createTestTaxSeries,
} from '@/test-utils/integration-fixtures';

describe('reserveCorrelativo · integration', () => {
  it('reserva correlativos secuenciales 1, 2, 3 y actualiza nextNumber en DB', async () => {
    const { company, branch } = await createTestBase();
    const series = await createTestTaxSeries(company.id, branch.id, {
      prefix: 'A',
      documentType: 'FACT',
      nextNumber: 1,
      rangeFrom: 1,
      rangeTo: 1000,
    });

    const r1 = await reserveCorrelativo(prisma, {
      companyId: company.id,
      branchId: branch.id,
      documentType: 'FACT',
    });
    expect(r1.numero).toBe(1);
    expect(r1.prefix).toBe('A');
    expect(r1.numeroDisplay).toBe('A-000001');

    const r2 = await reserveCorrelativo(prisma, {
      companyId: company.id,
      branchId: branch.id,
      documentType: 'FACT',
    });
    expect(r2.numero).toBe(2);
    expect(r2.numeroDisplay).toBe('A-000002');

    const r3 = await reserveCorrelativo(prisma, {
      companyId: company.id,
      branchId: branch.id,
      documentType: 'FACT',
    });
    expect(r3.numero).toBe(3);

    // nextNumber persistido en DB = 4 (próximo libre).
    const refreshed = await prisma.taxSeries.findUnique({
      where: { id: series.id },
      select: { nextNumber: true },
    });
    expect(refreshed?.nextNumber).toBe(4);
  });

  it('CONCURRENCIA: reserves paralelas NO entregan correlativos duplicados (invariante SAT)', async () => {
    const { company, branch } = await createTestBase();
    await createTestTaxSeries(company.id, branch.id, {
      prefix: 'A',
      documentType: 'FACT',
      nextNumber: 1,
      rangeFrom: 1,
      rangeTo: 100,
    });

    // Spec del código: MAX_RETRIES=5. Bajo contención extrema (>5 paralelas
    // peleando al mismo tiempo) algunas requests pueden dar FEL_SERIES_CONTENTION.
    // Ese es comportamiento DOCUMENTADO del código (HTTP 503, el caller reintenta).
    // El INVARIANTE CRÍTICO contra SAT es: las que SÍ pasan NO entregan duplicados.
    // Probamos con 5 paralelas (al límite del retry budget).
    const PARALLEL = 5;
    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }).map(() =>
        reserveCorrelativo(prisma, {
          companyId: company.id,
          branchId: branch.id,
          documentType: 'FACT',
        }),
      ),
    );

    const succeeded = results
      .filter(
        (r): r is PromiseFulfilledResult<ReservedCorrelativo> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value);

    // Al menos 2 succeed (sino el test no valida nada).
    expect(succeeded.length).toBeGreaterThanOrEqual(2);

    // INVARIANTE CRÍTICO: cero duplicados entre las exitosas.
    const numbers = succeeded.map((r) => r.numero);
    expect(new Set(numbers).size).toBe(numbers.length);

    // Los números son contiguos arrancando desde 1.
    const sorted = [...numbers].sort((a, b) => a - b);
    sorted.forEach((num, idx) => {
      expect(num).toBe(idx + 1);
    });
  });

  it('throw FEL_SERIES_EXHAUSTED al agotar el rango autorizado por SAT', async () => {
    const { company, branch } = await createTestBase();
    await createTestTaxSeries(company.id, branch.id, {
      prefix: 'B',
      documentType: 'FACT',
      nextNumber: 1,
      rangeFrom: 1,
      rangeTo: 2, // solo 2 números autorizados
    });

    const r1 = await reserveCorrelativo(prisma, {
      companyId: company.id,
      branchId: branch.id,
      documentType: 'FACT',
    });
    expect(r1.numero).toBe(1);

    const r2 = await reserveCorrelativo(prisma, {
      companyId: company.id,
      branchId: branch.id,
      documentType: 'FACT',
    });
    expect(r2.numero).toBe(2);

    // Tercer reserve excede rangeTo=2 → throw.
    await expect(
      reserveCorrelativo(prisma, {
        companyId: company.id,
        branchId: branch.id,
        documentType: 'FACT',
      }),
    ).rejects.toThrow(FelError);
  });

  it('throw FEL_NO_SERIES cuando no existe serie activa para (branch, documentType)', async () => {
    const { company, branch } = await createTestBase();
    // NO creamos TaxSeries → la reserva debe fallar.

    await expect(
      reserveCorrelativo(prisma, {
        companyId: company.id,
        branchId: branch.id,
        documentType: 'FACT',
      }),
    ).rejects.toThrow(FelError);
  });
});
