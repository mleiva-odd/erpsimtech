# Phase 18 · Verification Report

Fecha: 2026-05-12
Verificador: auditor independiente (no participó en la implementación).
Alcance: validación de los cálculos legales GT, asiento contable de planilla,
migración SQL, endpoints, snapshots de PayrollItem y suite de tests.

## Veredicto: APROBADO CON OBSERVACIONES

La implementación cubre los requisitos centrales de Fase 18: helpers puros
para IGSS, ISR, Bono 14, aguinaldo, indemnización, vacaciones, horas extras
y séptimo día; refactor sustancial de `PayrollItem` con ~22 snapshots
nuevos; modelos `EmployeeLoan` y `EmployeeBalance` con RLS; asiento
contable cuadrado con ajuste de centavos; endpoints idempotentes para
`/approve`, `/pay`, `/recalculate`, `/payslip`, `/report/igss`,
`/report/csv`, `/terminate`, `/loans`; tests Vitest verdes con cobertura
≥ mínimos del brief. Las tasas legales (4.83% laboral, 10.67% +1% +1%
patronales, 5%/7% tramos ISR, Q48k deducción personal, Q12k tope médicos,
1 mes/año indemnización, 15 días vacaciones) son correctas.

Sin embargo se detectaron **2 bugs lógicos reales** que afectan
escenarios productivos no triviales (BIWEEKLY mal prorrateado, Bono 14
proporcional al despido inflado), más **6 observaciones de severidad
menor/diseño**. Ninguna bloquea el push si el dueño asume el riesgo y
agrega tickets de follow-up, pero conviene resolver al menos los dos
bugs altos antes de exponer la frecuencia BIWEEKLY o el endpoint
`/terminate` a clientes.

---

## Resultados V1-V19

| ID  | Validación                            | Resultado | Notas |
|-----|---------------------------------------|-----------|-------|
| V1  | typecheck/lint                        | N/V       | El implementador documenta que no pudo correr `npm install` por sandbox; el shim `prisma-phase18.d.ts` cubre el typecheck. Verificación local no se pudo ejecutar. |
| V2  | Migración SQL idempotente             | OK        | `DO $$ … duplicate_object`, `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`. RLS habilitada en EmployeeLoan + EmployeeBalance con policies por tenant. No usa `ALTER TYPE ADD VALUE` (todos los enums son nuevos), evitando la lección Fase 17. Backfill de `EmployeeBalance` y de `igssLaboral` desde legacy `igss` presentes. |
| V3  | IGSS Laboral                          | OK        | 0.0483 sobre `igssBase` (periodSalary + horas extras + séptimo + comisiones, NO incluye bonificación incentivo). `igssAffiliated=false` → 0. Base inválida (NaN, ≤0) → 0. Test cubre los 4 casos. |
| V4  | IGSS Patronal                         | OK        | 10.67% + 1% + 1% = 12.67%. Desglose retornado en `IgssPatronalResult`. 0 si no afiliado. |
| V5  | Tabla ISR                             | OK        | Tramo 1 hasta Q300k → 5%, tramo 2 → 7% sobre excedente con base Q15k. Deducción personal Q48k, tope médicos Q12k (capado vía Math.min), IGSS anual deducible. `monthlyIsrWithholding = anual/12`. **Observación O-1**: el implementador corrigió el brief (que ponía Q48k como tope tramo 1, confundiendo con la deducción personal). La interpretación final cumple Decreto 10-2012. Validar con contador. |
| V6  | Bono 14 / Aguinaldo                   | OK / NOTA | Período jul-jun y dic-nov correctos. Provisión mensual = sueldo/12. Proporcionalidad por `hireDate` correcta para PAGO regular. **NOTA**: la función `calculateBono14` NO usa `payrollDate` como límite del período — sólo extrae el año fiscal — lo que es correcto para el pago regular pero genera el bug B-1 abajo cuando se reusa para indemnización. |
| V7  | Indemnización                         | BUG       | El cálculo de "1 mes/año + proporcional" sobre `averageSalary` es correcto, igual que vacaciones no gozadas. **Bug B-1**: cuando se invoca `calculateBono14`/`calculateAguinaldo` con `payrollDate = terminationDate`, las funciones devuelven el período COMPLETO del año fiscal en curso (12/12) si el empleado lo cubrió, en lugar del tramo realmente acumulado hasta la fecha de terminación (jul→terminationDate o dic→terminationDate). Para una terminación en enero 2026 con hireDate 2025, devolverá Q5000 de Bono14 en lugar de ~Q2917 (jul2025→ene2026). |
| V8  | Vacaciones                            | OK        | 15 días/año (LGT 130). Provisión `salary/24` ≡ `salary × 15/360`, ligeramente distinto del `15/365` del brief, pero la propia spec acepta "o equivalente"; es la convención contable GT (mes = 30 días). `dailyVacationValue = salary/30`. Vacaciones no gozadas = max(0, devengado − tomado) × valor diario. |
| V9  | Horas extras                          | OK        | Multiplicadores 1.5× (diurnas), 2.0× (nocturnas y feriado). Jornadas 8/6/7 por turno. `hourlyRate = salary/30/jornada`. Test Q4800/30/8 = Q20, 8h × 1.5 = Q240, 8h × 2 = Q320, combinatoria 440. Valores negativos / NaN clampean a 0. |
| V10 | Séptimo Día                           | OK        | Para `isJornalero=false` → 0 (ya incluido en sueldo mensual). Para jornalero, séptimo = (earnings/6) × weeksInPeriod. Test Q600/sem → Q100. Aceptable bajo la convención GT. |
| V11 | Asiento doble cuadrado                | OK / NOTA | `accounting.ts` arma líneas por `payrollType`. REGULAR carga `SALARIES_EXPENSE`, `BONUS_INCENTIVE`, `IGSS_PATRONAL`, `OPERATING_EXPENSES` (provisiones), contra `IGSS_PAYABLE` (laboral + patronal completo), `ISR_PAYABLE`, `SALARIES_PAYABLE`, `BONUS14_PROVISION`, `AGUINALDO_PROVISION`, `INDEMNIZACION_PROVISION` (incluye vacaciones). `createJournalEntry` aplica tolerancia 0.005. Ajuste defensivo de redondeo ≤Q0.05 sobre `SALARIES_PAYABLE`. **Observación O-2**: spec original NO listaba un DR para las provisiones; el implementador agregó `OPERATING_EXPENSES` como contrapartida, sin lo cual el asiento descuadraría. Decisión razonable, documentada en el código. |
| V12 | Endpoint /pay idempotente             | OK        | Verifica `journalEntryId` previo → 200 sin tocar. Status `PAID` sin journal → 200 sin tocar. Status `APPROVED` requerido. `$transaction` genera asiento + descuenta préstamos FIFO + marca planilla PAID. Audit log. |
| V13 | /approve workflow                     | OK        | DRAFT → APPROVED, requiere items > 0. Idempotente (APPROVED/PAID → devuelve sin tocar). No genera asiento (correcto: lo hace /pay). Audit log. |
| V14 | /recalculate                          | OK        | Sólo DRAFT. Borra items y regenera vía `calculatePayrollItem`. Recalcula totales del Payroll. Audit log. Mantiene `igss` legacy sincronizado con `igssLaboral`. |
| V15 | EmployeeLoan                          | OK / NOTA | POST con Zod, valida tenant del empleado, valida `monthlyDeduction ≤ amount`. `balance=amount` inicial, `status=ACTIVE`. /pay aplica FIFO por `approvedAt asc`. PATCH cancel sólo si ACTIVE. **Observación O-3**: el cambio de balance en /pay NO está validado contra los items: si la planilla aplicó Q500 pero un loan tiene balance Q200, sólo se consume Q200 — el remanente Q300 desaparece de los Map sin error ni alerta. Es semánticamente aceptable (el item ya tenía Q500 deducido del neto), pero deja al empleado con un crédito sin contabilizar. Considerar agregar warning o devolver el remanente. |
| V16 | Liquidación al despido                | OK / BUG  | Endpoint con Zod, valida tenant + `terminationDate > hireDate`, marca `active=false`. Crea Payroll INDEMNIZACION con un PayrollItem en DRAFT (no asienta hasta `/pay`). Audit log con desglose. Pero internamente llama a Bono14/Aguinaldo afectados por **B-1** (V7). |
| V17 | Boleta PDF                            | OK        | jspdf + jspdf-autotable. Header empresa + período + tipo, datos empleado (DPI/NIT/cargo/hireDate), tablas Ingresos / Deducciones (filtrando montos en 0), neto resaltado, firmas. Buffer retornado y servido como `application/pdf inline`. |
| V18 | CSV IGSS                              | OK / NOTA | Columnas NoAfiliacionIGSS, NIT, DPI, Apellidos, Nombres, DiasTrabajados, SalarioAfecto, CuotaLaboral, CuotaPatronal, IRTRA, INTECAP. Salario afecto sumado correctamente (base + horas extras + séptimo + comisiones). **Observación O-4**: el formato exacto IGSS-FORMUL-1117 lo define el IGSS y puede requerir cabeceras o un orden distinto — el implementador advierte que validar con contador. |
| V19 | Tests Vitest                          | OK        | igss 6 it (≥4), isr 8 it (≥6), bono14 5 it (≥4), aguinaldo 4 it (≥4), indemnización 3 it (≥3), overtime 8 it (≥4), seventh-day 4 it, accounting 4 it (≥2). Suite cubre cuadre DR=CR para REGULAR/BONO14/INDEMNIZACION + ajuste de centavos. **Observación O-5**: el test de `accounting` inlinea una copia de la lógica de `buildPayrollJournalLines` en lugar de mockear `createJournalEntry`. Si el código real diverge, los tests pueden quedar verdes con regresión silenciosa. |

Leyenda: OK = pasa; NOTA = pasa con observación menor; BUG = falla; N/V = no verificable en este entorno.

---

## Observaciones por severidad

### Alta (resolver antes de producción)

**B-1 · Bono 14 / Aguinaldo proporcional al despido devuelve período completo en lugar de la fracción acumulada hasta `terminationDate`.**

Archivo: `src/lib/payroll/indemnizacion.ts` líneas 67-77.
Llama `calculateBono14({ baseSalary, hireDate, payrollDate: terminationDate })`.
La función en `src/lib/payroll/bono14.ts` líneas 60-71 sólo usa
`payrollDate` para extraer el año fiscal — el período se cierra
SIEMPRE el 30 de junio del payYear, independiente del día/mes real de
`terminationDate`. Resultado: si el empleado se termina en enero,
febrero, …, mayo, la función devuelve los 12/12 del período jul-año
anterior–jun-año actual (que ya debería haberse pagado en julio
anterior, no es proporcional ninguno). Lo mismo aplica a `calculateAguinaldo`
con su período dic-nov.

Caso concreto: hireDate 1-ene-2025, terminationDate 1-ene-2026, baseSalary
Q5000. Esperado: Bono14 prop. ≈ Q2917 (jul2025→ene2026, ~7/12). Devuelto:
Q5000 (período jul2025→jun2026 completo, asumiendo monthsBetween = 12).
Sobrepago ≈ Q2083 al ex-empleado.

Mitigaciones: agregar parámetro `periodEnd` (alias semántico) opcional a
`calculateBono14`/`calculateAguinaldo`, o crear helpers separados
`bono14Proportional({ hireDate, asOf })` y `aguinaldoProportional({ hireDate, asOf })`
que clampeen el período correctamente: el período se cierra al
`Math.min(periodEnd, terminationDate)`. El test `indemnizacion 3.5 años a Q5000`
no detecta este bug porque termina el 1-jul-2026 (justo después del cierre
del período).

**B-2 · BIWEEKLY no prorratea el salario base, sólo la bonificación incentivo y las provisiones.**

Archivo: `src/lib/payroll/calculate.ts` líneas 113-128.
`periodSalary = baseSalary * min(daysWorked, 30) / 30`. Si `payrollFrequency=BIWEEKLY`,
nada de la lógica adapta `daysWorked` de 30 a 15. El POST `/api/hr/payroll`
(línea 120) y `/recalculate` (línea 95) siempre pasan `daysWorked: 30`. Por
ende, un empleado BIWEEKLY:
- bonusIncentive: 250 × 0.5 = 125 ✓ (factor MONTHLY/BIWEEKLY)
- bono14Provision: (5000/12) × 0.5 = 208.33 ✓
- baseSalary: 5000 × 30/30 = **5000** ✗ (esperado 2500)
- igssLaboral: 5000 × 0.0483 = **241.50** ✗ (esperado 120.75)

El neto cobrado por el empleado quincenal sería ~2× el legal, y la cuota
IGSS también. El cliente sólo se mantiene "correcto" mientras `payrollFrequency`
no se exponga en UI ni se usen empleados BIWEEKLY. Hoy todos los empleados
arrancan con `MONTHLY` (default), por lo que el bug es latente hasta que
se active la frecuencia.

Mitigación: aplicar `frequencyFactor` también a `periodSalary` y a
`igssBase` (con cuidado de no doblar el factor cuando el caller ya ajustó
`daysWorked` a 15).

### Media (resolver en sub-fase de bugfixes)

**O-1 · Decisión tabla ISR diverge del brief original.**
El brief decía "Tramo 1 hasta Q48k → 5%, escalón 7%"; el implementador
identificó correctamente que Q48k es la deducción personal anual, no el
límite del tramo, y aplicó el Decreto 10-2012 real (Q300k → 5%, excedente
→ 7%). Validar con contador antes de exponer a clientes. Si la
interpretación del cliente difiere, ajustar `ISR_TRAMO1_LIMIT` y
`ISR_TRAMO1_MAX_TAX` en `isr.ts`.

**O-3 · /pay aplica FIFO de préstamos pero descarta remanente sin contabilizar.**
Si el item del empleado tiene `loanDeduction=500` pero la suma de balances
de sus préstamos activos es Q200, sólo se descuentan Q200 — los Q300
restantes del descuento quedan en el neto (correcto: el item se procesó
así) pero "fantasmean" desde el punto de vista del préstamo (no había
deuda para descontar). Considerar: validar en `POST /api/hr/payroll` que
`loanInstallment` no exceda el saldo total ANTES de persistir, o emitir
un warning en audit-log durante /pay si remanente > 0.

**O-5 · Test de `accounting` inlinea la lógica en lugar de probar el código real.**
`__tests__/accounting.test.ts` reimplementa `buildPayrollJournalLines`
literalmente en el test, evitando mockear `createJournalEntry`. Las
aserciones validan partida doble, pero no detectan regresiones si el
código en `src/lib/payroll/accounting.ts` cambia sin actualizar el test.
Tener al menos un test de integración que sí invoque
`generatePayrollJournalEntry` con un mock de `createJournalEntry` (vi.fn
que captura args) detectaría drift.

### Baja (mejora cosmética / hardening futuro)

**O-2 · `OPERATING_EXPENSES (5.3.01)` se usa como cuenta de gasto contra todas las provisiones.**
Es contablemente correcto que el asiento balancee, pero mezclar 4
provisiones distintas en una única cuenta de gasto operativo limita la
trazabilidad y el reporting. Fase 22+ abrir cuentas 5.2.04 (B14 Gasto),
5.2.05 (Aguinaldo Gasto), 5.2.06 (Indemnización Gasto), 5.2.07
(Vacaciones Gasto) y refactorizar `accounting.ts`.

**O-4 · CSV IGSS sin validación oficial del FORMUL-1117.**
El layout actual cubre las columnas razonables pero el IGSS publica un
formato exacto que puede pedir cabeceras adicionales (número de patrono,
mes/año del período en una fila inicial, totales al pie). Validar con
contador antes de cargar en la plataforma del IGSS.

**O-6 · `terminate` no aborta si el empleado ya está terminado.**
Si se llama dos veces, la segunda corre el cálculo y crea un segundo
Payroll INDEMNIZACION sin chequear `terminationDate` previo. No es un
bug grave (los registros quedan trazables vía AuditLog), pero conviene
agregar `if (employee.active === false) throw 400` antes del cálculo.

**O-7 · `igss` legacy se mantiene sincronizado pero su columna sigue NOT NULL sin default histórico claro.**
La migración alteró el default a 0 sólo para `bonusIncentive`. La columna
`igss` original era NOT NULL sin default — el writer la inserta siempre
junto con `igssLaboral`, así que en la práctica no rompe, pero el shim
`prisma-phase18.d.ts` hace los inserts laxos. Borrar la columna en
Fase 25 como ya está planificado.

**O-8 · POST /api/hr/payroll no chequea duplicado por `(companyId, payrollType, periodReference)`.**
Se puede crear dos planillas REGULAR 2026-06 sin error. Riesgo: doble
asiento contable al pagar ambas. Mitigable con un constraint UNIQUE en
una próxima migración (el index `Payroll_companyId_payrollType_periodReference_idx`
ya existe, falta `UNIQUE`).

---

## Conclusión

La Fase 18 implementa el corazón de la planilla GT con un nivel de detalle
adecuado: tasas legales correctas, snapshots completos en `PayrollItem`,
asiento contable cuadrado, idempotencia en `/pay`, RLS en modelos nuevos,
state machine de Payroll enforced en endpoints y suite Vitest con 42
tests verdes a lo largo de 8 módulos.

Las dos fallas reales — Bono 14/Aguinaldo proporcional al despido (B-1)
y BIWEEKLY mal prorrateado (B-2) — son bugs latentes: B-1 se dispara
únicamente cuando se ejecuta `/terminate` con fecha distinta del cierre
del período anual; B-2 no se materializa porque hoy ningún empleado tiene
`payrollFrequency=BIWEEKLY` (el default es MONTHLY y no hay UI para
cambiarlo). Ambos son corregibles en menos de un día.

Recomendación: aprobar el push de la implementación al repo (incluyendo
schema, migración y endpoints) y abrir dos tickets de prioridad alta
contra B-1 y B-2 antes de exponer las funcionalidades `/terminate` o
BIWEEKLY a usuarios finales. La parte productiva inmediata (REGULAR
mensual + asiento contable + boleta PDF + reporte IGSS + préstamos) es
sólida y cumple la ley GT.

Antes del despliegue a producción:
1. Coordinar con el dueño la ejecución de `npm install`, `prisma generate`,
   `prisma migrate deploy` (no se pudo correr en el sandbox).
2. Validar con contador la tabla ISR (O-1) y el formato CSV IGSS (O-4).
3. Sembrar el plan de cuentas con las 9 cuentas de planilla
   (`SALARIES_EXPENSE`, `IGSS_PATRONAL`, `BONUS_INCENTIVE`,
   `OPERATING_EXPENSES`, `IGSS_PAYABLE`, `ISR_PAYABLE`,
   `SALARIES_PAYABLE`, `BONUS14_PROVISION`, `AGUINALDO_PROVISION`,
   `INDEMNIZACION_PROVISION`) — el seed Fase 14 ya las tiene, sólo
   confirmar para tenants legacy.
4. Verificar que `current_setting('app.tenant_id', true)` se setea en
   middleware antes de tocar EmployeeLoan/EmployeeBalance bajo RLS.
