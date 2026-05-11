# Phase 4 — Auditoría de transacciones DB y consistencia

**Fecha:** 2026-05-09
**Estado:** Read-only review. No se aplicaron cambios.

## Cobertura de `prisma.$transaction`

22 endpoints API usan `prisma.$transaction`. Cubre todas las operaciones críticas del negocio:

### Bien cubiertos (operaciones ya transaccionales)

| Endpoint | Operación | Razón |
|---|---|---|
| `sales/route.ts` POST | Creación de venta | Stock + payment + bank tx + customer balance + accounting entry. Concurrencia optimista verificada (`updateMany.count === 1`). |
| `sales/[id]/route.ts` PATCH (CANCEL) | Anulación de venta | Reversa stock + balance cliente + tx bancaria + asiento contable. Atómico. |
| `sales/[id]/return/route.ts` | Devolución | Stock back + nota crédito. |
| `pos/returns/route.ts` | Devolución desde POS | Idem. |
| `purchases/route.ts` POST | Recepción de mercadería | Crea PO + items + ajusta stock + actualiza costo + crea Payable. |
| `stock-transfers/route.ts` POST | Crear traslado | Decrementa stock origen + crea transfer + items. |
| `stock-transfers/[id]/route.ts` (RECEIVE/CANCEL) | Recibir/anular traslado | Incrementa stock destino o restaura origen. |
| `inventory/adjustments/route.ts` | Ajuste de inventario | Setea cantidad + crea registro de ajuste. |
| `customers/[id]/pay/route.ts` | Abono cliente | Decrementa saldo (con guardia optimista por monto disponible) + crea AccountPayment + cash transaction o bank transaction. |
| `accounting/receivables/[customerId]/pay/route.ts` | Pago cuenta por cobrar | Idem. |
| `accounting/receivables/payments/[paymentId]/reverse/route.ts` | Anular abono cliente | Marca VOID + restituye saldo + reversa banco. |
| `accounting/payables/[id]/payments/route.ts` | Pago a proveedor | Update payable + create payment + bank tx. |
| `accounting/payables/payments/[paymentId]/reverse/route.ts` | Anular pago proveedor | Idem reversa. |
| `accounting/banks/transfer/route.ts` | Transferencia entre cuentas | Decrementa origen + incrementa destino + 2 tx. |
| `products/route.ts` POST | Crear producto | Producto + variantes + stocks por sucursal. |
| `products/[id]/route.ts` PUT | Editar producto | Update + variantes upsert + stocks upsert. |
| `products/bulk/route.ts` | Carga masiva | All-or-nothing por archivo. |
| `admin/companies/route.ts` POST | Crear empresa (super admin) | Empresa + sucursal + settings + suscripción + rol admin + admin user. |
| `admin/companies/[id]/route.ts` PUT | Editar empresa | Empresa + suscripción + admin user. |
| `onboarding/route.ts` POST | Onboarding empresa | Idem creación pero vía flujo de auto-registro. |
| `hr/payroll/route.ts` | Crear planilla | Payroll + items por empleado. |
| `customers/[id]/payments/route.ts` POST | Pago cliente con asiento | Idem otro flujo de pago. |

### Concurrencia optimista — patrón ya implementado

`sales/route.ts:347-395` y otros usan `updateMany` con condición `quantity: { gte: required }` y verifican `count === 1`, lo que previene **doble venta** del mismo stock cuando dos requests concurrentes intentan vender el último item:

```ts
const stockUpdate = await tx.productStock.updateMany({
  where: { productId, branchId, quantity: { gte: item.quantity } },
  data: { quantity: { decrement: item.quantity } }
});
if (stockUpdate.count !== 1) {
  throw new Error('El stock cambió mientras se procesaba la venta');
}
```

Mismo patrón en:
- `customers/[id]/pay/route.ts:54-65` para validar saldo deudor antes de abonar.

**Esto está MUY bien.** Es defensa real contra race conditions.

## Hallazgos menores

### M-1 · Falta `await` para `createAccountingEntryAsync`

`sales/route.ts:430` llama `createAccountingEntryAsync` después de la transacción principal. Si la lambda termina antes de que esa promesa resuelva, el asiento contable se pierde (similar al problema del audit log que ya arreglamos).

**Recomendación:** mover la creación del asiento contable DENTRO del `$transaction` principal. Al estar en el mismo tx, si falla el asiento se rollbackea la venta entera (más correcto desde el punto de vista contable: una venta sin asiento es inconsistencia).

Estado actual: aceptable porque `createAccountingEntryAsync` ya tiene `await` interno y el call site lo `await`ea. Pero está fuera del `$transaction`, lo que significa que si la venta sucede pero el asiento falla, la venta queda registrada sin asiento. Para v2 conviene moverlo adentro.

### M-2 · `prisma.$transaction` sin timeout explícito en algunos endpoints

Varios endpoints largos no setean timeout. El default de Prisma es 5 segundos para transacciones interactivas, lo que para operaciones grandes (carga masiva de productos, cierre de caja con muchas ventas) puede ser ajustado.

**Recomendación:** auditar caso por caso y pasar `{ timeout: 15_000 }` donde el flujo lo amerite. Especialmente:
- `products/bulk/route.ts` (carga masiva).
- `hr/payroll/route.ts` (planilla con muchos empleados).
- `admin/companies/route.ts` (crea muchas filas relacionadas).

Tal como están hoy funcionan para volúmenes pequeños/medianos.

### M-3 · `cash-register` close — verificación adicional

`cash-register/route.ts` (PUT — cierre) tiene una validación estricta de descuadre con tolerancia 0.05. Está bien.

Sugerencia: agregar logging estructurado (con el nuevo `src/lib/logger.ts`) que persista descuadres mayores a Q5 para revisión gerencial. No bloqueante.

## Concurrencia entre handlers concurrentes

Lo que NO está cubierto explícitamente pero que la combinación RLS + concurrencia optimista mitiga:

- Dos cajeros del MISMO turno vendiendo simultáneamente: el stock se descuenta atómicamente. ✓
- Dos managers ajustando el mismo producto: el último gana, sin perdida de datos.
- Devolución mientras venta concurrente del mismo producto: el `updateMany` con `gte` previene oversell.

## Recomendación Phase 4

**No urge cambios.** El código está bien construido en este aspecto. Las recomendaciones M-1 y M-2 son optimizaciones que se pueden hacer en una iteración futura cuando haya tiempo y datos de uso real para priorizar.

## Para próxima iteración

1. Mover `createAccountingEntryAsync` dentro del `$transaction` de la venta.
2. Audit de timeouts en transacciones que crecen con el volumen.
3. Tests e2e que pruebe race conditions reales (dos clientes Playwright comprando el último item simultáneamente).
