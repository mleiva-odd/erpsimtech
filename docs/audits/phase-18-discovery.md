# Fase 18 · Discovery · Planilla Guatemala completa

Fecha: 2026-05-11
Auditor: HR/payroll GT (read-only)
Objetivo: validar el plan de Fase 18 contra el código actual del módulo
RRHH + planilla, identificar gaps reales, bugs silenciosos y trabajo
faltante antes de implementar ISR, IGSS, Bono 14, aguinaldo,
indemnización, vacaciones, horas extras, séptimo día, bonificación
incentivo Q250 y asientos contables de planilla.

---

## 1. Resumen ejecutivo

- **% de cálculos legales GT implementados hoy: ~10%.** Lo único que
  el sistema calcula automáticamente es:
  1. IGSS laboral fijo al 4.83% sobre `baseSalary` (constante hardcoded).
  2. Bonificación incentivo Q250 (constante hardcoded, no prorrateada
     al período).
  3. Neto = base + Q250 − IGSS.
  El resto (ISR, Bono 14, aguinaldo, indemnización, vacaciones, horas
  extras, séptimo día, IGSS patronal/IRTRA/INTECAP, asiento contable,
  boleta PDF, reporte CSV IGSS) **no existe**.
- El plan de Fase 18 es **correcto y alineado con la realidad**: cubre
  exactamente los gaps detectados aquí. Sin embargo, requiere
  **migración de schema importante** (nuevos modelos `EmployeeLoan`,
  `EmployeeBalance`, refactor de `PayrollItem` para soportar más
  conceptos) y depende fuerte de la Fase 14 (asiento doble con cuentas
  reales como "IGSS por pagar", "ISR retenido por pagar", "Sueldos
  por pagar").
- **Riesgo de tipos**: hoy `PayrollItem` solo tiene 7 columnas numéricas
  (`baseSalary`, `bonusIncentive`, `otherBonuses`, `igss`, `isr`,
  `otherDeductions`, `netSalary`). No hay columnas para Bono 14
  proporcional, aguinaldo proporcional, vacaciones, horas extras,
  séptimo día, cuotas patronales, indemnización. **No se puede
  generar boleta de pago detallada sin agregar campos**.

---

## 2. Inventario de endpoints HR existentes

Archivos encontrados (todos bajo `src/app/api/hr/`):

| Endpoint | Métodos | Estado |
|----------|---------|--------|
| `/api/hr/employees` | GET, POST | Zod + tenant guard OK |
| `/api/hr/employees/[id]` | GET, PUT, DELETE (soft) | OK; `terminationDate` se setea sin recalcular nada |
| `/api/hr/attendance` | GET, POST (upsert por día) | Zod OK; sólo bitácora, no se usa para cálculos |
| `/api/hr/leaves` | GET, POST | Zod OK |
| `/api/hr/leaves/[id]` | GET, PATCH (APPROVE/REJECT), DELETE | Zod + audit OK; no descuenta saldo de vacaciones |
| `/api/hr/payroll` | GET, POST (genera planilla) | **Sin Zod**, cálculo hardcoded |
| `/api/hr/payroll/[id]` | GET, PUT (cambia status) | **Sin Zod**, transición sin validar (`DRAFT→APPROVED→PAID`), **sin asiento contable al pasar a PAID** |
| `/api/hr/payroll-items/[id]` | PUT (edita item) | **Sin Zod**, **sin tenant guard** (bug crítico: cualquier usuario con `payroll:manage` puede tocar PayrollItems de otra empresa si conoce el UUID) |

**Endpoints faltantes según plan Fase 18:**
- `POST /api/hr/payroll/[id]/pay` (generar asiento y mover cuentas).
- `GET /api/hr/payroll/[id]/payslip/[employeeId]` (boleta PDF).
- `GET /api/hr/payroll/[id]/report/igss` (CSV IGSS).
- `GET /api/hr/payroll/[id]/report/csv` (planilla completa).
- `POST /api/hr/employees/[id]/terminate` (cálculo de indemnización +
  Bono 14 prop. + aguinaldo prop. + vacaciones no gozadas).
- CRUD `EmployeeLoan` (`POST /api/hr/loans`, `GET`, `PUT/cancel`).
- CRUD `EmployeeBalance` (consulta saldo vacaciones; el balance se
  actualiza por cron o por trigger en LeaveRequest APPROVED).
- `POST /api/hr/payroll/[id]/recalculate` (recalcular cálculos legales
  después de cambiar parámetros de un empleado, antes de aprobar).

---

## 3. Estado actual del cálculo de planilla

Ver `src/app/api/hr/payroll/route.ts` líneas 58–78. El cálculo completo
por empleado al generar la planilla es:

```ts
const base = Number(emp.baseSalary);
const bonusIncentive = 250;          // constante GT, no prorrateada
const igss = base * 0.0483;          // 4.83% laboral, fijo
const net = base + bonusIncentive - igss;
```

### Problemas detectados

1. **Bonificación incentivo Q250 sin prorratear.** Si el período es
   quincenal, debería ser Q125; si el empleado ingresó a mitad de mes,
   también debería prorratearse. Hoy se asigna Q250 a todos los
   empleados activos sin importar `hireDate`, `terminationDate`, ni
   `startDate/endDate` de la planilla.
2. **IGSS calculado sobre `baseSalary` solamente.** Por ley GT el IGSS
   se calcula sobre el sueldo ordinario sin incluir bonificación
   incentivo (eso sí está bien), pero **no se considera el techo**
   (aunque IGSS GT no tiene techo, la base sí excluye bonos legales y
   horas extras de cuota laboral). La cuota laboral correcta es
   4.83% del salario ordinario + comisiones, NO incluye Q250 ni horas
   extras. Hoy el cálculo es accidentalmente correcto solo porque
   nunca llegan horas extras ni comisiones al base.
3. **ISR = 0 por defecto.** No hay cálculo. Se puede editar a mano vía
   `PUT /api/hr/payroll-items/[id]` pero ningún flujo lo calcula.
   La tabla SAT progresiva no existe en código.
4. **No considera asistencia ni faltas.** Si un empleado tiene
   `Attendance.status = ABSENT` durante todo el período, igualmente
   recibe el sueldo completo. `Attendance` y `Payroll` están
   completamente desconectados.
5. **Sin Bono 14 ni aguinaldo.** No hay lógica que detecte si el
   período cae en julio (Bono 14) o diciembre (aguinaldo) ni cómo se
   calcula proporcional.
6. **Sin horas extras.** `Attendance.checkIn/checkOut` se guardan pero
   nunca se procesan en jornadas (ordinaria 8h, extra +50%, nocturna
   +100%).
7. **Sin cuotas patronales.** El plan exige IGSS patronal 10.67% +
   IRTRA 1% + INTECAP 1% (total 12.67% sobre planilla). Hoy estas
   cuotas no se registran y no impactan el asiento contable.
8. **Sin séptimo día.** No hay lógica para jornaleros que cobran por
   día y deben recibir el séptimo día pagado.
9. **Sin asiento contable al pagar.** `PUT /api/hr/payroll/[id]` con
   `status: PAID` cambia el status pero **no genera ningún
   `AccountingEntry`**. Búsqueda en `src/app/api/hr/payroll/` por
   `createAccountingEntry` = **0 resultados**. La cuenta "Nómina y
   Salarios" existe en `SYSTEM_CATEGORIES.EXPENSE`
   (`src/lib/accounting.ts:98`) pero no se usa.
10. **Sin transición de estados validada.** Cualquier status pasa,
    incluso `DRAFT → CANCELLED → PAID`. No hay state machine.

---

## 4. Estado actual de `Employee`, `PayrollItem`, `Attendance`,
   `LeaveRequest`

### Employee (`prisma/schema.prisma:869`)

Campos relevantes: `firstName`, `lastName`, `documentId` (DPI),
`nit`, `position`, `baseSalary` (Decimal 10,2), `hireDate`,
`terminationDate`, `active`, `bankAccount`, `bankName`.

**Faltan para Fase 18:**
- `employeeNumber` o `payrollCode` (número de empleado para reportes
  IGSS y planilla).
- `payrollFrequency` (`MONTHLY`, `BIWEEKLY`, `WEEKLY`, `DAILY`) — hoy
  se asume mensual.
- `jornada` (`DIURNA`, `NOCTURNA`, `MIXTA`) — afecta cálculo de
  jornada ordinaria (8h diurna, 6h nocturna, 7h mixta).
- `igssAffiliation` (número de afiliación IGSS, requerido en CSV).
- `salaryType` (`SUELDO`, `JORNALERO`) — afecta séptimo día.
- `vacationDaysAccrued` (días devengados acumulados) — o se modela
  fuera en `EmployeeBalance`.

`terminationDate` se setea desde PUT pero **no dispara nada**: ni
cálculo de indemnización, ni Bono 14 proporcional, ni aguinaldo,
ni vacaciones no gozadas. La baja por DELETE (soft) sólo marca
`active=false`.

### PayrollItem (`prisma/schema.prisma:920`)

Hoy: `baseSalary`, `bonusIncentive` (default 250), `otherBonuses`,
`igss`, `isr`, `otherDeductions`, `netSalary`. **7 campos numéricos
planos**, sin desglose por concepto.

**Faltan para boleta de pago completa GT:**
- `daysWorked` (días efectivamente trabajados, en base a Attendance).
- `regularHours`, `overtimeHours50`, `overtimeHours100`
  (desglose de horas).
- `overtimePay` (monto extra por horas).
- `seventhDayPay` (pago de séptimo día para jornaleros).
- `commissions` (comisiones del período).
- `bono14Accrual` (provisión Bono 14 del período) o `bono14Payment`
  (cuando es la planilla de julio).
- `aguinaldoAccrual` / `aguinaldoPayment` (diciembre).
- `vacationPay` (pago de vacaciones gozadas en el período).
- `igssEmployer` (cuota patronal 10.67%).
- `irtra` (1%).
- `intecap` (1%).
- `loanDeduction` (monto deducido por EmployeeLoan en este período).
- `terminationPayment` (indemnización si aplica).
- `notes` (memo opcional).
- Snapshot `payrollFrequency` para auditoría.

### Attendance (`prisma/schema.prisma:946`)

Tiene `checkIn`, `checkOut`, `status` (PRESENT/ABSENT/LATE/HOLIDAY).
**Solo se usa como bitácora**; no hay query que la lea para calcular
horas trabajadas u horas extras. La unicidad por día se hace con
findFirst en el POST, **sin constraint en BD** (riesgo de duplicados
si dos requests entran al mismo tiempo).

### LeaveRequest (`prisma/schema.prisma:963`)

`type` (VACATION/SICK_LEAVE/PERSONAL_DAYS/OTHER), `startDate`,
`endDate`, `status`, `approvedById`. Cuando se APPROVE no descuenta
saldo de vacaciones (no hay `EmployeeBalance`). Tampoco crea
`Attendance` automáticos en los días aprobados, así que la planilla
no "sabe" que el empleado estaba de vacaciones.

---

## 5. Modelos faltantes

Confirmado por `grep` en `prisma/schema.prisma`:

- `EmployeeLoan` — **no existe**. No hay forma de registrar
  anticipos/préstamos al empleado ni de descontarlos automáticamente
  de la planilla siguiente.
- `EmployeeBalance` — **no existe**. No hay control de días de
  vacaciones devengados / gozados / disponibles.
- `PayrollJournalEntry` o relación `Payroll.journalEntryId` — **no
  existe**. Cuando se implemente el asiento al pagar, hay que
  vincular `Payroll` con `JournalEntry` (Fase 14) para trazabilidad.
- `OvertimeRule` o configuración de jornada por empresa — **no
  existe**. Los porcentajes (50%/100%) deberían ser parametrizables
  por empresa (algunas empresas pagan más).
- `SalarySchedule` o `PayrollPeriod` (calendario de planillas
  recurrentes) — **no existe**. Hoy cada planilla se crea a mano.

---

## 6. Bugs y riesgos detectados (independientes del plan)

1. **`PUT /api/hr/payroll-items/[id]` no valida tenant.** Carece de
   `requirePermission` con scope al `companyId` del PayrollItem.
   Cualquier usuario autenticado con `payroll:manage` en empresa A
   puede modificar item de planilla de empresa B si conoce el UUID.
   **Severidad: alta.** Patrón ya resuelto en otros endpoints HR
   (`employees/[id]`, `leaves/[id]`) — replicar.
2. **`POST /api/hr/payroll` no valida fechas.** No verifica que
   `endDate > startDate` ni que el rango no se solape con otra
   planilla del mismo período. Se puede crear N planillas del mismo
   mes y todas calcularán los mismos sueldos.
3. **`POST /api/hr/payroll` sin Zod.** El body se destructura crudo.
4. **`PUT /api/hr/payroll/[id]` permite cualquier status.** No valida
   transiciones (puede saltar de DRAFT a PAID directo sin pasar por
   APPROVED, o de PAID a DRAFT).
5. **Cálculo de net en el cliente.** En
   `src/app/(dashboard)/hr/payroll/[id]/page.tsx:276` el frontend
   calcula `netSalary` y lo envía al backend, y el backend lo guarda
   sin recalcular. Un cliente malicioso puede mandar `netSalary` = 1
   millón. **Severidad: alta.**
6. **Recalculo de totales tras edit de item no es transaccional.**
   En `payroll-items/[id]/route.ts` el `update` del item y el
   `update` del totalGross/totalNet de la Payroll están separados.
   Si el segundo falla, los totales quedan inconsistentes.
7. **No hay constraint único en `Attendance (employeeId, date)`.**
   Riesgo de duplicado en concurrencia. Hoy se valida con findFirst.
8. **No hay audit log en payroll.** Acciones críticas (aprobar,
   pagar, editar item) no quedan registradas. `LeaveRequest` sí
   audita.
9. **`Employee.userId` es nullable pero único.** OK. Solo nota.
10. **No hay `Employee.documentId` con índice único** por empresa.
    Dos empleados con el mismo DPI pueden coexistir.

---

## 7. Datos seed

`prisma/seed.ts` NO crea empleados, planillas, asistencia ni leaves.
La única referencia es `'hr:manage', 'payroll:manage'` en el listado
de permisos del rol admin. Para que los tests e2e de Fase 18
funcionen, **el seed debe crear al menos**: 3 empleados de prueba
(uno mensual, uno quincenal, uno jornalero), Attendance del último
mes, una LeaveRequest aprobada, un EmployeeLoan vigente y una
planilla mensual ya pagada para validar el asiento.

---

## 8. Validación del plan Fase 18

El plan en `phase-13-erp-real-plan.md:160-193` cubre **exactamente**
los gaps detectados:

| Plan | Estado actual | Cubierto |
|------|---------------|----------|
| Tabla ISR SAT progresiva | No existe (campo `isr` siempre 0) | Sí |
| Bono 14 proporcional Jul-Jun | No existe | Sí |
| Aguinaldo Dic-Nov | No existe | Sí |
| Indemnización al terminar | terminationDate sin lógica | Sí |
| EmployeeBalance | No existe | Sí |
| EmployeeLoan | No existe | Sí |
| Horas extras desde Attendance | Attendance ignorada en payroll | Sí |
| Séptimo día jornaleros | No existe | Sí |
| IGSS patronal 10.67% / IRTRA 1% / INTECAP 1% | No existe | Sí |
| Q250 prorrateada | Hardcoded Q250 fijo | Sí |
| Asiento contable doble al pagar | No se genera ningún asiento | Sí |
| Boleta PDF | No existe | Sí |
| Reporte IGSS CSV | No existe | Sí |
| `POST /api/hr/payroll/:id/pay` | No existe | Sí |

**Conclusión: el plan está bien alineado.**

### Observaciones / refinamientos sugeridos al plan

1. **Incluir explícitamente el refactor de `PayrollItem`** para
   agregar los ~15 campos faltantes (Bono14, aguinaldo, vacationPay,
   overtimePay, seventhDay, igssEmployer, irtra, intecap,
   loanDeduction, terminationPayment, daysWorked, etc.). El plan
   solo lo menciona implícitamente.
2. **Agregar `payrollFrequency` y `salaryType` a `Employee`.** Sin
   esto no se puede prorratear Q250 ni decidir si paga séptimo día.
3. **State machine de Payroll**: definir transiciones válidas
   (`DRAFT → APPROVED`, `APPROVED → PAID`, `DRAFT → CANCELLED`),
   bloquear edición de items en `APPROVED`/`PAID`.
4. **Provisión mensual de Bono 14 y aguinaldo**: el plan dice que se
   pagan en julio/diciembre, pero contablemente la empresa debe
   **provisionar mensualmente** (DR Gasto Bono 14 / CR Provisión Bono
   14 por pagar). Aclarar si Fase 18 hace solo el pago o también la
   provisión mensual.
5. **Tabla ISR**: la tabla SAT es progresiva sobre **renta
   imponible anual** (sueldo anual − Q48,000 deducción personal − Q
   gastos médicos/colegio − IGSS retenido). Hay que decidir si el
   ISR se retiene mensual proporcional (lo normal) y si se hace
   ajuste anual en diciembre. El plan no lo aclara.
6. **Reporte IGSS CSV**: el formato lo define el IGSS (planilla
   electrónica del IGSS-FORMUL-1117). Validar columnas con un
   contador antes de implementar.
7. **`POST /api/hr/payroll/:id/pay`**: debe ser idempotente o
   bloquear duplicados (si una planilla está PAID no se puede volver
   a pagar). Idealmente generar el asiento dentro de una `$transaction`
   junto con el cambio de status.
8. **Bonificación incentivo Q250 vigente**: confirmar con el dueño si
   se quiere parametrizar por empresa (algunas empresas pagan Q300 o
   más). Si Fase 23 ya planea esto, dejarlo hardcoded por ahora.
9. **Dependencia con Fase 14**: el asiento contable de planilla
   requiere las cuentas "IGSS por pagar", "ISR retenido por pagar",
   "Sueldos por pagar", "Provisión Bono 14", "Provisión aguinaldo",
   "Indemnizaciones por pagar". Verificar que el plan de cuentas
   seed de Fase 14 las incluya.
10. **Dependencia con Fase 17**: el plan menciona "anticipos como
    crédito al empleado". Definir si `EmployeeLoan` se modela como
    cuenta por cobrar al empleado (CxC) o como modelo independiente.
    Si es CxC, hay que coordinar con Fase 17 antes.

---

## 9. Scope estimado de implementación

- **Migración Prisma**: 4 modelos nuevos (`EmployeeLoan`,
  `EmployeeBalance`, `OvertimeRule` opcional, relación
  `Payroll.journalEntryId`) + refactor de `PayrollItem` (~15
  columnas) + 3 campos nuevos en `Employee`
  (`payrollFrequency`, `salaryType`, `igssAffiliation`).
- **Helpers en `src/lib/payroll/`** (no existen hoy): `isr.ts` (tabla
  SAT), `igss.ts`, `bono14.ts`, `aguinaldo.ts`, `indemnizacion.ts`,
  `overtime.ts`, `seventhDay.ts`, `bonificacionIncentivo.ts`,
  `accounting.ts` (asiento doble de planilla), `payslip.ts` (PDF),
  `igssReport.ts` (CSV).
- **Endpoints nuevos**: ~8 (ver sección 2).
- **Endpoints a refactorizar**: 3 (`payroll POST`,
  `payroll/[id] PUT`, `payroll-items/[id] PUT`).
- **UI**: pantalla de boleta PDF, pantalla de configuración de
  empleado (jornada, frecuencia), pantalla de EmployeeLoan, vista
  de saldo de vacaciones, ajustes en `PayrollModal` para elegir tipo
  de planilla (mensual / quincenal / Bono 14 / aguinaldo).
- **Tests**: validar caso del enunciado (empleado Q5,000 → IGSS
  -Q241.50, ISR según tabla, +Q250 bonificación), planilla con horas
  extras, planilla de julio con Bono 14, terminación con
  indemnización, EmployeeLoan deducido, asiento doble cuadrado.

Estimación gruesa: la Fase 18 es **una de las más grandes** del plan.
Se sugiere dividir en sub-fases si excede el presupuesto de tiempo:
18a (cálculos legales + refactor PayrollItem), 18b (asiento contable
y endpoint /pay), 18c (boleta PDF y CSV IGSS), 18d (indemnización +
EmployeeLoan + EmployeeBalance).

---

## 10. Conclusión

- El módulo HR/planilla actual es **una maqueta funcional** con
  CRUD básico de empleados, asistencia y permisos, y un cálculo de
  planilla simbólico (IGSS 4.83% + Q250 fijo). **No es apto para uso
  productivo en Guatemala.**
- El plan de Fase 18 cubre los gaps reales y es coherente con el
  estado del código.
- Hay **bugs de seguridad** (PayrollItem sin tenant guard, netSalary
  calculado en cliente) que conviene corregir como parte de Fase 18
  o, mejor, dentro de Fase 13 si todavía está abierta.
- Antes de implementar Fase 18, asegurar:
  1. Fase 14 cerrada (plan de cuentas con "IGSS por pagar", "ISR
     retenido", "Sueldos por pagar", "Provisiones Bono 14/aguinaldo").
  2. Decisión del dueño sobre **provisión mensual vs pago directo**
     de Bono 14 y aguinaldo (recomendado: provisión).
  3. Validación con contador del formato exacto de CSV para IGSS.
  4. Si EmployeeLoan será CxC del empleado o modelo independiente
     (coordinar con Fase 17).

Sin esos prerrequisitos, Fase 18 entregará un módulo funcional
pero contablemente desconectado.
