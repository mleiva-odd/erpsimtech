# Master Discovery — Consolidación de auditorías post-Fase 13

Fecha: 2026-05-11
Autor: agente principal (consolidación de 10 audits paralelos previos)
Base: `phase-14-discovery.md` ... `phase-24-26-discovery.md` (+ auditorías previas en `phase-1`/`2`/`3`/`4`/`11`/`13`).
Objetivo: dar al dueño una vista cruzada del estado real del ERP SIMTECH a hoy, validar (o ajustar) el plan de 14 fases pendientes y dejar el camino abierto para arrancar Fase 14 con seguridad.

---

## 1. TL;DR

**El plan original (Fases 14-26) está bien diseñado en concepto y secuencia, pero subestima esfuerzo y tiene 8 ajustes concretos a aplicar antes de empezar.** Las auditorías frescas encontraron 4 bugs **críticos** que el plan original no aborda explícitamente (todos contables), confirmaron que 12 de 13 "bugs silenciosos" siguen abiertos, identificaron que **el motor de cuotas SaaS es dead code** y validaron que la realidad de Supabase FREE rompe los supuestos de Fase 26.

**Volumen real estimado del plan completo: 80-120 días de trabajo enfocado** (vs. los ~60-70 que sugería implícitamente el plan original).

**Ningún hallazgo bloquea arrancar Fase 14.** Los ajustes propuestos pueden aplicarse mientras se ejecuta.

---

## 2. Hallazgos críticos cross-módulo

### CRIT-1 · Reversa de pagos NO genera asiento contrario
**Detectado por:** Discovery Fase 14.
**Archivos:** `src/app/api/accounting/receivables/payments/[paymentId]/reverse/route.ts`, `src/app/api/accounting/payables/payments/[paymentId]/reverse/route.ts`.
**Impacto:** El P&L queda inflado permanentemente. La entrada original sigue viva contablemente.
**Fix:** mover a Fase 14 (cuando exista el motor de asientos doble). El plan original lo delegaba implícitamente, no lo trataba.

### CRIT-2 · Anulación de venta crea `EXPENSE` paralelo en lugar de revertir
**Detectado por:** Discovery Fase 14 + Discovery Fase 20.
**Archivos:** `src/app/api/sales/[id]/route.ts:149,162,183,187`.
**Síntoma:** Cada anulación genera asiento "Devoluciones POS" tipo EXPENSE. El INCOME original queda. Resultado: revenue net inflado a perpetuidad.
**Fix:** mover a Fase 14, no diferir a Fase 20. Una vez que exista `JournalEntry`, la anulación debe crear el asiento contrario con las mismas cuentas y signos opuestos.

### CRIT-3 · `checkQuota` es dead code
**Detectado por:** Discovery Fase 24-26.
**Archivos:** `src/lib/plans.ts:457` define la función; `grep -rn "checkQuota" src/` retorna solo esa línea.
**Impacto:** El modelo comercial del SaaS no se aplica. Cualquier cliente puede exceder su plan libremente. Lo que el dueño promete en pricing no se cumple en producción.
**Fix:** Fase 24 debe agregar 5 llamadas mínimas (`products`, `branches`, `users`, `salesPerMonth`, `payrollEmployees`).

### CRIT-4 · 75 handlers + 0 usan `withTenantContext`
**Detectado por:** Discovery Fase 24-26.
**Síntoma:** Toda la app sigue conectando como role `postgres` (BYPASSRLS). El trabajo de Fase 13 (role `app_user`, RLS activa, policies) está dormido. La defensa-en-profundidad no existe.
**Fix:** Fase 24 (o mini-fase 24a) debe migrar los 75 handlers a `withTenantContext(tenant.companyId, (tx) => ...)`. Esfuerzo: 2-3 días.

---

## 3. Hallazgos altos no triviales

### H1 · `PayrollItem PUT` sin tenant guard
**Discovery:** Fase 18.
**Archivo:** `src/app/api/hr/payroll-items/[id]/route.ts`.
**Síntoma:** Cualquier usuario con `payroll:manage` puede modificar `PayrollItem` de OTRA empresa si conoce el UUID. RLS dormida no protege todavía.
**Fix:** sumar a Fase 18 o adelantar como hotfix en Fase 14 (es one-liner).

### H2 · `initializeAccountingCategories` es huérfana
**Discovery:** Fase 14.
**Síntoma:** El helper existe pero NUNCA se llama en seed, onboarding ni admin/companies. Cada empresa nueva arranca sin plan de cuentas; las categorías se crean por demanda con nombres distintos por empresa.
**Fix:** parte natural de Fase 14 al introducir `ChartOfAccount`.

### H3 · Asientos contables FUERA de `$transaction`
**Discovery:** Fase 14 + Fase 4 previa.
**Archivos:** `purchases/route.ts`, `pos/expense/route.ts`, `customers/[id]/payments/route.ts` usan `createAccountingEntryAsync` post-transaction. Si el ack al cliente vuelve después del commit pero antes del side effect contable, queda movimiento sin asiento.
**Fix:** parte natural de Fase 14 (todos los call sites se refactorizan).

### H4 · 3 endpoints redundantes para cobro de cliente
**Discovery:** Fase 17 + Fase 21.
**Archivos:** `customers/[id]/pay`, `customers/[id]/payments`, `accounting/receivables/[customerId]/pay` — todos hacen lo mismo con bugs distintos.
**Fix:** consolidar en `customers/[id]/payments`, deprecar los otros dos. Fase 17 debe hacerlo.

### H5 · Devolución `CARD`/`TRANSFER` no genera `BankTransaction`
**Discovery:** Fase 20 + Fase 21 + Fase 24-26.
**Archivos:** `pos/returns/route.ts`, `sales/[id]/return/route.ts`.
**Síntoma:** Refund por tarjeta/transferencia no afecta saldo bancario. Cliente queda con balance positivo en sistema pero el banco no devolvió plata (o sí lo hizo y el sistema no lo refleja).
**Fix:** Fase 20 al refactorizar anulación.

### H6 · `DeliveryNote.noteNumber` con race condition
**Discovery:** Fase 20.
**Archivo:** `src/app/api/delivery-notes/route.ts:88-99`.
**Síntoma:** Dos despachos concurrentes pueden recibir el mismo noteNumber. En FEL esto es bloqueante (correlativo único obligatorio).
**Fix:** Fase 20 o Fase 16 (lo que llegue primero).

### H7 · 0 tests unitarios + 2 tests e2e (uno probablemente roto en CI)
**Discovery:** Fase 24-26.
**Síntoma:** No hay framework de tests unitarios instalado. `multi-tenant-isolation.spec.ts` requiere 2 tenants seedeados y el seed solo crea 1.
**Fix:** Fase 25 empieza desde cero. Extender seed para 2 tenants antes de cualquier e2e cross-tenant. Setup de Vitest como pre-requisito.

### H8 · Supabase plan FREE pausa después de 7 días inactivo
**Discovery:** Fase 24-26.
**Síntoma:** El plan original asumió NANO ($25/mo) que no se pausa. En FREE, si un cliente no usa el sistema una semana (vacaciones, navidad), el ERP queda offline hasta que alguien reactive.
**Fix:** cron externo en GitHub Actions cada 6 días que toque `/api/health`. Backup mensual manual obligatorio (no opcional).

---

## 4. Ajustes recomendados al plan original

| # | Ajuste | Justificación |
|---|---|---|
| A1 | **Mover CRIT-1, CRIT-2, H3, H2 de "Fase 20/post" a Fase 14** | Una vez que existe el motor de partida doble, estos fixes son adyacentes (cada uno ~30 líneas). Diferirlos a Fase 20 es trabajo adicional + datos contables corruptos por 5+ fases más. |
| A2 | **Mover Sale.tax hardcoded de Fase 24 a Fase 16** | Fase 16 ya refactoriza el cálculo de IVA por línea. Tocarlo aparte en Fase 24 es duplicación. |
| A3 | **Agregar mini-fase 24a: handler migration a `withTenantContext`** | Sin esto, el role `app_user` de Fase 13 queda eternamente dormido. 2-3 días, debería ir antes de hardening de bugs porque cambia el patrón base de los handlers. |
| A4 | **Dividir Fase 18 (planilla GT) en sub-fases 18a/b/c/d** | El audit de Fase 18 muestra que la planilla actual implementa 10% de la legalidad GT. Es la fase más grande del plan junto con Fase 14 y Fase 19. Dividir: 18a cálculos legales + refactor PayrollItem; 18b asiento doble + endpoint /pay; 18c boleta PDF + CSV IGSS; 18d indemnización + EmployeeLoan + EmployeeBalance. |
| A5 | **Tachar source maps Sentry de Fase 24** | Ya está hecho en Fase 13 (`widenClientFileUpload: true, hideSourceMaps: true` en next.config). |
| A6 | **Ajustar Fase 26 para Supabase FREE** | Backup mensual manual obligatorio. Cron externo anti-pausa obligatorio. Stage env opcional/manual. Documentar trigger para migrar a NANO/PRO cuando se cumpla N clientes. |
| A7 | **Corregir título de Fase 24 (eliminar "2FA TOTP")** | El plan tiene contradicción: el título lista 2FA TOTP pero la sección lo excluye explícitamente por decisión del dueño. |
| A8 | **Agregar consolidación de 3 endpoints de cobro a Fase 17** | Consolidar `customers/[id]/pay` + `customers/[id]/payments` + `accounting/receivables/[customerId]/pay` en uno solo. |

---

## 5. Estimación de esfuerzo revisada por fase

Basado en los discovery individuales + ajustes A1-A8:

| Fase | Plan original (implícito) | Estimación post-audit | Notas |
|---|---|---|---|
| **14** Plan de cuentas + partida doble | "1 sprint" | **6-8 días** | Incluye CRIT-1, CRIT-2, H2, H3 (movidos desde otras fases). |
| **15** Costeo promedio + StockMovement | "1 sprint" | **5-7 días** | 13 call sites de stock + helper centralizado + kardex reescrito. |
| **16** FEL infra + MockProvider | "1 sprint" | **12-14 días** | Esencialmente arrancar de cero. 5 modelos nuevos. Incluye Sale.tax fix de A2. |
| **17** CxC/CxP + aging | "1 sprint" | **4-6 días** | + consolidación de endpoints A8 + Supplier.creditDays. |
| **18** Planilla GT | "1 sprint" | **15-18 días (4 sub-fases)** | 10% implementado hoy. Dividir según A4. |
| **19** Compras enterprise | "1 sprint" | **10-14 días** | 5 modelos nuevos + migración legacy + UI rehecha. |
| **20** Ventas enterprise | "1 sprint" | **10-14 días** | 6 modelos nuevos. CRIT-2 ya solucionada en Fase 14, reduce scope. |
| **21** Multi-moneda | "1 sprint" | **5-7 días** | Snapshot exchangeRate en todos los documentos monetarios. |
| **22-23** UI/UX + Settings | "1 sprint" | **10-12 días** | 33 páginas a tocar + ~17 reportes a maquetar. |
| **24a** Handler migration + cuotas | (no en plan) | **3-4 días** | A3 nuevo. |
| **24b** Bugs silenciosos remanentes | "1 sprint" | **2-3 días** | 7 items netos (los demás caen en fases anteriores). |
| **25** Tests + docs | "1 sprint" | **5-7 días** | Vitest setup desde cero + e2e expansion + docs. |
| **26** Ops | "1 sprint" | **3-4 días** | Health check + smoke + runbook + cron anti-pausa + backup mensual. |

**Total estimado:** ~90-120 días de trabajo enfocado de un agente competente con verificación cruzada en cada fase.

---

## 6. Dependencias entre fases (más fuertes que el plan sugiere)

```
                    Fase 13 (cerrada)
                          ↓
                       Fase 14 ────────────────────────┐
                          ↓                            │
                    ┌─────┼─────┐                      │
                    ↓     ↓     ↓                      ↓
                  Fase 15 Fase 16 Fase 17           Fase 24a
                    ↓     ↓     ↓                   (handler
                    └─→ Fase 18 ←┘                   migration)
                          ↓                            ↓
                       Fase 19                      Fase 24b
                          ↓                         (bugs)
                       Fase 20                         ↓
                          ↓                         Fase 25
                       Fase 21                         ↓
                          ↓                         Fase 26
                      Fase 22-23
```

**Observaciones clave:**
- Fase 14 es bloqueante para 15, 16, 17, 18, 21 (todas necesitan partida doble).
- Fase 18 depende fuerte de 14 + 17 (anticipos como CxC del empleado, asientos de planilla).
- Fase 16 depende fuerte de 14 (asientos con IVA débito/crédito).
- Fase 21 depende fuerte de 14 (asiento de diferencia cambiaria con DR/CR).
- Fase 24a (handler migration) puede ir en paralelo a 15-21 si se quiere acortar timeline. No tiene dependencias fuertes.

**Recomendación:** ejecutar Fase 14 → 15 → 16 → 17 en serie estricta. Después de 16, las Fases 18, 19, 20, 21 tienen orden flexible.

---

## 7. Decisiones del dueño pendientes (antes de Fase 14)

Para no atrasar Fase 14, conviene resolver estas en la primera sesión de implementación. Las restantes pueden ir resolviéndose en su fase.

### Decisiones para Fase 14

1. **Numeración del plan de cuentas:** ¿código tipo `1.1.01` (jerárquico decimal) o numérico plano (`1001`, `1002`)?
   - **Recomendado:** jerárquico decimal (estándar contable GT, fácil de leer).
2. **¿Sembrar plan de cuentas guatemalteco estándar?** El plan dice sí. Confirmación.
   - **Recomendado:** sí, con cuentas mínimas: 1.1.01 Caja, 1.1.02 Bancos, 1.1.04 Clientes, 1.1.05 IVA Crédito, 1.2.01 Inventario, 2.1.01 Proveedores, 2.1.02 IVA Débito, 2.1.03 ISR Retenido, 2.1.04 IGSS Patronal, 2.1.05 Sueldos por pagar, 3.1.01 Capital, 4.1.01 Ventas, 5.1.01 Costo de Ventas, 5.2.01 Sueldos, 5.2.02 IGSS Patronal Gasto, 5.2.03 Gastos Operativos.
3. **Migración de datos legacy:** ¿migrar `AccountingEntry` actuales a `JournalEntry` con regla automática INCOME → Caja/Ventas, EXPENSE → Gasto/Caja?
   - **Recomendado:** sí, con campo `AccountingEntry.migrated` para auditoría. Borrar `AccountingEntry` y `AccountingCategory` en Fase 25 cleanup.
4. **Centros de costo:** ¿agregar `JournalLine.costCenterId` ahora (opcional) o diferir?
   - **Recomendado:** agregar como opcional ahora, dejar la UI para Fase 22.
5. **Período fiscal:** ¿enero-diciembre? ¿`AccountingPeriod` mensual o anual?
   - **Recomendado:** mensual + permitir cierre anual. Inicial: período `2026-05` ABIERTO.
6. **Posting inmediato vs. dos pasos (DRAFT → POSTED):** ¿cada asiento se publica al crear, o queda en DRAFT y se publica explícitamente?
   - **Recomendado:** posting inmediato para asientos generados por sistema (ventas, compras, etc.); DRAFT para asientos manuales que requieren revisión.

### Decisiones para fases posteriores (puede esperar)

7. **Bono 14/aguinaldo: provisión mensual vs pago directo** (Fase 18).
8. **EmployeeLoan: CxC del empleado o modelo independiente** (Fase 18 + Fase 17).
9. **PaymentApplication vs `AccountPayment.saleId`** (Fase 17).
10. **Cron runtime: Vercel Cron, Supabase pg_cron, o GitHub Actions** (Fase 17 + Fase 26).
11. **Stage environment: aceptar sin stage separado** o pasar a Supabase pago para tenerlo (Fase 26).

---

## 8. Roadmap propuesto

```
Sprint 0 (ya cerrado): Fase 13
─────────────────────────────────────────────
Sprint 1 (siguiente):  Fase 14 · Plan de cuentas + partida doble
                                 + CRIT-1 + CRIT-2 + H2 + H3 + H1 (one-liner)
                       (6-8 días)
─────────────────────────────────────────────
Sprint 2:              Fase 15 · Costeo + StockMovement
                       (5-7 días)
─────────────────────────────────────────────
Sprint 3:              Fase 16 · FEL + MockProvider + Sale.tax + H6
                       (12-14 días) — fase más larga
─────────────────────────────────────────────
Sprint 4:              Fase 17 · CxC/CxP + aging + H4
                       (4-6 días)
─────────────────────────────────────────────
Sprint 5-8:            Fases 18a/b/c/d · Planilla GT
                       (15-18 días)
─────────────────────────────────────────────
Sprint 9:              Fase 19 · Compras enterprise
                       (10-14 días)
─────────────────────────────────────────────
Sprint 10:             Fase 20 · Ventas enterprise + H5
                       (10-14 días)
─────────────────────────────────────────────
Sprint 11:             Fase 21 · Multi-moneda
                       (5-7 días)
─────────────────────────────────────────────
Sprint 12:             Fases 22-23 · UI + Settings avanzados
                       (10-12 días)
─────────────────────────────────────────────
Sprint 13a:            Fase 24a · Handler migration + cuotas (CRIT-3, CRIT-4)
                       (3-4 días)
Sprint 13b:            Fase 24b · Bugs silenciosos remanentes
                       (2-3 días)
─────────────────────────────────────────────
Sprint 14:             Fase 25 · QA + docs
                       (5-7 días)
─────────────────────────────────────────────
Sprint 15:             Fase 26 · Ops + backups + runbook (ajustado FREE)
                       (3-4 días)
```

Tiempo total: ~14-15 sprints. Si cada sprint son ~5 días hábiles, son **~75 días hábiles** (3.5-4 meses de trabajo enfocado).

---

## 9. Riesgos transversales

1. **Cuentas del plan de cuentas inconsistentes entre fases.** Si Fase 14 siembra cuentas con nombres específicos pero Fase 16 (FEL) y Fase 18 (planilla) usan otras nomenclaturas, se rompe la integridad. **Mitigación:** definir el catálogo de cuentas en `src/lib/accounting/accounts.ts` como constantes desde Fase 14 (`const ACCOUNTS = { CASH: '1.1.01', AR: '1.1.04', VAT_OUT: '2.1.02', ... }`) y usarlo desde Fase 16/17/18/21.

2. **Migración de datos legacy.** Cada fase contable (14, 15, 16) requiere migrar datos existentes. Si un tenant tiene datos sucios (categorías huérfanas, costos en 0, etc.) la migración falla. **Mitigación:** correr `integrity-check` previo en cada fase y reportar tenants problemáticos al dueño antes de migrar.

3. **Cambios de schema acumulativos.** El plan introduce ~15-20 modelos nuevos a lo largo de 13 fases. Si el cliente está en producción todo el tiempo, cada migración debe ser zero-downtime. **Mitigación:** todas las migraciones aditivas, nunca DROP de columnas/tablas hasta una fase de cleanup explícita (post-Fase 26).

4. **Tests llegan al final (Fase 25).** Toda la lógica nueva de Fases 14-23 se valida solo manualmente hasta Fase 25. **Mitigación:** agregar tests unitarios obligatorios para lógica contable (DR=CR), planilla (cálculos legales) y aging buckets EN cada fase relevante, no diferir todo a Fase 25.

5. **Supabase FREE pause durante una fase larga.** Si pasan 7 días entre sesiones de trabajo, la DB se pausa y el agente que retome la fase pierde 5-30 min reactivando. **Mitigación:** activar el cron anti-pausa de Fase 26 ANTES de Fase 14 (es trivial: schedule GitHub Action que toca `/api/health`).

---

## 10. Próximos pasos inmediatos

1. **Dueño:** revisar este documento y validar/ajustar las decisiones 1-6 de la sección 7 (decisiones de Fase 14).
2. **Agente principal:** una vez tomadas las decisiones, lanzar subagente especialista accounting/finance para Fase 14 con un brief que incluya:
   - Decisiones 1-6 ya resueltas.
   - Scope ampliado con CRIT-1, CRIT-2, H1-H3 (incluidos en Fase 14, no diferidos).
   - Constantes en `src/lib/accounting/accounts.ts` para evitar cuentas mágicas.
   - Tests unitarios obligatorios (DR=CR, anulación, migración).
3. **Agente principal:** lanzar segundo subagente independiente para verificación cruzada al cierre de Fase 14, con criterios objetivos: typecheck/lint verdes, balance general cuadra, migración de datos legacy completa, tests de partida doble pasan, no quedan llamadas viejas a `createAccountingEntry`.

---

**Estado:** documento listo para que el dueño tome las 6 decisiones de Fase 14 y se arranque la implementación. Tras la implementación, este master discovery se cierra y cada fase tiene su `phase-N-completion.md` + `phase-N-verification.md` como en Fase 13.
