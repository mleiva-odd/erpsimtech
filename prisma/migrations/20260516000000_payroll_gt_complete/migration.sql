-- Fase 18 · Planilla Guatemala completa (ISR, IGSS, Bono 14, Aguinaldo,
-- Indemnización, Vacaciones, Horas Extras, Séptimo Día, EmployeeLoan,
-- EmployeeBalance + asiento contable de planilla).
--
-- Esta migración:
--   1. Crea enums PayrollFrequency, Shift, PayrollType, EmployeeLoanStatus.
--   2. Agrega columnas a Employee (payrollFrequency, shift, bonusIncentive,
--      igssAffiliated, igssNumber).
--   3. Agrega columnas a Payroll (payrollType, periodReference, approvedAt,
--      paidAt, approvedById, paidById, journalEntryId).
--   4. Agrega ~22 columnas a PayrollItem (snapshots, horas extras, séptimo
--      día, deducciones, provisiones, cargas patronales).
--   5. Crea tablas EmployeeLoan y EmployeeBalance.
--   6. Habilita RLS + policies tenant_isolation_* en tablas nuevas.
--
-- IDEMPOTENTE: todos los CREATE/ALTER se protegen contra duplicado.
-- Re-aplicar es seguro.
--
-- Nota (lección Fase 17, SqlState 55P04): los valores nuevos de enum
-- agregados por ALTER TYPE ADD VALUE no pueden usarse en la misma
-- migración. Aquí ningún ADD VALUE referencia tipo previo; todos los
-- enums son nuevos (CREATE TYPE), por lo que pueden usarse en el mismo
-- archivo.

-- ─────────────────────────────────────────
-- 1) ENUMS nuevos (idempotente)
-- ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PayrollFrequency" AS ENUM ('MONTHLY', 'BIWEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Shift" AS ENUM ('DIURNA', 'NOCTURNA', 'MIXTA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PayrollType" AS ENUM (
    'REGULAR', 'BONO14', 'AGUINALDO', 'INDEMNIZACION', 'EXTRAORDINARIA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EmployeeLoanStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2) Columnas nuevas en Employee
-- ─────────────────────────────────────────

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "payrollFrequency" "PayrollFrequency" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "shift"            "Shift"            NOT NULL DEFAULT 'DIURNA',
  ADD COLUMN IF NOT EXISTS "bonusIncentive"   DECIMAL(10,2)      NOT NULL DEFAULT 250.00,
  ADD COLUMN IF NOT EXISTS "igssAffiliated"   BOOLEAN            NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "igssNumber"       TEXT;

-- ─────────────────────────────────────────
-- 3) Columnas nuevas en Payroll
-- ─────────────────────────────────────────

ALTER TABLE "Payroll"
  ADD COLUMN IF NOT EXISTS "payrollType"     "PayrollType" NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN IF NOT EXISTS "periodReference" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById"    TEXT,
  ADD COLUMN IF NOT EXISTS "paidById"        TEXT,
  ADD COLUMN IF NOT EXISTS "journalEntryId"  TEXT;

-- FKs nuevas en Payroll (idempotente vía DO block).
DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_paidById_fkey"
      FOREIGN KEY ("paidById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_journalEntryId_fkey"
      FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_journalEntryId_key"
  ON "Payroll"("journalEntryId");

CREATE INDEX IF NOT EXISTS "Payroll_companyId_payrollType_periodReference_idx"
  ON "Payroll"("companyId", "payrollType", "periodReference");

-- ─────────────────────────────────────────
-- 4) Columnas nuevas en PayrollItem (~22)
-- ─────────────────────────────────────────
--
-- Nota: el column `igss` legacy (NOT NULL sin default) se preserva. Lo nuevo
-- vive en `igssLaboral` (idéntico valor). Mantenemos ambos durante 1
-- release para no romper la UI vieja; el writer escribe ambos.

ALTER TABLE "PayrollItem"
  ADD COLUMN IF NOT EXISTS "daysWorked"             INTEGER       NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "overtimeRegularHours"   DECIMAL(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtimeRegularAmount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtimeNightHours"     DECIMAL(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtimeNightAmount"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtimeHolidayHours"   DECIMAL(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtimeHolidayAmount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "seventhDayAmount"       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissions"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalGross"             DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "igssLaboral"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "loanDeduction"          DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDeductions"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bono14Provision"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aguinaldoProvision"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "indemnizacionProvision" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vacacionesProvision"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "igssPatronal"           DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "irtra"                  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "intecap"                DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCostoPatronal"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notes"                  TEXT;

-- Backfill: para los items existentes, copiar `igss` → `igssLaboral` y
-- calcular `totalGross`/`totalDeductions` mínimo en base a lo que ya hay.
UPDATE "PayrollItem"
SET
  "igssLaboral"     = COALESCE(NULLIF("igssLaboral", 0), "igss"),
  "totalGross"      = COALESCE(NULLIF("totalGross", 0), "baseSalary" + "bonusIncentive" + "otherBonuses"),
  "totalDeductions" = COALESCE(NULLIF("totalDeductions", 0), "igss" + "isr" + "otherDeductions");

-- Bajar default a 0 de bonusIncentive en items históricos NO se toca
-- (snapshot inmutable). El default del modelo cambia a 0 — sólo afecta
-- nuevos inserts vía Prisma.
ALTER TABLE "PayrollItem"
  ALTER COLUMN "bonusIncentive" SET DEFAULT 0;

-- ─────────────────────────────────────────
-- 5) Tabla EmployeeLoan
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EmployeeLoan" (
  "id"               TEXT NOT NULL,
  "companyId"        TEXT NOT NULL,
  "employeeId"       TEXT NOT NULL,
  "amount"           DECIMAL(10,2) NOT NULL,
  "balance"          DECIMAL(10,2) NOT NULL,
  "monthlyDeduction" DECIMAL(10,2) NOT NULL,
  "status"           "EmployeeLoanStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason"           TEXT,
  "approvedById"     TEXT NOT NULL,
  "approvedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt"      TIMESTAMP(3),
  "cancelledById"    TEXT,
  "notes"            TEXT,
  CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeLoan_companyId_fkey"
    FOREIGN KEY ("companyId")  REFERENCES "Company"("id")  ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "EmployeeLoan_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeLoan_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeLoan_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id")  ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmployeeLoan_companyId_employeeId_idx"
  ON "EmployeeLoan"("companyId", "employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeLoan_companyId_status_idx"
  ON "EmployeeLoan"("companyId", "status");

-- ─────────────────────────────────────────
-- 6) Tabla EmployeeBalance
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EmployeeBalance" (
  "id"                  TEXT NOT NULL,
  "employeeId"          TEXT NOT NULL,
  "vacationDaysAccrued" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "vacationDaysTaken"   DECIMAL(6,2) NOT NULL DEFAULT 0,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeBalance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeBalance_employeeId_key"
  ON "EmployeeBalance"("employeeId");

-- Backfill: una fila EmployeeBalance por cada Employee existente (saldos en 0).
INSERT INTO "EmployeeBalance" ("id", "employeeId", "vacationDaysAccrued", "vacationDaysTaken", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 0, 0, CURRENT_TIMESTAMP
FROM "Employee" e
ON CONFLICT ("employeeId") DO NOTHING;

-- ─────────────────────────────────────────
-- 7) RLS en tablas nuevas (patrón Fase 13/14/15/16/17)
-- ─────────────────────────────────────────

ALTER TABLE "EmployeeLoan"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeBalance" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_employee_loan" ON "EmployeeLoan";
CREATE POLICY "tenant_isolation_employee_loan" ON "EmployeeLoan"
  USING (current_setting('app.tenant_id', true) = "companyId"::text)
  WITH CHECK (current_setting('app.tenant_id', true) = "companyId"::text);

-- EmployeeBalance no tiene companyId directo: derivar via Employee.companyId.
DROP POLICY IF EXISTS "tenant_isolation_employee_balance" ON "EmployeeBalance";
CREATE POLICY "tenant_isolation_employee_balance" ON "EmployeeBalance"
  USING (EXISTS (
    SELECT 1 FROM "Employee" e
    WHERE e."id" = "EmployeeBalance"."employeeId"
      AND current_setting('app.tenant_id', true) = e."companyId"::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Employee" e
    WHERE e."id" = "EmployeeBalance"."employeeId"
      AND current_setting('app.tenant_id', true) = e."companyId"::text
  ));
