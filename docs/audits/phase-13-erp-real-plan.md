# Plan de trabajo · Convertir SIMTECH en un ERP real

Fecha: 2026-05-10
Estado: aprobado. Plan a ejecutar fase por fase con subagente especialista.

## Restricciones aprobadas por el dueño

1. **Sin email transaccional.** Se descarta password reset por email, notificaciones por email y cualquier flujo que dependa de servicio de mail (Resend/Postmark/SES). Notificaciones quedan in-app.
2. **Sin certificador FEL contratado todavía.** Se implementa toda la lógica FEL (modelos, generación de XML, anulación, NC/ND, libros, IVA por línea, régimen tributario) con un `MockProvider` que certifica localmente. Cuando se contrate Infile/Digifact, solo se intercambia el provider.

## Principios

- Cada fase es atómica: termina con código + migraciones + tests + lint/tsc verde.
- Se implementa con subagente especialista a cargo. El dueño solo interviene para `git push` al final de cada fase.
- Las fases con dependencia dura van en orden. Las que no tienen dependencia pueden paralelizarse después del Sprint 0.
- Cada fase incluye verificación independiente por un segundo subagente al cierre.

## Orden de ejecución y dependencias

```
SPRINT 0 (Fundación)
  Fase 13 · Migraciones, RLS activa, infra base
  Fase 14 · Plan de cuentas + partida doble + cierre de período
  Fase 15 · Costeo promedio ponderado + StockMovement

SPRINT 1 (Núcleo fiscal)
  Fase 16 · FEL infraestructura completa (sin enchufar certificador)
  Fase 17 · CxC/CxP con dueDate por documento + aging real

SPRINT 2 (Operacional)
  Fase 18 · Planilla Guatemala completa
  Fase 19 · Compras enterprise (PR → RFQ → PO → GRN → Invoice + retenciones)
  Fase 20 · Ventas enterprise (cotización → pedido → despacho → factura)

SPRINT 3 (Capacidades avanzadas)
  Fase 21 · Multi-moneda + ExchangeRate + diferencia cambiaria
  Fase 22 · UI/UX completo (mobile, reportes, dashboards, tablas)
  Fase 23 · Configuración avanzada (plantillas, impresoras, series, NIT por sucursal)

SPRINT 4 (Cierre)
  Fase 24 · Hardening: bugs silenciosos + cuotas reales + 2FA TOTP
  Fase 25 · QA: tests e2e en CI + documentación
  Fase 26 · Operaciones: backups, runbook, stage env, smoke tests
```

## Detalle por fase

### Fase 13 · Foundation: migraciones, RLS activa, infra base
Subagente: **devops/infra**.
Dependencias: ninguna.

Entregables:
- Convertir `prisma/manual_migrations/*.sql` a migraciones Prisma reales en `prisma/migrations/`.
- Generar baseline aplicado a Supabase y confirmar drift = 0.
- Crear role Postgres `app_user` sin `BYPASSRLS`. Hacer que la aplicación use ese role.
- Verificar que las policies RLS existentes filtren con `current_setting('app.tenant_id')`.
- Habilitar tests e2e en CI (descomentar bloque en `.github/workflows/ci.yml`).
- Configurar Sentry para frontend + backend (DSN en env, error boundary global).
- Bucket Supabase: cambiar archivos privados a signed URLs (expiración 1h).
- Guard en `prisma/seed.ts`: abortar si `NODE_ENV === 'production'`.
- Rotación de credenciales documentada en runbook.

Validación: `pnpm test:e2e` corre en CI · drift Prisma 0 · query con role app_user retorna solo registros del tenant.

### Fase 14 · Plan de cuentas + partida doble + cierre de período
Subagente: **accounting/finance** (perfil con experiencia contable formal).
Dependencias: Fase 13.

Entregables:
- Nuevo modelo `ChartOfAccount` jerárquico con código (1.1.01, 1.1.02…), nombre, tipo (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE), parentId, isPosting (solo cuentas hoja aceptan asientos).
- Seed con plan de cuentas guatemalteco estándar (Caja, Bancos, IVA crédito, IVA débito, ISR retenido, Sueldos por pagar, IGSS por pagar, etc.).
- Nuevos modelos `JournalEntry` y `JournalLine` (cada line tiene `accountId`, `debit`, `credit`, validador que la suma de débitos = suma de créditos).
- Migrar todos los `AccountingEntry` actuales a `JournalEntry` con 2 líneas (regla automática INCOME → Caja DR / Ventas CR, EXPENSE → Gasto DR / Caja CR).
- Refactor de todos los puntos donde hoy se llama `createAccountingEntry`: ventas, compras, pagos, reversas, planilla. Ahora generan asiento doble con cuentas reales.
- Reversa de pago obligatoriamente genera asiento contrario (no solo marca el original como VOID).
- Nuevo modelo `AccountingPeriod` con `status: OPEN | CLOSED` y endpoint de cierre. Bloquear creación/edición de entries en período CLOSED.
- Reportes nuevos:
  - `GET /api/reports/accounting/balance-sheet` — Balance General (Activo = Pasivo + Patrimonio)
  - `GET /api/reports/accounting/cash-flow` — Flujo de Caja
  - `GET /api/reports/accounting/trial-balance` — Balance de Comprobación
  - `GET /api/reports/accounting/general-journal` — Libro Diario
  - `GET /api/reports/accounting/general-ledger` — Libro Mayor por cuenta
- Refactor del P&L existente para que lea de `JournalEntry` por tipo de cuenta, no de la columna `type` legacy.

Validación: Balance General cuadra (Activo = Pasivo + Patrimonio en cualquier período cerrado). Suma de débitos = suma de créditos en cada JournalEntry. Toda venta/compra/pago genera asiento doble correcto.

### Fase 15 · Costeo promedio ponderado + StockMovement
Subagente: **inventory**.
Dependencias: Fase 14 (para asiento de COGS correcto).

Entregables:
- Nuevo modelo `StockMovement` (id, productId, variantId, branchId, type: PURCHASE/SALE/ADJUSTMENT_IN/ADJUSTMENT_OUT/TRANSFER_OUT/TRANSFER_IN/RETURN/COUNT, quantity con signo, unitCost, referenceType, referenceId, date, balanceAfter).
- Trigger automático en cada operación: cada vez que stock se modifica, se inserta una fila de StockMovement.
- Cálculo de **costo promedio ponderado** en cada recepción de compra:
  - `nuevoCosto = (stockAnterior * costoAnterior + cantidadCompra * costoCompra) / (stockAnterior + cantidadCompra)`
  - Persistir `Product.cost` con el promedio recalculado, no con el último.
- Reescribir `SaleItem.unitCost` para que capture el costo promedio actual al momento de la venta (snapshot).
- Costeo correcto de bundles: cuando se vende un bundle, el `unitCost` del SaleItem es la suma de costos de sus componentes en ese momento.
- Refactor del endpoint `/api/reports/inventory/kardex` para leer directo de StockMovement, sin reconstruir desde 5 tablas en memoria.
- Eliminar la ventana de 90 días: el saldo running se calcula desde el primer movimiento histórico.
- Reescribir `/api/reports/inventory/valuation` para usar costo promedio.
- Asiento contable de COGS al vender: DR Costo de Ventas / CR Inventario.

Validación: en un escenario de 3 compras a precios distintos + 2 ventas, la valuación del inventario coincide con el cálculo manual de promedio ponderado. Kardex muestra saldo running desde el primer movimiento.

### Fase 16 · FEL infraestructura completa (sin certificador)
Subagente: **tax/FEL** especialista en Guatemala.
Dependencias: Fase 14.

Entregables:
- Nuevo modelo `TaxDocument`:
  - id, saleId (o creditNoteId, debitNoteId), tipo (FACT/NCRE/NDEB), seriePrefix, numero, autorizacionSAT, fechaCertificacion, dteUuid, xmlFirmado, hashCertificacion, estado (PENDING/CERTIFIED/CANCELLED/REJECTED), providerResponseJson, providerName.
- Nuevo modelo `TaxSeries` por sucursal y tipo de documento (FACT, NCRE, NDEB) con prefix, nextNumber, autorización SAT.
- Nuevos modelos `CreditNote` y `DebitNote` (notas de crédito y débito) con flujo análogo a Sale.
- Campo `Company.taxRegime`: `PEQUEÑO_CONTRIBUYENTE` (5% IVA) o `GENERAL` (12% IVA).
- Refactor de Sale para calcular **IVA por línea**:
  - Cada SaleItem persiste `taxRate` (0 si exento, 5 o 12 según régimen y producto).
  - `Sale.tax` deja de ser hardcoded a 0; se calcula como suma de taxes por línea.
  - Respetar `Product.isTaxExempt`.
- Refactor de Sale para integrar `SaleItem.discount` por línea en el cálculo de subtotal.
- Provider pattern:
  - Interface `FelProvider` con métodos `certify(document)`, `cancel(uuid, reason)`, `generateXml(document)`.
  - Implementaciones: `InfileProvider`, `DigifactProvider`, `MockProvider`.
  - `MockProvider`: genera UUID aleatorio, hash determinístico, devuelve XML válido según especificación SAT, responde como si hubiera certificado. Se usa para desarrollo y testing hasta tener certificador real.
  - Factory que elige provider según `Company.felProvider`.
- Generador de XML DTE según especificación SAT (https://portal.sat.gob.gt/portal/factura-electronica/) con todos los campos obligatorios.
- Endpoint `POST /api/fel/certify/:saleId` que llama al provider, persiste el resultado en TaxDocument, actualiza Sale.invoiceNumber con el correlativo certificado.
- Endpoint `POST /api/fel/cancel/:documentId` para anular un DTE.
- Endpoint `POST /api/credit-notes` y `POST /api/debit-notes` con su propio flujo de certificación.
- Reportes tributarios:
  - `GET /api/reports/tax/sales-book` — Libro de Ventas SAT (CSV exportable)
  - `GET /api/reports/tax/purchases-book` — Libro de Compras SAT con NIT proveedor
  - `GET /api/reports/tax/iva-summary` — resumen de IVA crédito/débito por período
- Asiento contable correcto al certificar venta:
  - DR Cliente o Caja
  - CR Ventas (subtotal)
  - CR IVA Débito Fiscal (tax)
- Credenciales FEL cifradas at rest (pgcrypto o aplicación) en CompanySettings.

Validación: al activar `MockProvider`, una venta completa genera DTE con XML válido, correlativo, asiento contable doble correcto, y aparece en el Libro de Ventas SAT. Anulación genera NCRE asociada.

### Fase 17 · CxC/CxP con dueDate por documento + aging real
Subagente: **AR/AP**.
Dependencias: Fase 14.

Entregables:
- Schema: agregar `dueDate` a `Sale` (cuando se vende a crédito) y validar que ya exista en `SupplierPayable`.
- Schema: `Customer.creditDaysDefault` y `Customer.maxOverdueDays` (días de tolerancia antes de bloquear).
- Cron job diario que actualiza `SaleStatus`/`PayableStatus` a `OVERDUE` cuando `dueDate < now()`.
- Endpoint nuevo `GET /api/reports/accounting/aging-receivables` con buckets 0-30 / 31-60 / 61-90 / +90 por cliente.
- Endpoint nuevo `GET /api/reports/accounting/aging-payables` con buckets por proveedor.
- Bloqueo de venta a crédito si cliente tiene facturas vencidas > `maxOverdueDays` (configurable por empresa, default 30).
- Estado de cuenta del cliente descargable (PDF + CSV): listado de todas las facturas, pagos, saldo, aging.
- Notificaciones in-app de moras: cron diario crea Notification para usuarios con rol cobranzas.
- Nuevo modelo `CustomerCredit` para anticipos del cliente (paga antes de la venta) y notas de crédito a favor.
- Aplicación de CustomerCredit en una venta posterior (descontando del saldo del crédito).

Validación: cliente con 3 facturas (una vencida 45 días) aparece en bucket 31-60 con monto correcto. Intento de venta a crédito con factura vencida > umbral retorna 409.

### Fase 18 · Planilla Guatemala completa
Subagente: **HR/payroll GT**.
Dependencias: Fase 14 (asientos), Fase 17 (anticipos como crédito al empleado).

Entregables:
- Cálculo de **ISR** según tabla SAT vigente (tramos progresivos sobre renta imponible anual).
- **Bono 14** proporcional julio (julio del año anterior a junio del actual) calculado automáticamente en el período correspondiente.
- **Aguinaldo** proporcional diciembre (diciembre del año anterior a noviembre del actual).
- **Indemnización por despido**: cuando `Employee.terminationDate` se setea, calcular automáticamente:
  - Indemnización = sueldo último mes × años trabajados
  - Bono 14 proporcional al período no cobrado
  - Aguinaldo proporcional al período no cobrado
  - Vacaciones no gozadas
- Nuevo modelo `EmployeeBalance`: días devengados de vacaciones, gozados, disponibles. Actualizado por cron y por aprobación de LeaveRequest.
- Nuevo modelo `EmployeeLoan`: anticipos/préstamos al empleado con saldo y deducción automática en planilla siguiente.
- **Horas extras**: calcular desde `Attendance.checkIn/checkOut` con jornadas:
  - Ordinaria (hasta 8 horas)
  - Extra ordinaria (8-12h, +50%)
  - Extra nocturna (después de 18h, +100%)
- **Séptimo día** calculado automáticamente para jornaleros.
- **IGSS patronal** (10.67%) + **IRTRA** (1%) + **INTECAP** (1%) como cuotas patronales.
- Bonificación incentivo Q250 prorrateada según período (Q125 si es quincenal, Q250 si mensual).
- Asiento contable al pagar planilla (todas las cuentas afectadas):
  - DR Sueldos y salarios (gasto)
  - DR Cuotas patronales
  - CR IGSS por pagar
  - CR ISR retenido por pagar
  - CR Sueldos por pagar
  - Al efectuar el pago: DR Sueldos por pagar / CR Banco
- Boleta de pago PDF descargable por empleado con desglose completo.
- Reporte para IGSS (formato CSV requerido por la institución).
- Endpoint `POST /api/hr/payroll/:id/pay` que genera el asiento y mueve cuentas.

Validación: empleado con sueldo Q5,000 trabajando un mes completo recibe boleta con IGSS (-Q241.50), ISR según tabla, bonificación incentivo (+Q250), y la planilla aprobada genera asiento doble verificable.

### Fase 19 · Compras enterprise
Subagente: **purchasing/procurement**.
Dependencias: Fase 14, Fase 15, Fase 16 (retenciones afectan IVA).

Entregables:
- Nuevos estados PurchaseOrder: `DRAFT`, `REQUESTED`, `ORDERED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `INVOICED`, `CANCELLED`.
- Nuevo modelo `GoodsReceivedNote` (GRN) con items y cantidad recibida por item (puede ser menor a la PO).
- Stock se incrementa **solo al hacer GRN**, no al crear la PO.
- Costo promedio ponderado se recalcula en cada GRN (no antes).
- Factura del proveedor separada: nuevo modelo `SupplierInvoice` con `purchaseOrderId` opcional (puede llegar antes/después del GRN).
- **Retenciones**:
  - IVA pequeño contribuyente (5%)
  - ISR sobre servicios (5%-7%)
  - Configurable por proveedor.
- **Landed cost**: prorrateo de gastos adicionales (flete, aduana, seguro) sobre los items del GRN según peso/valor.
- Nuevo modelo `SupplierCreditNote` para devolución a proveedor.
- Solicitud de cotización (`RFQRequest`) a múltiples proveedores con comparativa.
- Workflow de aprobación de PO por monto (configurable: PO > Q5,000 requiere aprobación de manager).
- `PurchaseOrderItem.quantity` migrado a `Decimal` para soportar fraccionables (kg, litros).
- `PurchaseOrder.reference` con unique constraint opcional `(companyId, supplierId, reference)` para evitar doble registro de factura proveedor.
- Asiento contable mover `createAccountingEntry` adentro del `$transaction`.

Validación: PO por 100 unidades con GRN parcial de 60 incrementa stock en 60, queda en estado PARTIALLY_RECEIVED, y al hacer segundo GRN de 40 pasa a RECEIVED. Landed cost prorratea correctamente. Retención IVA aparece en libro de compras.

### Fase 20 · Ventas enterprise
Subagente: **sales**.
Dependencias: Fase 14, Fase 15, Fase 16.

Entregables:
- Estados separados Sale: `QUOTE`, `ORDER`, `PARTIALLY_DELIVERED`, `DELIVERED`, `INVOICED`, `COMPLETED`, `CANCELLED`.
- `QUOTE` con `expiresAt` (fecha de validez) y opción de reservar stock.
- `ORDER`: aparta stock (nuevo modelo `StockReservation`).
- `DELIVERY`: descuenta stock + genera DeliveryNote con cantidades despachadas (puede ser parcial).
- `INVOICED`: dispara generación de DTE FEL (depende de Fase 16).
- Descuento por línea: integrar `SaleItem.discount` ya existente en cálculos.
- Nuevo modelo `PriceList`: lista de precios por cliente, segmento o sucursal.
- `CustomerPriceList`: precio especial para un cliente específico en un producto.
- Promociones: tabla `Promotion` con tipo (2x1, descuento %, precio fijo) y vigencia.
- Cupones: tabla `Coupon` con código, descuento, uso máximo, vencimiento.
- Comisiones de vendedor: tabla `CommissionRule` (por vendedor, por categoría, por producto) + `Commission` calculada al cierre del período.
- Reservación de stock al confirmar ORDER (decrementa disponible, no físico).
- Cross-branch fulfillment: vender pidiendo stock de otra sucursal, genera StockTransfer automáticamente.
- Reanudar cotización: leer stock real del producto (no hardcode 999).
- DeliveryNote.noteNumber con lock para evitar colisión en concurrencia.
- Anulación de venta reversa el ingreso original (asiento contrario con misma cuenta), no crea un EXPENSE paralelo.

Validación: cotización con 5 productos, expira en 7 días, se convierte en ORDER (aparta stock), se despacha parcialmente (3 de 5), se factura con DTE certificado (vía MockProvider de Fase 16), se anula la cantidad restante y el stock vuelve. Comisión del vendedor aparece en el reporte de fin de mes.

### Fase 21 · Multi-moneda + ExchangeRate
Subagente: **multi-currency**.
Dependencias: Fase 14, Fase 20.

Entregables:
- Nuevo modelo `ExchangeRate` (currency, rate, date, source).
- Cron diario para actualizar tipos de cambio (puede ser manual al principio).
- Campo `currency` en Sale, PurchaseOrder, Payment, BankAccount.
- Snapshot `exchangeRate` en cada documento (no cambia retroactivamente).
- Conversión a moneda funcional (default GTQ) para reportes consolidados.
- Diferencia cambiaria al cobrar: asiento contable automático con cuenta de ingresos/gastos por diferencia cambiaria.
- BankAccount.currency: cada cuenta en su moneda; transferencias entre cuentas de diferente moneda hacen conversión.
- Reportes: opción de visualizar en moneda original o moneda funcional.

Validación: factura emitida en USD a 7.80 GTQ/USD, cobrada cuando el tipo cambia a 7.85, genera asiento de diferencia cambiaria positivo de 0.05 × monto.

### Fase 22 · UI/UX completo
Subagente: **frontend/UX**.
Dependencias: Fases 14, 15, 16, 17, 18, 19, 20, 21 (necesita que los endpoints existan).

Entregables:
- **Mobile/responsive**:
  - Drawer + hamburguesa en `dashboard/layout.tsx`.
  - POS redimensionable, carrito responsive (no `w-96` fijo).
  - Tablas con vista card en móvil.
- **Tablas**:
  - Paginación servidor en TODAS las tablas (inventory, customers, suppliers, users, branches, audit, receivables, payables, notifications, hr/employees, stock-transfers).
  - Ordenamiento por columna (clickeable headers).
  - Filtros consistentes (un componente reutilizable).
  - Selección múltiple + acciones en masa.
  - Export uniforme a Excel + PDF.
- **UI para reportes huérfanos** (todos los endpoints de reportes ya construidos):
  - Kardex con selector de producto + fechas + sucursal.
  - Slow movers con threshold configurable.
  - Valuación de inventario.
  - P&L con drill-down a cuenta.
  - Balance General.
  - Flujo de Caja.
  - Aging CxC y CxP.
  - Top customers/suppliers/sales by user.
  - Libros tributarios (Ventas, Compras, IVA).
- **Dashboard**:
  - Widgets configurables (drag & drop opcional).
  - Drill-down en gráficos.
  - Comparativo período vs período.
- **POS mejorado**:
  - Suspender venta separado de cotización.
  - Descuento con permiso especial (rol cajero limitado a X%).
  - Atajos de teclado documentados.
- **Configuración**:
  - Test de conexión FEL (cuando haya provider real).
  - UI para plantillas de factura.
  - UI para roles con matriz visual.
- **Navegación**:
  - Búsqueda global Cmd+K (saltar a cualquier entidad por código/nombre).
  - Breadcrumbs en todas las páginas.
  - Manejo de sesión: aviso 5 minutos antes de expiración.
- **Forms**:
  - Reemplazar `confirm()`/`alert()` por `useConfirm` y `useToast` (ya existen).
  - Disabled durante submit en todos los modales.
  - Validación frontend coherente con Zod backend.
- **Skeleton loaders + optimistic updates**.
- **Reemplazar `useEffectEvent`** en NotificationsMenu por API estable.

Validación: en pantalla de 375px todas las pantallas son usables. Todos los reportes ya construidos tienen UI. POS funciona en tablet (768px).

### Fase 23 · Configuración avanzada
Subagente: **settings/config**.
Dependencias: Fase 16, Fase 22.

Entregables:
- Plantillas de factura customizables (header, footer, logos por sucursal, color principal).
- Configuración de impresoras térmicas (58mm / 80mm, layout, número de copias).
- Logo por sucursal.
- Numeración de documentos por serie y establecimiento (alineado con FEL: cada sucursal puede tener su propia serie autorizada).
- Notas configurables al pie de factura por sucursal.
- Configuración de moneda funcional + opción de reportar en moneda alternativa.
- NIT del establecimiento (cada sucursal puede tener NIT distinto si la empresa lo permite).

Validación: dos sucursales emiten facturas con su propio formato, su propio NIT (si aplica) y su propia serie de correlativos.

### Fase 24 · Hardening: bugs silenciosos + cuotas reales
Subagente: **hardening**.
Dependencias: todas las fases anteriores.

Entregables:
- **Bugs silenciosos identificados** (de la auditoría):
  - IVA en Sale no hardcoded.
  - SaleItem.discount integrado.
  - Devolución CARD/TRANSFER genera BankTransaction.
  - DeliveryNote.noteNumber con lock.
  - Anulación reversa ingreso original (no crea EXPENSE paralelo).
  - PurchaseOrder.reference unique opcional (si viene).
  - Validación de saldo bancario activa en payments.
  - PurchaseOrderItem.quantity Decimal.
  - Cron OVERDUE diario.
  - Bonificación incentivo proporcional.
  - UserBranchAccess realmente respetado en requireBranchAccess.
  - checkQuota llamado en endpoints relevantes.
  - useEffectEvent reemplazado.
- **Cuotas reales aplicadas**:
  - maxProducts (en create de producto).
  - maxBranches (en create de sucursal).
  - maxUsers (en create de usuario).
  - maxSalesPerMonth (en POS POST).
  - maxPayrollEmployees (en HR).
  - apiAccess (gating de endpoints públicos).
- Sentry configurado para frontend con source maps.
- Health check `/api/health` con verificación de DB.

Validación: empresa en plan Negocio con 25 productos rechaza el producto 26 con error de cuota.

**Nota:** 2FA TOTP queda **fuera de alcance** (decisión del dueño 2026-05-10). Por ahora solo autenticación con credenciales. Se evalúa en el futuro junto con email transaccional.

### Fase 25 · QA: tests + documentación
Subagente: **QA**.
Dependencias: Fase 24.

Entregables:
- Tests unitarios para lógica crítica:
  - Cálculo de costo promedio ponderado.
  - Cálculo de ISR/Bono14/Aguinaldo/Indemnización.
  - Validación de partida doble (debits = credits).
  - Aging buckets.
  - IVA por línea por régimen.
  - Diferencia cambiaria.
- Tests e2e completos:
  - Flujo de venta con FEL Mock.
  - Flujo de compra con GRN parcial.
  - Cierre de período + intento de editar entry posterior.
  - Cobranza con bloqueo por mora.
  - Planilla mensual completa.
- Cobertura mínima 60%.
- Documentación de usuario por módulo en `docs/user/`.
- Documentación técnica de modelo de datos en `docs/technical/data-model.md`.
- Plan de migración para clientes existentes (cómo pasar de schema viejo a nuevo).

Validación: `pnpm test && pnpm test:e2e` corre verde en CI.

### Fase 26 · Operaciones: backups, runbook, stage, smoke tests
Subagente: **ops**.
Dependencias: Fase 25.

Entregables:
- **Backups en Supabase Free tier:** snapshots diarios con **retención corta** (3-7 días) para no saturar la cuota gratuita.
  - Documentar el plan de migración a retención de 30 días cuando se pase a plan pago.
  - Backup adicional manual mensual descargado fuera de Supabase (S3, Google Drive, disco local del dueño).
- Procedimiento de restore probado (drill cada trimestre).
- Stage environment separado de prod con datos sintéticos.
- Smoke tests post-deploy (script que verifica que login, crear venta, crear compra, ver reporte funcionan).
- Runbook de incidentes (qué hacer si: DB down, RLS rompe, FEL provider down, planilla con error, etc.).
- Plan de respuesta a incidentes documentado.
- Monitoreo: Sentry alerts + uptime monitoring externo.

Validación: drill de restore desde backup completa exitosamente en stage. Smoke test corre en CI después de cada deploy a prod.

## Cosas explícitamente fuera de alcance

- **Email transaccional** (reset password, notificaciones por email, confirmaciones). Razón: sin recursos para contratar servicio. Cuando se contrate Resend/Postmark/SES, se agrega como fase posterior.
- **2FA (autenticación de dos factores).** Decisión del dueño: por ahora solo credenciales (email + password). Se evalúa más adelante junto con el servicio de email.
- **Stripe billing automatizado**. Diferido hasta ≥10 clientes (ver `docs/business/billing-decision.md`).
- **Conexión real con certificador FEL**. Toda la infraestructura queda lista; cuando se contrate Infile o Digifact, se cambia el provider de `MockProvider` a `InfileProvider` y se cargan credenciales.
- **App móvil nativa** (iOS/Android). La web responsive es suficiente por ahora.
- **Integración con Visanet/Credomatic** directa.

## Cómo se ejecuta cada fase

1. Subagente recibe contexto completo de la fase (esta sección + auditoría previa + restricciones).
2. Subagente implementa schema, migraciones, endpoints, tests, UI básica si aplica.
3. Subagente corre `pnpm typecheck && pnpm lint && pnpm test` y deja todo verde.
4. Subagente actualiza `docs/audits/phase-N-completion.md` con qué hizo, qué probó y qué quedó pendiente.
5. Segundo subagente independiente verifica el deliverable (audit cruzada de la fase).
6. Dueño solo necesita: `git add -A && git commit -m "feat: Fase N" && git push`.

## Resumen de magnitud

| Sprint | Fases | Trabajo aproximado |
|---|---|---|
| 0 | 13, 14, 15 | foundation + plan de cuentas + costeo |
| 1 | 16, 17 | FEL infra + aging |
| 2 | 18, 19, 20 | planilla GT + compras enterprise + ventas enterprise |
| 3 | 21, 22, 23 | multi-moneda + UI completa + config avanzada |
| 4 | 24, 25, 26 | hardening + QA + ops |

**Cada fase es una corrida de subagente.** Ejecutadas en serie estricta (sin paralelo entre fases con dependencia), el ERP queda listo para venderse honestamente como "ERP real" al final de Fase 26.
