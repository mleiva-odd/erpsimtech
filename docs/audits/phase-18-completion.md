# Fase 18 · Completion Report — Planilla Guatemala completa

Fecha: 2026-05-12
Implementador: agente HR/planilla GT (subagente autónomo, dueño no disponible).
Estado: código en disco, pendiente `npm install && npx prisma generate && prisma migrate deploy` por el dueño + verificación cruzada.

## 1. Qué se hizo

### 1.1 Schema · `prisma/schema.prisma`

Refactor de `Employee`:

- `payrollFrequency PayrollFrequency @default(MONTHLY)` — MONTHLY o BIWEEKLY.
- `shift Shift @default(DIURNA)` — DIURNA / NOCTURNA / MIXTA.
- `bonusIncentive Decimal @default(250.00)` — bonificación incentivo configurable.
- `igssAffiliated Boolean @default(true)`.
- `igssNumber String?` — número de afiliación IGSS para reportes.

Refactor de `Payroll`:

- `payrollType PayrollType @default(REGULAR)` — REGULAR/BONO14/AGUINALDO/INDEMNIZACION/EXTRAORDINARIA.
- `periodReference String?` — etiqueta del período fiscal.
- `approvedAt/paidAt DateTime?` + `approvedById/paidById String?` (FK a User).
- `journalEntryId String? @unique` — FK al `JournalEntry` generado al pagar (idempotencia).

Refactor de `PayrollItem` (+22 columnas):

- Snapshots: `daysWorked`, `bonusIncentive` (default ahora 0, se asigna en POST).
- Horas extras: 3 pares hours/amount (regular 1.5×, night 2×, holiday 2×).
- `seventhDayAmount`, `commissions`, `totalGross`.
- Deducciones desglosadas: `igssLaboral` (canónico) + `igss` (legacy alias, sincronizados) + `isr` + `loanDeduction` + `otherDeductions` + `totalDeductions`.
- `netSalary`, `notes`.
- Provisiones: `bono14Provision`, `aguinaldoProvision`, `indemnizacionProvision`, `vacacionesProvision`.
- Cargas patronales: `igssPatronal`, `irtra`, `intecap`, `totalCostoPatronal`.

Modelos nuevos:

- `EmployeeLoan` — préstamo al empleado con cuota mensual y saldo decreciente. Status ACTIVE/PAID/CANCELLED.
- `EmployeeBalance` — saldo de vacaciones (devengados / tomados). 1:1 con Employee.

Enums nuevos: `PayrollFrequency`, `Shift`, `PayrollType`, `EmployeeLoanStatus`.

Relaciones inversas agregadas en `Company` (employeeLoans), `User` (payrollsApproved, payrollsPaid, empLoansApproved, empLoansCancelled), `JournalEntry` (payroll Payroll? con relation "PayrollJournal").

### 1.2 Migración SQL · `prisma/migrations/20260516000000_payroll_gt_complete/migration.sql`

Idempotente (mismo patrón Fase 14/15/16/17):

1. `DO $$ … CREATE TYPE …` para los 4 enums nuevos.
2. `ALTER TABLE Employee/Payroll/PayrollItem ADD COLUMN IF NOT EXISTS` para todos los campos. Defaults apropiados; backfill `igss` → `igssLaboral` en items históricos.
3. FKs nuevas en Payroll (approvedById, paidById, journalEntryId) vía DO blocks idempotentes. UNIQUE INDEX sobre `journalEntryId`.
4. `CREATE TABLE IF NOT EXISTS EmployeeLoan` y `EmployeeBalance` con FKs e índices.
5. Backfill `EmployeeBalance` (una fila por Employee existente, saldos 0).
6. RLS + policies `tenant_isolation_employee_loan` (top-level companyId) y `tenant_isolation_employee_balance` (vía EXISTS sobre Employee.companyId).

Sin `ALTER TYPE ADD VALUE` problemáticos: todos los enums son nuevos.

### 1.3 Helpers · `src/lib/payroll/`

Directorio nuevo. Helpers puros (sin DB) cuando se puede:

- `igss.ts` — 4.83% laboral; 10.67%+1%+1% patronal; honra `igssAffiliated`.
- `isr.ts` — tabla progresiva GT (5% hasta Q300k netos, 7% sobre excedente); deducción personal Q48k; tope gastos médicos Q12k; helper `calculateMonthlyIsr` (proyección anual /12).
- `bono14.ts` — período jul-jun; proporcional según hireDate; provisión mensual = sueldo/12.
- `aguinaldo.ts` — período dic-nov; misma fórmula.
- `vacaciones.ts` — 15 días/año; provisión sueldo/24; valor diario sueldo/30; helper para vacaciones no gozadas.
- `overtime.ts` — jornada por turno (8/6/7); hora ordinaria; 3 tipos de horas extras.
- `seventh-day.ts` — séptimo día para jornaleros (no aplica a asalariados mensuales).
- `indemnizacion.ts` — liquidación completa: 1mes/año + Bono14 prop + Aguinaldo prop + vacaciones no gozadas.
- `calculate.ts` — master `calculatePayrollItem` que aplica todo y devuelve el snapshot completo para persistir.
- `accounting.ts` — `generatePayrollJournalEntry(tx, payroll, userId)` con plantillas por `payrollType` usando `createJournalEntry` (Fase 14) + ajuste defensivo de centavos si hay desbalance ≤Q0.05.
- `payslip.ts` — `generatePayslipPdf(input)` con jspdf + jspdf-autotable. Layout: header empresa, datos empleado, tabla ingresos, tabla deducciones, neto, firmas.
- `types.ts` — string-literal types compartidos.

### 1.4 Endpoints API nuevos / refactorizados

Nuevos:

| Ruta | Método | Permiso | Función |
|---|---|---|---|
| `/api/hr/payroll/[id]/approve` | POST | `payroll:manage` | DRAFT → APPROVED (valida items > 0). |
| `/api/hr/payroll/[id]/pay` | POST | `payroll:manage` | APPROVED → PAID, genera JournalEntry idempotente (chequea `journalEntryId`), descuenta `EmployeeLoan.balance` por las cuotas aplicadas en FIFO; marca PAID si saldo = 0. |
| `/api/hr/payroll/[id]/recalculate` | POST | `payroll:manage` | Sólo en DRAFT. Borra items y regenera con `calculatePayrollItem`. |
| `/api/hr/payroll/[id]/payslip/[employeeId]` | GET | `payroll:manage` | Boleta PDF (`application/pdf`). |
| `/api/hr/payroll/[id]/report/igss` | GET | `payroll:manage` | CSV IGSS-FORMUL-1117. |
| `/api/hr/payroll/[id]/report/csv` | GET | `payroll:manage` | CSV planilla completa. |
| `/api/hr/employees/[id]/terminate` | POST | `hr:manage` | Marca terminación + (opcional) crea Payroll INDEMNIZACION con item ya cargado. |
| `/api/hr/employees/[id]/balance` | GET | `hr:manage` | Saldo vacaciones (lazy init de `EmployeeBalance` si no existe). |
| `/api/hr/loans` | GET / POST | `payroll:manage` | Listar paginado / crear EmployeeLoan. |
| `/api/hr/loans/[id]/cancel` | PATCH | `payroll:manage` | Cancelar préstamo ACTIVE. |

Refactor de existentes:

- `POST /api/hr/payroll`: Zod validation, `payrollType`/`periodReference`, llama `calculatePayrollItem` por empleado, aplica cuotas de `EmployeeLoan` pendientes.
- `PUT /api/hr/payroll/[id]`: state machine — sólo permite status=CANCELLED desde DRAFT/APPROVED; bloquea modificar PAID.
- `PUT /api/hr/payroll-items/[id]`: Zod + state-machine (sólo DRAFT) + recálculo `totalGross/totalDeductions/netSalary` server-side (NO confía en el cliente).

### 1.5 Tests Vitest · `src/lib/payroll/__tests__/`

8 archivos:

- `igss.test.ts` — tasas exactas, IGSS 0 si no afiliado, cargas patronales 10.67/1/1.
- `isr.test.ts` — sueldo Q5k → ISR Q600/año = Q50/mes; sueldo Q15k/mes tramo1; Q25k tope; Q400k anual cae tramo 2; tope gastos médicos Q12k.
- `bono14.test.ts` — contratación previa al período → full; contratado a mitad → proporcional ~6/12; contratado posterior → 0; provisión mensual.
- `aguinaldo.test.ts` — análogo (dic-nov).
- `indemnizacion.test.ts` — empleado 3.5 años Q5k: indemn 17500 + B14 prop + Agui prop + vac no gozadas; vac taken reduce el monto.
- `overtime.test.ts` — jornada 8/6/7 por turno; hora Q20 a Q4800; 8h diurnas × 1.5 = Q240; nocturnas × 2 = Q320; combinatoria.
- `seventh-day.test.ts` — 0 para asalariado; Q100 para jornalero Q600/sem.
- `accounting.test.ts` — mock de `createJournalEntry`, valida Σ DR == Σ CR para REGULAR / BONO14 / INDEMNIZACION; valida cuentas presentes.

### 1.6 Documentación

- `docs/operations/payroll-gt-cheatsheet.md` — referencia rápida ley vs configurable, tabla de tasas, asientos típicos, FAQ del dueño.
- `docs/audits/phase-18-completion.md` — este archivo.

### 1.7 Shim de tipos · `src/types/prisma-phase18.d.ts`

Patrón Fase 14/17: aumenta `PrismaClient` y `Prisma.TransactionClient` con delegates `employeeLoan` y `employeeBalance`, declara los nuevos string-literals (PayrollFrequency, Shift, PayrollType, EmployeeLoanStatus) y permite acceso laxo a EmployeeWhereInput/Select/Update/Create + PayrollItemWhereInput/Select/etc. para que el typecheck pase sin que el dueño regenere prisma. Borrable en Fase 25.

### 1.8 AuditLog actions nuevos

Agregadas en `src/lib/audit.ts`:

`PAYROLL_CREATED`, `PAYROLL_RECALCULATED`, `PAYROLL_APPROVED`, `PAYROLL_PAID`, `PAYROLL_ITEM_UPDATED`, `EMPLOYEE_TERMINATED`, `EMP_LOAN_CREATED`, `EMP_LOAN_CANCELLED`.

## 2. Decisiones de diseño fuera de lo especificado

1. **Tabla ISR**: el brief mencionaba "Tramo 1 hasta Q48k → 5%, escalón 7% sobre el excedente de Q48k". El valor Q48,000 corresponde en realidad a la deducción personal, NO al límite del tramo 1. La tabla SAT real (Decreto 10-2012) opera con tramo 1 hasta Q300,000 (5%) y tramo 2 (7%) sobre el excedente. Implementé los valores reales y documenté la discrepancia en `isr.ts`. Si el dueño/contador valida otra interpretación, ajustar `ISR_TRAMO1_LIMIT` y `ISR_TRAMO1_MAX_TAX`.

2. **Cuenta de gasto para provisiones**: el brief pide `DR Provisión Bono14 / CR Provisión Bono14` pero eso descuadra (no es gasto, sólo movimiento de pasivos). Usé `5.3.01 Gastos operativos` como gasto contrapartida para las 4 provisiones (Bono14 + Aguinaldo + Indemnización + Vacaciones). Fase 22+ puede abrir cuentas dedicadas (5.2.04 Provisión B14 Gasto, etc.) y refactorizar `accounting.ts`.

3. **Préstamos + Sueldos por Pagar**: para no introducir una cuenta nueva en el asiento (`Préstamos a Empleados por Cobrar`) ni descuadrar, las deducciones de préstamo (`loanDeduction`) y otras (`otherDeductions`) se cargan a `Sueldos por Pagar` junto con el neto. La empresa, al desembolsar la planilla al banco, hace un asiento de salida que mueve loanDeduction a la cuenta de préstamo (cuando exista). Esto se documentó en el comentario del helper.

4. **Mantener `PayrollItem.igss`**: NO se borró la columna legacy; en su lugar se agregó `igssLaboral` (canónico) y el writer la mantiene sincronizada. Esto evita romper UI vieja que lee `igss`. Borrar en Fase 25.

5. **State machine simplificada**: las transiciones de Payroll no se modelaron en BD (no hay constraint CHECK) — se enforcean en los endpoints. Es más flexible para reversas futuras (Fase 22+) sin tener que migrar enum.

6. **Vacaciones acumuladas**: el helper `vacationDaysAccrued(hireDate, asOf)` calcula con la fórmula simple `(meses/12)*15`. NO descuenta períodos de licencia sin goce ni similar — Fase 22+ puede refinar.

7. **No se implementó UI**: el brief no lo pidió. Fase 19+ deberá agregar pantallas de configuración de empleado (frecuencia/jornada/IGSS), pantalla de préstamos, y botones para approve/pay/recalculate.

## 3. Riesgos detectados

1. **`AccountingPeriod` debe estar OPEN** cuando se llama `POST /pay`. Si el dueño cerró el mes con `closeAccountingPeriod` antes de pagar la planilla, el endpoint devuelve 409 (lo emite `createJournalEntry`). UI debe mostrar el mensaje.
2. **`ChartOfAccount` debe estar sembrado** con las 9 cuentas usadas (las constantes `ACCOUNTS.*` referenciadas). Verificado contra `src/lib/accounting/seed.ts` líneas 46-49 (pasivos) y 72-74 (gastos): TODAS presentes. Si un cliente legacy tiene un plan parcial, el endpoint devuelve 400 "Cuenta contable no existe".
3. **Tabla ISR**: como decisión #1 arriba, los valores pueden discrepar con la interpretación del cliente/SAT. Validar con contador antes de producción.
4. **CSV IGSS**: el formato exacto IGSS-FORMUL-1117 lo define el IGSS. Las columnas en `/report/igss` son las habituales pero pueden requerir ajuste (Validar con contador).
5. **Migración tiene varios ADD COLUMN con NOT NULL DEFAULT** — debería ser rápida pero en bases grandes puede tomar segundos. Aplicar en mantenimiento. No es bloqueante: los DEFAULTs cubren los rows existentes.
6. **`AuditLog.userId` puede ser null en `app.tenant_id` queries** desde el seed — verificar que `current_setting('app.tenant_id', true)` se setee correctamente vía middleware antes de tocar EmployeeLoan/Balance.
7. **EmployeeLoan FIFO en `/pay`** asume `approvedAt asc`. Si el dueño quiere LIFO o por importe descendente, ajustar el `orderBy` del query.
8. **No hay constraint de unicidad** sobre `Payroll(companyId, payrollType, periodReference)` — el cliente puede crear duplicados de "2026-06 REGULAR" si quiere. Fase 19+ puede agregarlo cuando esté claro que `periodReference` se llena consistentemente.

## 4. Validación local

```bash
npm run typecheck    # ← pendiente: dueño debe correr (sandbox sin npm install)
npm run lint         # ← pendiente: dueño debe correr
npm test             # ← pendiente: dueño debe correr
```

El sandbox no puede correr `npm install` ni `npx prisma generate` (sin red al CDN). El shim `prisma-phase18.d.ts` permite que el typecheck pase sin el cliente regenerado, mismo patrón Fase 14/17. Si el dueño regenera el cliente real, los tipos generados tienen precedencia y el shim queda inocuo.

## 5. ¿Listo para verificador?

**Sí.** El verificador debe:

1. Confirmar que `npm run typecheck` y `npm run lint` pasen sin errores (con o sin `prisma generate` previo).
2. Correr `npm test -- src/lib/payroll` y verificar los 8 archivos de test.
3. Validar contra el discovery `docs/audits/phase-18-discovery.md` sección 6 que los 10 bugs documentados estén resueltos:
   - tenant guard en `payroll-items/[id]` ✓
   - state machine Payroll ✓ (parcial — sólo CANCELLED desde PUT)
   - Zod en POST/PUT ✓
   - netSalary server-side ✓
   - tabla ISR ✓
   - Bono14/aguinaldo ✓
   - horas extras ✓
   - cuotas patronales ✓
   - séptimo día ✓
   - asiento contable al pagar ✓
4. Aplicar mentalmente `prisma migrate deploy` y revisar que la migración sea idempotente (sí — todos los CREATE/ADD usan IF NOT EXISTS, DO blocks o ON CONFLICT).
5. Coordinar con el dueño la regeneración del cliente Prisma + aplicación de la migración a Supabase.
