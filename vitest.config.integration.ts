import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Fase 25-3a · Config de Vitest para integration tests.
 *
 * - Separada de `vitest.config.ts` (unit) porque corre serialmente, requiere
 *   Postgres real, y tiene timeouts mucho más largos.
 * - Se invoca con `--config vitest.config.integration.ts`.
 * - Carga `.env.test` ANTES de cargar `src/lib/prisma.ts` (que valida env).
 * - Solo busca `*.integration.test.ts` para no mezclar con unit tests.
 * - `singleFork: true` ejecuta todo en un único worker — necesario porque
 *   compartimos la misma DB efímera y truncamos entre tests.
 * - Sin coverage threshold: complementa al unit, no lo reemplaza.
 */

/** Mini-loader de .env.test sin agregar `dotenv` como dependencia. */
function loadDotEnvTest(): void {
  const file = path.resolve(__dirname, '.env.test');
  if (!existsSync(file)) return;
  const content = readFileSync(file, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    // Solo setea si NO está ya definida (CI tiene precedencia).
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
loadDotEnvTest();

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.integration.setup.ts'],
    include: ['src/**/__tests__/**/*.integration.test.ts'],
    exclude: ['node_modules', '.next', 'tests/e2e', 'dist'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
