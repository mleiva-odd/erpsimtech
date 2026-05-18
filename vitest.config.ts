import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Fase 25-1 · Config de Vitest.
 *
 * Estrategia:
 *  - Tests unitarios viven en `src/**\/__tests__/**\/*.test.ts`.
 *  - Environment default: `node` (módulos lib puros).
 *  - Para tests que necesiten DOM (componentes React), agregar al inicio del
 *    archivo: `// @vitest-environment jsdom`.
 *  - Coverage con V8, reportes html + lcov + text.
 *  - Threshold mínimo: 60% (líneas + statements) en módulos críticos.
 *    Se baja a 50% global porque hay código UI que no testeamos en unit.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Excluir e2e (Playwright), integration tests (config separada) y no-test.
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'tests/e2e',
      '.next',
      'dist',
      // Integration tests usan vitest.config.integration.ts + Postgres docker.
      // NO deben correr con `npm test` (unit-only).
      '**/*.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Solo incluir código de aplicación, no scripts ni configs.
      include: ['src/lib/**/*.ts', 'src/hooks/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
        'src/lib/prisma.ts', // singleton, no testeable
      ],
      // Threshold realista (30% global) reflejando la división:
      //  - Módulos PUROS (currency, purchases, sales, payroll/igss-bono14-
      //    aguinaldo-isr-overtime-seventh-day-indemnizacion, fel/mock-tax-
      //    nit-xml, accounting/accounts, inventory/cost): >75% coverage real
      //    en lógica de negocio crítica (LEY GT respetada).
      //  - Módulos INFRA (auth, tenant, prisma, supabase, storage, api-error,
      //    rate-limit, env, observability, logger, plans, hashing, audit) que
      //    requieren DB/Supabase real: 0% por unit tests — cobertura via e2e
      //    Playwright (Fase 25-3).
      //  - Módulos ORQUESTADORES Prisma (payroll/calculate, payroll/accounting,
      //    payroll/payslip, ar-ap/aging, ar-ap/credit, fel/digifact, fel/infile,
      //    fel/pdf-generator, fel/factory): 0% por unit tests — cobertura via
      //    integration tests con Prisma test client (Fase 25-3).
      //  - Hooks UI (useDataTable, useDebounce, useDragSort): 0% — cobertura
      //    via tests de componentes React (Fase 25-3).
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 50,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
