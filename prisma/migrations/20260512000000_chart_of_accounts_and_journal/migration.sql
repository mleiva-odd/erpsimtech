-- Fase 14 · Plan de cuentas + Partida doble + Cierre de período.
--
-- Esta migración:
--   1. Crea enums `AccountType2` y `PeriodStatus`.
--   2. Crea tablas `ChartOfAccount`, `AccountingPeriod`, `JournalEntry`,
--      `JournalLine`.
--   3. Agrega columna `migrated` a `AccountingEntry` (para auditoría de la
--      migración legacy → JournalEntry).
--   4. Inserta el plan de cuentas estándar GT para cada empresa existente.
--   5. Crea período mensual OPEN actual (2026-05) para cada empresa.
--   6. Migra cada `AccountingEntry` legacy a `JournalEntry` con dos líneas:
--        - INCOME → DR Caja (o Bancos si tiene bankTransactionId) / CR Ventas
--        - EXPENSE → DR Gastos Operativos / CR Caja (o Bancos)
--      Marca `AccountingEntry.migrated = true` para auditoría.
--
-- IMPORTANTE: NO se dropean `AccountingEntry` ni `AccountingCategory`.
-- Eso queda para una migración futura (Fase 25 cleanup) después de validar
-- al menos 1 mes que JournalEntry refleja correctamente la realidad.
--
-- Esta migración es **totalmente idempotente**: re-aplicarla después de un
-- fallo parcial no rompe. Cada CREATE TYPE/TABLE/INDEX/POLICY se protege
-- contra "already exists". Los INSERTs usan ON CONFLICT DO NOTHING. Los
-- UPDATEs son condicionales.
--
-- Historial: la versión inicial fallaba en producción con
--   ERROR 42804: column "status" is of type "PeriodStatus" but expression
--   is of type text
-- porque los literales `'OPEN'` en INSERT INTO ... SELECT no se autocastean
-- al enum. La fix: `'OPEN'::"PeriodStatus"` explícito. Aprovechamos el
-- arreglo para hacer toda la migración idempotente.

-- ─────────────────────────────────────────
-- 1) ENUMS (idempotente)
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "AccountType2" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) TABLAS NUEVAS (idempotente)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ChartOfAccount" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "type"      "AccountType2" NOT NULL,
  "parentId"  TEXT,
  "isPosting" BOOLEAN NOT NULL DEFAULT true,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChartOfAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChartOfAccount_companyId_code_key" ON "ChartOfAccount"("companyId", "code");
CREATE INDEX IF NOT EXISTS "ChartOfAccount_companyId_type_idx" ON "ChartOfAccount"("companyId", "type");
CREATE INDEX IF NOT EXISTS "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");

CREATE TABLE IF NOT EXISTS "AccountingPeriod" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "year"       INTEGER NOT NULL,
  "month"      INTEGER NOT NULL,
  "status"     "PeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt"   TIMESTAMP(3),
  "closedById" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_companyId_year_month_key" ON "AccountingPeriod"("companyId", "year", "month");
CREATE INDEX IF NOT EXISTS "AccountingPeriod_companyId_status_idx" ON "AccountingPeriod"("companyId", "status");

CREATE TABLE IF NOT EXISTS "JournalEntry" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "branchId"      TEXT,
  "periodId"      TEXT NOT NULL,
  "date"          TIMESTAMP(3) NOT NULL,
  "description"   TEXT NOT NULL,
  "referenceType" TEXT,
  "referenceId"   TEXT,
  "userId"        TEXT NOT NULL,
  "posted"        BOOLEAN NOT NULL DEFAULT true,
  "postedAt"      TIMESTAMP(3),
  "reversedById"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_reversedById_key" ON "JournalEntry"("reversedById");
CREATE INDEX IF NOT EXISTS "JournalEntry_companyId_date_idx" ON "JournalEntry"("companyId", "date");
CREATE INDEX IF NOT EXISTS "JournalEntry_companyId_posted_idx" ON "JournalEntry"("companyId", "posted");
CREATE INDEX IF NOT EXISTS "JournalEntry_periodId_idx" ON "JournalEntry"("periodId");
CREATE INDEX IF NOT EXISTS "JournalEntry_referenceType_referenceId_idx" ON "JournalEntry"("referenceType", "referenceId");

CREATE TABLE IF NOT EXISTS "JournalLine" (
  "id"           TEXT NOT NULL,
  "journalId"    TEXT NOT NULL,
  "accountId"    TEXT NOT NULL,
  "debit"        DECIMAL(15,2) NOT NULL DEFAULT 0,
  "credit"       DECIMAL(15,2) NOT NULL DEFAULT 0,
  "description"  TEXT,
  "costCenterId" TEXT,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX IF NOT EXISTS "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- ─────────────────────────────────────────
-- 3) AccountingEntry.migrated (auditoría de migración legacy)
-- ─────────────────────────────────────────

ALTER TABLE "AccountingEntry"
  ADD COLUMN IF NOT EXISTS "migrated" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────
-- 4) Seed del plan de cuentas para cada empresa existente
-- ─────────────────────────────────────────

-- Uso un CTE con la definición canónica del plan de cuentas (igual a
-- src/lib/accounting/seed.ts). Para cada empresa que aún no tenga cuentas,
-- inserto el árbol entero. Padres antes que hijos.

-- Padres (no-posting) e hijas (posting) en una sola tabla derivada.
WITH coa_seed(code, name, "type", parent_code, is_posting) AS (
  VALUES
    -- Activo
    ('1',       'Activo',                      'ASSET',     NULL,    false),
    ('1.1',     'Activo Corriente',            'ASSET',     '1',     false),
    ('1.1.01',  'Caja',                        'ASSET',     '1.1',   true),
    ('1.1.02',  'Bancos',                      'ASSET',     '1.1',   true),
    ('1.1.04',  'Clientes',                    'ASSET',     '1.1',   true),
    ('1.1.05',  'IVA Crédito Fiscal',          'ASSET',     '1.1',   true),
    ('1.2',     'Activo No Corriente',         'ASSET',     '1',     false),
    ('1.2.01',  'Inventario',                  'ASSET',     '1.2',   true),
    ('1.2.02',  'Inmuebles y Equipo',          'ASSET',     '1.2',   true),
    -- Pasivo
    ('2',       'Pasivo',                      'LIABILITY', NULL,    false),
    ('2.1',     'Pasivo Corriente',            'LIABILITY', '2',     false),
    ('2.1.01',  'Proveedores',                 'LIABILITY', '2.1',   true),
    ('2.1.02',  'IVA Débito Fiscal',           'LIABILITY', '2.1',   true),
    ('2.1.03',  'ISR Retenido por Pagar',      'LIABILITY', '2.1',   true),
    ('2.1.04',  'IGSS por Pagar',              'LIABILITY', '2.1',   true),
    ('2.1.05',  'Sueldos por Pagar',           'LIABILITY', '2.1',   true),
    ('2.1.06',  'Provisión Bono 14',           'LIABILITY', '2.1',   true),
    ('2.1.07',  'Provisión Aguinaldo',         'LIABILITY', '2.1',   true),
    ('2.1.08',  'Provisión Indemnización',     'LIABILITY', '2.1',   true),
    -- Patrimonio
    ('3',       'Patrimonio',                  'EQUITY',    NULL,    false),
    ('3.1',     'Capital',                     'EQUITY',    '3',     false),
    ('3.1.01',  'Capital Social',              'EQUITY',    '3.1',   true),
    ('3.2',     'Resultados',                  'EQUITY',    '3',     false),
    ('3.2.01',  'Utilidades Retenidas',        'EQUITY',    '3.2',   true),
    ('3.2.02',  'Utilidad del Ejercicio',      'EQUITY',    '3.2',   true),
    -- Ingresos
    ('4',       'Ingresos',                    'INCOME',    NULL,    false),
    ('4.1',     'Ingresos Operativos',         'INCOME',    '4',     false),
    ('4.1.01',  'Ventas',                      'INCOME',    '4.1',   true),
    ('4.1.02',  'Devoluciones sobre Ventas',   'INCOME',    '4.1',   true),
    ('4.2',     'Otros Ingresos',              'INCOME',    '4',     false),
    ('4.2.01',  'Diferencia Cambiaria (Ingreso)', 'INCOME', '4.2',   true),
    -- Egresos
    ('5',       'Egresos',                     'EXPENSE',   NULL,    false),
    ('5.1',     'Costo de Ventas',             'EXPENSE',   '5',     false),
    ('5.1.01',  'Costo de Ventas',             'EXPENSE',   '5.1',   true),
    ('5.2',     'Gastos de Personal',          'EXPENSE',   '5',     false),
    ('5.2.01',  'Sueldos y Salarios',          'EXPENSE',   '5.2',   true),
    ('5.2.02',  'IGSS Patronal (Gasto)',       'EXPENSE',   '5.2',   true),
    ('5.2.03',  'Bonificación Incentivo',      'EXPENSE',   '5.2',   true),
    ('5.3',     'Gastos Operativos',           'EXPENSE',   '5',     false),
    ('5.3.01',  'Gastos Operativos',           'EXPENSE',   '5.3',   true),
    ('5.3.02',  'Gastos Bancarios',            'EXPENSE',   '5.3',   true),
    ('5.4',     'Otros Gastos',                'EXPENSE',   '5',     false),
    ('5.4.01',  'Diferencia Cambiaria (Gasto)','EXPENSE',   '5.4',   true)
)
INSERT INTO "ChartOfAccount" ("id", "companyId", "code", "name", "type", "isPosting", "active", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  s.code,
  s.name,
  s."type"::"AccountType2",
  s.is_posting,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN coa_seed s
ON CONFLICT ("companyId", "code") DO NOTHING;

-- Vincular parentId (segunda pasada, ya con todos los códigos creados).
UPDATE "ChartOfAccount" child
SET "parentId" = parent."id"
FROM "ChartOfAccount" parent,
  (VALUES
    ('1.1', '1'), ('1.1.01', '1.1'), ('1.1.02', '1.1'), ('1.1.04', '1.1'), ('1.1.05', '1.1'),
    ('1.2', '1'), ('1.2.01', '1.2'), ('1.2.02', '1.2'),
    ('2.1', '2'), ('2.1.01', '2.1'), ('2.1.02', '2.1'), ('2.1.03', '2.1'),
    ('2.1.04', '2.1'), ('2.1.05', '2.1'), ('2.1.06', '2.1'), ('2.1.07', '2.1'), ('2.1.08', '2.1'),
    ('3.1', '3'), ('3.1.01', '3.1'), ('3.2', '3'), ('3.2.01', '3.2'), ('3.2.02', '3.2'),
    ('4.1', '4'), ('4.1.01', '4.1'), ('4.1.02', '4.1'), ('4.2', '4'), ('4.2.01', '4.2'),
    ('5.1', '5'), ('5.1.01', '5.1'),
    ('5.2', '5'), ('5.2.01', '5.2'), ('5.2.02', '5.2'), ('5.2.03', '5.2'),
    ('5.3', '5'), ('5.3.01', '5.3'), ('5.3.02', '5.3'),
    ('5.4', '5'), ('5.4.01', '5.4')
  ) AS hierarchy(child_code, parent_code)
WHERE child."code" = hierarchy.child_code
  AND parent."code" = hierarchy.parent_code
  AND child."companyId" = parent."companyId"
  AND child."parentId" IS NULL;

-- ─────────────────────────────────────────
-- 5) Período actual OPEN (2026-05) para cada empresa existente
-- ─────────────────────────────────────────
-- FIX 2026-05-12: el literal 'OPEN' necesita cast explícito a "PeriodStatus".
-- Sin el cast PostgreSQL reporta:
--   ERROR 42804: column "status" is of type "PeriodStatus"
--   but expression is of type text

INSERT INTO "AccountingPeriod" ("id", "companyId", "year", "month", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 2026, 5, 'OPEN'::"PeriodStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "year", "month") DO NOTHING;

-- ─────────────────────────────────────────
-- 6) Migración de AccountingEntry legacy → JournalEntry
-- ─────────────────────────────────────────
-- Regla:
--   INCOME  → DR Caja (1.1.01)        / CR Ventas (4.1.01)
--   EXPENSE → DR Gastos Op (5.3.01)   / CR Caja (1.1.01)
--   Si `bankTransactionId` está seteado, sustituir Caja por Bancos (1.1.02).
--
-- Cada AccountingEntry queda mapeado a UN JournalEntry con DOS JournalLine.
-- También se crea (o resuelve) el AccountingPeriod del año/mes de la fecha
-- original — para entries históricos previos a 2026-05, se crean períodos
-- adicionales OPEN.

-- Primero: crear AccountingPeriod para cada (companyId, year, month) que
-- aparezca en AccountingEntry y aún no exista.
INSERT INTO "AccountingPeriod" ("id", "companyId", "year", "month", "status", "createdAt", "updatedAt")
SELECT DISTINCT
  gen_random_uuid()::text,
  ae."companyId",
  EXTRACT(YEAR FROM ae."date")::int,
  EXTRACT(MONTH FROM ae."date")::int,
  'OPEN'::"PeriodStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AccountingEntry" ae
WHERE ae."migrated" = false
ON CONFLICT ("companyId", "year", "month") DO NOTHING;

-- Segundo: crear JournalEntry para cada AccountingEntry no migrado.
-- Usamos el mismo `id` del AccountingEntry como `id` del JournalEntry
-- (son TEXT/uuid en ambos lados) para facilitar trazabilidad bidireccional
-- y permitir backout simple (DELETE FROM JournalEntry WHERE id IN
--   (SELECT id FROM AccountingEntry WHERE migrated = true)).
INSERT INTO "JournalEntry" (
  "id", "companyId", "branchId", "periodId", "date", "description",
  "referenceType", "referenceId", "userId", "posted", "postedAt", "createdAt"
)
SELECT
  ae."id",
  ae."companyId",
  ae."branchId",
  ap."id",
  ae."date",
  COALESCE(ae."description", '(migrado de AccountingEntry)'),
  COALESCE(ae."referenceType", 'LEGACY_MIGRATION'),
  ae."referenceId",
  ae."userId",
  true,
  ae."date",
  ae."createdAt"
FROM "AccountingEntry" ae
JOIN "AccountingPeriod" ap
  ON ap."companyId" = ae."companyId"
  AND ap."year" = EXTRACT(YEAR FROM ae."date")::int
  AND ap."month" = EXTRACT(MONTH FROM ae."date")::int
WHERE ae."migrated" = false
ON CONFLICT ("id") DO NOTHING;

-- Tercero: crear las dos líneas (DR / CR) para cada JournalEntry recién migrado.
-- INCOME → DR Caja|Bancos / CR Ventas
INSERT INTO "JournalLine" ("id", "journalId", "accountId", "debit", "credit", "description")
SELECT
  gen_random_uuid()::text,
  je."id",
  cash."id",
  ae."amount"::numeric(15,2),
  0,
  'Caja/Bancos (migración legacy)'
FROM "AccountingEntry" ae
JOIN "JournalEntry" je ON je."id" = ae."id"
JOIN "ChartOfAccount" cash
  ON cash."companyId" = ae."companyId"
  AND cash."code" = (CASE WHEN ae."bankTransactionId" IS NOT NULL THEN '1.1.02' ELSE '1.1.01' END)
WHERE ae."migrated" = false
  AND ae."type" = 'INCOME'
  AND NOT EXISTS (SELECT 1 FROM "JournalLine" jl WHERE jl."journalId" = je."id");

INSERT INTO "JournalLine" ("id", "journalId", "accountId", "debit", "credit", "description")
SELECT
  gen_random_uuid()::text,
  je."id",
  sales."id",
  0,
  ae."amount"::numeric(15,2),
  'Ventas (migración legacy)'
FROM "AccountingEntry" ae
JOIN "JournalEntry" je ON je."id" = ae."id"
JOIN "ChartOfAccount" sales
  ON sales."companyId" = ae."companyId"
  AND sales."code" = '4.1.01'
WHERE ae."migrated" = false
  AND ae."type" = 'INCOME'
  -- Solo si ya está la línea DR (idempotencia + verifica que no doblemos)
  AND (SELECT COUNT(*) FROM "JournalLine" jl WHERE jl."journalId" = je."id") = 1;

-- EXPENSE → DR Gastos Op / CR Caja|Bancos
INSERT INTO "JournalLine" ("id", "journalId", "accountId", "debit", "credit", "description")
SELECT
  gen_random_uuid()::text,
  je."id",
  opex."id",
  ae."amount"::numeric(15,2),
  0,
  'Gastos Operativos (migración legacy)'
FROM "AccountingEntry" ae
JOIN "JournalEntry" je ON je."id" = ae."id"
JOIN "ChartOfAccount" opex
  ON opex."companyId" = ae."companyId"
  AND opex."code" = '5.3.01'
WHERE ae."migrated" = false
  AND ae."type" = 'EXPENSE'
  AND NOT EXISTS (SELECT 1 FROM "JournalLine" jl WHERE jl."journalId" = je."id");

INSERT INTO "JournalLine" ("id", "journalId", "accountId", "debit", "credit", "description")
SELECT
  gen_random_uuid()::text,
  je."id",
  cash."id",
  0,
  ae."amount"::numeric(15,2),
  'Caja/Bancos (migración legacy)'
FROM "AccountingEntry" ae
JOIN "JournalEntry" je ON je."id" = ae."id"
JOIN "ChartOfAccount" cash
  ON cash."companyId" = ae."companyId"
  AND cash."code" = (CASE WHEN ae."bankTransactionId" IS NOT NULL THEN '1.1.02' ELSE '1.1.01' END)
WHERE ae."migrated" = false
  AND ae."type" = 'EXPENSE'
  AND (SELECT COUNT(*) FROM "JournalLine" jl WHERE jl."journalId" = je."id") = 1;

-- Cuarto: marcar como migrados.
UPDATE "AccountingEntry"
SET "migrated" = true
WHERE "migrated" = false
  AND EXISTS (SELECT 1 FROM "JournalEntry" je WHERE je."id" = "AccountingEntry"."id");

-- ─────────────────────────────────────────
-- 7) RLS en tablas nuevas (consistente con Fase 13)
-- ─────────────────────────────────────────

ALTER TABLE "ChartOfAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountingPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;

-- Policies idempotentes: DROP IF EXISTS antes de CREATE.
DROP POLICY IF EXISTS "tenant_isolation_chart" ON "ChartOfAccount";
CREATE POLICY "tenant_isolation_chart" ON "ChartOfAccount"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_period" ON "AccountingPeriod";
CREATE POLICY "tenant_isolation_period" ON "AccountingPeriod"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_journal" ON "JournalEntry";
CREATE POLICY "tenant_isolation_journal" ON "JournalEntry"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

DROP POLICY IF EXISTS "tenant_isolation_journal_line" ON "JournalLine";
CREATE POLICY "tenant_isolation_journal_line" ON "JournalLine"
  USING (EXISTS (
    SELECT 1 FROM "JournalEntry" je
    WHERE je."id" = "JournalLine"."journalId"
      AND current_setting('app.tenant_id', true) = je."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "JournalEntry" je
    WHERE je."id" = "JournalLine"."journalId"
      AND current_setting('app.tenant_id', true) = je."companyId"::text
  ));
