/**
 * Fase 25-3a · Setup global de integration tests.
 *
 * Responsabilidades:
 *  - Verificar (failsafe) que apuntamos a una DB de test, no producción.
 *  - Aplicar migraciones Prisma una vez al arrancar la suite.
 *  - Truncar TODAS las tablas entre tests (cleanup garantizado, no se
 *    contaminan datos entre casos).
 *  - Cerrar conexión Prisma al final.
 */

import { execSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { prisma } from './src/lib/prisma';

// Timeout largo configurado en vitest.config.integration.ts (`hookTimeout: 60000`).
// La firma de `beforeAll` en Vitest 2.x acepta el segundo arg como `BeforeAllListener`,
// no como número — el timeout va en config, no en el call.
beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? '';
  // Failsafe: rechazar URLs que no apuntan claramente a DB de test.
  const isTestDb =
    url.includes('simtech_test') ||
    url.includes('localhost:5433') ||
    url.includes('127.0.0.1:5433');
  if (!isTestDb) {
    throw new Error(
      `Integration tests apuntan a DB no-test (${url || 'sin DATABASE_URL'}). ` +
        'Abortando para proteger producción. Setear DATABASE_URL a simtech_test.',
    );
  }

  // Aplicar migraciones (idempotente: si ya están, no hace nada).
  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: 'inherit',
    });
  } catch (e) {
    throw new Error(
      `Error aplicando migraciones en DB de test: ${(e as Error).message}\n` +
        '¿Está corriendo el Postgres de test? Ejecutar: npm run db:test:up',
    );
  }
});

afterEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Borra TODOS los datos de la DB de test (preservando schema + migraciones).
 * Usa TRUNCATE CASCADE para no preocuparse por orden de FKs.
 */
export async function truncateAllTables(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations')
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE;`);
}
