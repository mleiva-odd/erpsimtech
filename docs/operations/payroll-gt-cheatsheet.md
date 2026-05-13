# Planilla Guatemala · Cheat-sheet (Fase 18)

Referencia rápida para distinguir qué parámetros son **ley GT** (hardcoded
en código, no configurables) y cuáles son **configurables por empresa o
empleado** (campos en DB).

## 1. Constantes de ley (NO tocar)

Todas viven en `src/lib/payroll/{igss,isr,bono14,aguinaldo,vacaciones,
overtime}.ts`. Cambiarlas requiere modificar código + tests.

| Concepto | Valor | Ubicación |
|---|---|---|
| IGSS laboral | 4.83% | `igss.ts` · `IGSS_LABORAL_RATE` |
| IGSS patronal | 10.67% | `igss.ts` · `IGSS_PATRONAL_RATE` |
| IRTRA | 1.00% | `igss.ts` · `IRTRA_RATE` |
| INTECAP | 1.00% | `igss.ts` · `INTECAP_RATE` |
| Total cargas patronales | 12.67% | `igss.ts` · `IGSS_TOTAL_PATRONAL_RATE` |
| ISR tramo 1 (≤Q300k) | 5% | `isr.ts` · `ISR_TRAMO1_RATE` |
| ISR tramo 2 (>Q300k) | Q15,000 + 7% | `isr.ts` · `ISR_TRAMO2_RATE` |
| ISR · deducción personal | Q48,000 anual | `isr.ts` · `DEDUCCION_PERSONAL` |
| ISR · gastos médicos/colegio máx | Q12,000 anual | `isr.ts` · `GASTOS_MEDICOS_MAX` |
| Bono 14 | 1 sueldo / 12 meses julio-junio | `bono14.ts` |
| Aguinaldo | 1 sueldo / 12 meses dic-nov | `aguinaldo.ts` |
| Indemnización | 1 sueldo × año trabajado | `indemnizacion.ts` |
| Vacaciones | 15 días hábiles / año cumplido | `vacaciones.ts` · `VACATION_DAYS_PER_YEAR` |
| Hora extra diurna | +50% sobre la hora normal | `overtime.ts` · `OVERTIME_REGULAR_MULTIPLIER` |
| Hora extra nocturna/feriado | +100% | `overtime.ts` |
| Jornada DIURNA | 8 hrs/día | `overtime.ts` · `jornadaHoursPerDay` |
| Jornada NOCTURNA | 6 hrs/día | id. |
| Jornada MIXTA | 7 hrs/día | id. |

## 2. Configurables por empresa o empleado

Columnas en DB. La UI los expone en el form del empleado y settings.

| Campo | Tabla.columna | Default | Descripción |
|---|---|---|---|
| Bonificación incentivo | `Employee.bonusIncentive` | Q250 (decreto 78-89) | La empresa puede pagar MÁS si quiere (algunas pagan Q300 o Q500). |
| Frecuencia de planilla | `Employee.payrollFrequency` | `MONTHLY` | `MONTHLY` o `BIWEEKLY`. Bonificación se prorratea (BIWEEKLY = 50%). |
| Jornada | `Employee.shift` | `DIURNA` | `DIURNA`/`NOCTURNA`/`MIXTA` — afecta cálculo hora ordinaria. |
| Salario base mensual | `Employee.baseSalary` | sin default | Sueldo bruto pactado. |
| Afiliación IGSS | `Employee.igssAffiliated` | `true` | `false` para temporales no afiliados → cuotas IGSS = 0. |
| Número afiliación IGSS | `Employee.igssNumber` | null | Requerido para CSV IGSS-FORMUL-1117. |
| Fecha contratación | `Employee.hireDate` | sin default | Punto de partida para Bono14/Aguinaldo prop. y vacaciones. |
| Fecha terminación | `Employee.terminationDate` | null | Se setea via endpoint `/terminate` (con liquidación). |

## 3. Cálculos automáticos del motor

`calculatePayrollItem(input)` en `src/lib/payroll/calculate.ts` ejecuta:

1. **Sueldo del período**: si REGULAR y daysWorked < 30, prorratea.
2. **Bonificación incentivo**: × factor de frecuencia (MONTHLY=1, BIWEEKLY=0.5).
3. **Horas extras**: usa hora ordinaria = sueldo/30/horas_jornada.
4. **Base IGSS** = sueldo periodo + horas extras + séptimo día + comisiones
   (NO incluye bonificación incentivo).
5. **IGSS laboral**: base × 4.83% si afiliado.
6. **IGSS patronal**: base × 10.67% + 1% IRTRA + 1% INTECAP.
7. **ISR**: tabla progresiva sobre renta neta anual, proyección mensual /12.
8. **Préstamo**: cuota mensual hasta agotar saldo (`EmployeeLoan.balance`).
9. **Bruto = sueldo + bonificación + h.extras + séptimo + comisiones + otros bonos**.
10. **Neto = bruto − (igssLaboral + isr + loan + otherDeductions)**.
11. **Provisiones mensuales (solo REGULAR)**:
    - Bono14: sueldo/12.
    - Aguinaldo: sueldo/12.
    - Indemnización: sueldo/12.
    - Vacaciones: sueldo/24.

## 4. Asiento contable de planilla

Generado en `src/lib/payroll/accounting.ts` por `generatePayrollJournalEntry`.
Llamado desde `POST /api/hr/payroll/[id]/pay` (idempotente: usa
`Payroll.journalEntryId` para no duplicar).

### REGULAR

```
DR  Sueldos y Salarios       (5.2.01)   Σ totalGross − Σ bonusIncentive
DR  Bonificación Incentivo   (5.2.03)   Σ bonusIncentive
DR  IGSS Patronal (gasto)    (5.2.02)   Σ totalCostoPatronal
DR  Gastos operativos        (5.3.01)   Σ provisiones B14+Agui+Indem+Vac
    CR  IGSS por Pagar       (2.1.04)   Σ igssLaboral + Σ cargas patronales
    CR  ISR Retenido         (2.1.03)   Σ isr
    CR  Sueldos por Pagar    (2.1.05)   Σ netSalary + Σ loanDeduction + Σ otrasDeducciones
    CR  Provisión Bono 14    (2.1.06)   Σ bono14Provision
    CR  Provisión Aguinaldo  (2.1.07)   Σ aguinaldoProvision
    CR  Provisión Indem+Vac  (2.1.08)   Σ indemProv + Σ vacacionesProv
```

### BONO14 / AGUINALDO / INDEMNIZACION (pago)

```
DR  Provisión correspondiente (2.1.06 / 2.1.07 / 2.1.08)   Σ totalGross
    CR  Sueldos por Pagar    (2.1.05)   Σ netSalary
```

## 5. State machine de Payroll

```
DRAFT  ──POST /approve──▶ APPROVED  ──POST /pay──▶ PAID
  │                          │
  └─── PUT {status:CANCELLED} ───▶ CANCELLED   (sólo desde DRAFT/APPROVED)
```

- En `DRAFT`: editable. `POST /recalculate` regenera items.
- En `APPROVED`: solo se puede pagar o cancelar.
- En `PAID`: read-only. Sólo reversa contable (Fase 22+).

## 6. Endpoints (Fase 18)

| Ruta | Método | Permiso | Función |
|---|---|---|---|
| `/api/hr/payroll` | GET/POST | `payroll:manage` | Listar / crear (genera items) |
| `/api/hr/payroll/[id]` | GET/PUT | `payroll:manage` | Detalle / cambiar nombre/status=CANCELLED |
| `/api/hr/payroll/[id]/approve` | POST | `payroll:manage` | DRAFT → APPROVED |
| `/api/hr/payroll/[id]/pay` | POST | `payroll:manage` | APPROVED → PAID + JournalEntry (idempotente) |
| `/api/hr/payroll/[id]/recalculate` | POST | `payroll:manage` | Re-genera items (solo DRAFT) |
| `/api/hr/payroll/[id]/payslip/[employeeId]` | GET | `payroll:manage` | Boleta PDF |
| `/api/hr/payroll/[id]/report/igss` | GET | `payroll:manage` | CSV IGSS-FORMUL-1117 |
| `/api/hr/payroll/[id]/report/csv` | GET | `payroll:manage` | CSV planilla completa |
| `/api/hr/payroll-items/[id]` | PUT | `payroll:manage` | Editar item (tenant guard + state machine + recálculo server-side) |
| `/api/hr/employees/[id]/terminate` | POST | `hr:manage` | Marca terminación + crea Payroll INDEMNIZACION |
| `/api/hr/employees/[id]/balance` | GET | `hr:manage` | Saldo vacaciones del empleado |
| `/api/hr/loans` | GET/POST | `payroll:manage` | Listar / crear EmployeeLoan |
| `/api/hr/loans/[id]/cancel` | PATCH | `payroll:manage` | Cancelar préstamo |

## 7. Preguntas frecuentes del dueño

- **¿La bonificación Q250 se incluye en IGSS o ISR?**
  No. Es exenta (decreto 78-89). El motor la excluye de la base IGSS y
  no la incluye en `monthlyAfectoSalary` para ISR.

- **¿Cómo cambio Q250 a Q500 para un cliente?**
  Editar `Employee.bonusIncentive` desde la UI. No tocar código.

- **¿El cliente paga Bono14 en julio o lo provisiona mensual?**
  Ambos. El motor genera provisión mensual (1/12) en cada planilla
  REGULAR. Cuando llega julio, crear una planilla con `payrollType=BONO14`
  — el asiento al pagar cancela la provisión acumulada.

- **¿Y si un empleado tiene < 1 año al pagar Bono14?**
  El helper `calculateBono14` ya prorrate por meses trabajados dentro
  del período legal jul-jun. El cliente no necesita hacer nada manual.

- **¿Qué pasa con un empleado no afiliado al IGSS?**
  Marcar `Employee.igssAffiliated=false`. El motor pone IGSS laboral y
  patronal en 0 para ese empleado.

- **¿La planilla quincenal divide el sueldo en dos?**
  Sí (`payrollFrequency=BIWEEKLY`). La bonificación incentivo también
  se divide. Las provisiones también. IGSS y ISR se calculan con la
  proyección anual del sueldo total — la cuota mensual sale completa
  pero al ser quincenal se reparte en dos planillas. (Esto último es
  una simplificación: en producción algunos clientes prefieren
  retener IGSS sólo en una de las quincenas; ajustar Fase 22+.)
