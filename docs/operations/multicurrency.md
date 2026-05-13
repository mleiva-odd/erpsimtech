# Operaciones · Multi-moneda

Fecha: 2026-05-12
Fase: 21
Audiencia: contadores/admins de empresas SIMTECH que operan en moneda extranjera.

---

## 1. Conceptos

- **Moneda funcional**: GTQ (Quetzal). Es la moneda en que SAT exige los reportes tributarios (DTE, libros de IVA, ISR, etc.). Hardcoded por ley legal GT, no configurable.
- **Moneda del documento**: la divisa en que se emitió la venta/compra/cobro. ISO-3 (USD, EUR, MXN, GTQ).
- **Tipo de cambio (ExchangeRate)**: ratio `1 USD = X GTQ` para una fecha. Se guarda con precisión `Decimal(18,8)`.
- **Snapshot**: cada documento monetario (Sale, PurchaseOrder, Payment, etc.) guarda al emitirse:
  - `currency` (ISO-3)
  - `exchangeRate` (rate del día del documento, inmutable)
  - `functionalAmount` (= total × rate, en GTQ → es lo que va a SAT)
- **Diferencia cambiaria**: si una factura USD se cobra/paga días después y el rate movió, la ganancia/pérdida se registra como `FX_GAIN` (4.2.01) o `FX_LOSS` (5.4.01) en partida doble (Fase 14).

---

## 2. Cuándo usar moneda extranjera

Casos típicos:
- Cliente paga en USD (importación, exportación, turismo, online).
- Proveedor extranjero factura en USD/EUR.
- Cuenta bancaria de la empresa en dólares (`BankAccount.currency='USD'`).

**Si toda la operación es GTQ, no necesitás cargar rates ni preocuparte por esto.** El sistema queda intacto: `currency='GTQ'`, `exchangeRate=1.0`, `functionalAmount=total`.

---

## 3. Cargar tipos de cambio (rates)

### 3.1 Manual (Settings → Tipos de Cambio)

Cada empresa decide su disciplina. Recomendación: **cargar el rate Banguat del día cada mañana** antes de la primera venta/compra en moneda extranjera.

```
POST /api/accounting/exchange-rates
{
  "currency": "USD",
  "date": "2026-05-12",
  "rate": 7.85,
  "source": "MANUAL",
  "notes": "Banguat referencia compra 7.84 / venta 7.86"
}
```

- `currency`: 3 letras mayúsculas. USD, EUR, MXN, etc.
- `date`: la fecha vigente del rate. Una sola entrada por (moneda, día).
- `rate`: cuántos GTQ son 1 unidad de esa moneda. Ej.: 7.85 = 1 USD vale Q7.85.
- `source`: `MANUAL` (admin lo subió a mano), `BANGUAT` (importado de Banguat — pendiente Fase 22), `API` (provider externo).
- `notes`: opcional, hasta 500 chars. Útil para registrar la referencia exacta.

Si ya existe un rate para `(USD, 2026-05-12)` → 409. Borralo o editá su `notes` (el rate mismo es inmutable post-creación para no corromper documentos que ya lo consumieron).

### 3.2 Banguat (futuro Fase 22)

Pendiente: scraper de https://www.banguat.gob.gt que corre cada mañana y sube los rates oficiales con `source: 'BANGUAT'`. Por ahora cargá manual.

### 3.3 Listar / editar / borrar

```
GET    /api/accounting/exchange-rates?currency=USD&from=2026-05-01&to=2026-05-31
PATCH  /api/accounting/exchange-rates/:id        (solo notes)
DELETE /api/accounting/exchange-rates/:id        (solo si no fue usado en docs)
```

---

## 4. Vender / comprar en moneda extranjera

### 4.1 Venta en USD

```
POST /api/sales
{
  "currency": "USD",
  "items": [...],
  "payments": [{"method": "TRANSFER", "amount": 100, ...}]
}
```

- Si no cargaste el rate del día → 422 `EXCHANGE_RATE_NOT_FOUND`. Subí el rate y reintentá.
- `Sale.total` queda en USD. `Sale.functionalAmount` en GTQ para SAT.
- Los `Payment` y `BankTransaction` derivados heredan currency + rate.
- El asiento contable se registra en GTQ con el `functionalAmount`. DR/CR cuadran.

### 4.2 Compra en USD

Idéntico para `POST /api/purchases`. La PO y el `SupplierInvoice` quedan snapshoteados.

---

## 5. Cobrar / pagar con diferencia cambiaria

### 5.1 Cobro a cliente

```
POST /api/customers/:id/payments
{
  "method": "TRANSFER",
  "amount": 100,
  "currency": "USD"   // opcional: si se omite, hereda de la última venta a crédito
}
```

- Sistema busca el rate vigente "hoy" (`currentRate`) y el rate original de la venta a crédito (`originalRate`).
- Si `currentRate > originalRate` → **FX_GAIN** (recibimos más GTQ que la CxC libros).
- Si `currentRate < originalRate` → **FX_LOSS** (recibimos menos).
- Si GTQ funcional o rates iguales → no hay asiento extra.

Ejemplo: factura USD 100 a 7.80, cobramos hoy a 7.85.
- Asiento: DR Bancos Q785.00 / CR Clientes Q780.00 / CR FX_GAIN Q5.00.

### 5.2 Pago a proveedor

```
POST /api/accounting/payables/:id/payments
{
  "method": "TRANSFER",
  "amount": 200,
  "bankAccountId": "...",
  "currency": "USD"
}
```

- `originalRate` viene de `PurchaseOrder.exchangeRate` snapshot.
- `currentRate` = rate del día del pago.
- Si rate **sube** → **FX_LOSS** (pagamos más GTQ de lo provisionado).
- Si rate **baja** → **FX_GAIN**.

Ejemplo: PO USD 200 a 7.80, pagamos hoy a 7.85.
- Asiento: DR Proveedores Q1560.00 / CR Bancos Q1570.00 / DR FX_LOSS Q10.00.

---

## 6. Transferencias entre cuentas bancarias

**Solo entre cuentas de la misma moneda.** Si origen es USD y destino GTQ:

```
POST /api/accounting/banks/transfer
{ ... }
→ 400 { "error": "Las cuentas tienen monedas diferentes; usá conversión manual con asiento doble", "code": "CURRENCY_MISMATCH" }
```

Para hacer la conversión:
1. Crear asiento manual (cuando esté listo el endpoint de asientos manuales) DR Bancos GTQ / CR Bancos USD, con la diferencia cambiaria contra FX_GAIN/FX_LOSS.
2. O bien crear dos BankTransaction (una EXPENSE en USD, una INCOME en GTQ) y registrar el asiento por fuera.

Fase 22 introducirá un wizard de "Conversión manual de moneda" en la UI.

---

## 7. Reportes consolidados

Todos los reportes (P&L, Balance, Flujo de Caja) leen `functionalAmount` (GTQ) de los documentos. Ninguno multiplica `total × rate` en tiempo real — los rates son snapshots inmutables.

Para tableros gerenciales en USD: pendiente Fase 22-23 (UI puede convertir GTQ → USD usando el rate del día).

---

## 8. Disciplina mínima recomendada

Para que la diferencia cambiaria refleje la realidad:

1. **Cargar el rate Banguat todas las mañanas** para cada currency operada (USD, EUR, etc.). Disciplina diaria.
2. **No editar rates post-uso**. El `PATCH` solo edita `notes`. Si subiste mal el rate y ya se usó, dejá el rate viejo y subí el correcto con fecha de mañana (la diferencia se absorbe en el FX al cobrar).
3. **Borrar rates solo si nunca se usaron** (el endpoint lo valida; tira 409 si hubo uso).
4. **Revisar el reporte de FX_GAIN / FX_LOSS** mensualmente en el libro mayor de cuentas `4.2.01` y `5.4.01`. Picos anormales = rates mal cargados.

---

## 9. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `EXCHANGE_RATE_NOT_FOUND` al vender en USD | No hay rate cargado para esa fecha o anteriores | Cargar `POST /api/accounting/exchange-rates` con el rate del día |
| `CURRENCY_MISMATCH` en transfer | Las dos cuentas tienen distinta currency | Hacer asiento manual de conversión |
| El asiento de cobro no genera FX_GAIN/LOSS aunque rate movió | La venta original estaba en GTQ, o el cobro tiene currency=GTQ | Confirmar que `Sale.currency=USD` y que pasaste `currency: 'USD'` al cobrar (o omitirlo para que herede) |
| Borrar un rate da 409 "ya fue usado" | Algún documento con esa currency y esa fecha lo consumió | Dejá el rate; cargá uno nuevo si hay error en el valor |
| `Sale.functionalAmount` parece bajo | rate cargado al revés (1 GTQ = X USD en vez de 1 USD = X GTQ) | Pediste el rate equivocado. Borralo (si no se usó) y recargá |

---

## 10. Referencias

- `docs/audits/phase-21-completion.md` — qué se implementó.
- `docs/audits/phase-21-discovery.md` — análisis previo (gaps históricos T-1..T-12).
- `src/lib/currency/` — helpers.
- Plan de cuentas: `FX_GAIN = 4.2.01`, `FX_LOSS = 5.4.01` (`src/lib/accounting/accounts.ts`).
