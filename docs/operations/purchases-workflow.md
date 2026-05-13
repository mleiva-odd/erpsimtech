# Operaciones · Workflow de Compras (Fase 19)

## Visión general

El módulo de compras soporta dos flujos paralelos:

- **Fast** (default, retrocompatible): un solo `POST /api/purchases` que crea PO + GRN + SupplierInvoice + Payable + asiento contable atómicamente.
- **Enterprise**: flujo segregado PR → RFQ → PO → GRN → SupplierInvoice → Payable que respeta separación de funciones y aprobaciones.

## Diagrama de estados de PurchaseOrder

```
            ┌─────────┐
            │  DRAFT  │
            └────┬────┘
                 │
       ┌─────────┼─────────┐
       │         │         │
       ▼         ▼         ▼
  PENDING_  APPROVED   CANCELLED ◄── terminal
  APPROVAL    │
       │      ├──────────┐
       ▼      │          │
   APPROVED   ▼          ▼
       │  PARTIALLY_  RECEIVED
       │  RECEIVED       │
       │   │  ▲          │
       │   ▼  │          ▼
       │   PARTIALLY_  INVOICED
       │   RECEIVED      │
       │      │          ▼
       │      └────► CANCELLED
       │
       ▼
   CANCELLED
```

Transiciones legales codificadas en `src/lib/purchases/state-machine.ts`. Estado legacy `COMPLETED` (flujo viejo pre-Fase 19) solo admite `→ CANCELLED`.

## Cuándo usar fast vs enterprise

**Fast** (`POST /api/purchases` con `mode='fast'` o sin mode):
- POS de mostrador donde el operador recibe y factura en el mismo momento.
- Compras chicas (combustible, papelería) que no requieren orden formal.
- Migración: clientes Fase 11-18 que ya usaban el endpoint anterior.

**Enterprise** (`POST /api/purchases` con `mode='enterprise'`):
- Compras grandes (above threshold) que requieren aprobación.
- Recepciones parciales en múltiples GRN.
- Compras con landed cost (flete, aduana) que se prorratea al recibir.
- Cualquier caso donde la factura del proveedor llega días después de la entrega física.

## Endpoints clave (enterprise)

| Paso | Método | Endpoint | Permiso |
|---|---|---|---|
| 1. Solicitud interna | `POST` | `/api/purchases/requests` | `purchases:request` |
| 2. Aprobación PR | `POST` | `/api/purchases/requests/[id]/approve` | `purchases:approve` |
| 3a. Cotizar (opcional) | `POST` | `/api/purchases/rfq` | `purchases:create` |
| 3b. Capturar quotes | `POST` | `/api/purchases/rfq/[id]/quotes` | `purchases:create` |
| 3c. Adjudicar | `POST` | `/api/purchases/rfq/[id]/award/[quoteId]` | `purchases:approve` |
| 4. Crear PO | `POST` | `/api/purchases` (mode=enterprise) | `purchases:create` |
| 5. Aprobar PO | `POST` | `/api/purchases/[id]/approve` | `purchases:approve` |
| 6. Recibir (parcial/total) | `POST` | `/api/purchases/[id]/grn` | `purchases:receive` |
| 7. Registrar factura | `POST` | `/api/purchases/[id]/invoice` | `purchases:invoice` |
| 8. NC proveedor | `POST` | `/api/purchases/[id]/credit-note` | `purchases:credit-note` |
| 9. Anular | `PATCH` | `/api/purchases/[id]` | `purchases:create` |

## Retenciones GT

Calculadas por `src/lib/purchases/retention.ts` en función del proveedor:

- **Retención IVA Pequeño Contribuyente (5%)**: si `Supplier.taxRegime='PEQUENO_CONTRIBUYENTE'` y `Supplier.withholdsIVA=true`. La empresa retiene el 5% del subtotal y lo deja como pasivo en cuenta `2.1.02 IVA Débito Fiscal` hasta declararlo a SAT.

- **Retención IVA general (15%)**: si `Supplier.taxRegime='GENERAL'` y `Supplier.withholdsIVA=true`. Aplica solo si la empresa fue calificada por SAT como Agente del 15%. Retiene 15% del IVA débito de la factura.

- **Retención ISR servicios profesionales (5% / 7%)**: si `Supplier.withholdsISR=true`. Tasa por proveedor (`Supplier.isrRate`, default 0.05). Se queda en cuenta `2.1.03 ISR Retenido por Pagar` hasta declararlo.

## Landed cost

Costos accesorios (flete, seguro, aduana) se cargan en `PurchaseOrder.landedCost`. Al hacer cada GRN, se prorratean proporcionalmente al subtotal de cada línea y se suman al `unitCost` que persiste el `StockMovement` (y con eso el WAC del producto).

## Asiento contable de la factura

Generado en `POST /api/purchases/[id]/invoice` (o atómicamente en mode fast). Líneas en `buildSupplierInvoiceJournalLines`:

```
DR Inventario (1.2.01)         o Gastos Operativos (5.3.01)   subtotal
DR IVA Crédito Fiscal (1.1.05)                                tax
                                                             ─────
CR Cuentas por Pagar (2.1.01)                                 total
CR IVA Débito Fiscal (2.1.02)                                 withheldIVA
CR ISR Retenido por Pagar (2.1.03)                            withheldISR
                                                             ─────
                                          DR == CR
```

donde `total = subtotal + tax - withheldIVA - withheldISR` (lo neto a pagar al proveedor).

## Aprobación por monto

Configurable por empresa: `Company.purchaseApprovalThreshold` (Decimal). Default 0 = todas las PO requieren aprobación. Para clientes legacy se sugiere setear un valor alto en onboarding (ej. Q99,999,999) para que nada quede en `PENDING_APPROVAL`.

En mode `enterprise`, la PO se crea con `status='APPROVED'` automáticamente si `total ≤ threshold`, o `'PENDING_APPROVAL'` si la supera. En el segundo caso, un usuario con `purchases:approve` debe llamar `POST /api/purchases/[id]/approve` para avanzarla.

## Anulación

`PATCH /api/purchases/[id]` con `{ action: 'CANCEL', reason }`. Reglas:
- No se puede anular si hay `SupplierPayment` con `status='COMPLETED'`. Hay que reversar pagos primero.
- Si la PO recibió mercadería (estados `COMPLETED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `INVOICED`): reversa stock con guard de stock negativo (si se vendió todo lo recibido, falla con 409).
- Si tenía asiento contable: lo reversa con `reverseJournalEntry`.
- Borra el `SupplierPayable` (no hay pagos, ya validado).

## Convenciones

- IVA y retenciones se persisten como snapshot en `PurchaseOrder` y `SupplierInvoice` — no se recalculan tras crear.
- `Supplier.taxRegime` mantiene el mismo enum que Fase 16 (`TaxRegime`), nullable hasta clasificar.
- `PurchaseOrderItem.quantity` es `Decimal(12,3)` para soportar granel (kg, lbs, l, gal).
- Numeración de PO/GRN/SupplierInvoice usa UUID — la serie por sucursal y lock para concurrencia queda para Fase 23.
