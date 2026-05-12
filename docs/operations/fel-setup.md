# Operativa · Configuración FEL Guatemala

Esta guía cubre los pasos que un admin de empresa debe ejecutar tras Fase 16
para dejar la empresa lista para facturar electrónicamente con SAT.

Spec oficial SAT:
- https://portal.sat.gob.gt/portal/factura-electronica/

---

## 1. Régimen tributario (irreversible)

Cada empresa elige UNA sola vez su régimen al onboardear:

- **General** (`GENERAL`): IVA 12% con derecho a crédito fiscal.
- **Pequeño Contribuyente** (`PEQUENO_CONTRIBUYENTE`): IVA 5% sin crédito.

Donde se configura:
- Onboarding (`POST /api/onboarding` body `taxRegime`).
- Admin Super (`POST /api/admin/companies` body `taxRegime`).
- Settings UI (`PUT /api/settings` body `taxRegime`) — solo si todavía es
  `null`. Una vez seteado, el handler devuelve **409 TAX_REGIME_LOCKED**.

Si el régimen no está seteado, `POST /api/sales` retorna **400** con código
`TAX_REGIME_NOT_CONFIGURED`.

---

## 2. NIT del emisor

- `Company.nit` (recomendado) o `CompanySettings.felNitEmisor`.
- Sin esto, `POST /api/fel/certify/:saleId` retorna **400** con código
  `EMISOR_NIT_MISSING`.
- Validador GT: `validateGuatemalanNit` acepta NITs con dígito verificador
  correcto. "CF" reservado para Consumidor Final.

---

## 3. Series autorizadas SAT (`TaxSeries`)

SAT asigna por sucursal una serie + rango de correlativos por tipo de DTE
(FACT / NCRE / NDEB). En SIMTECH se modelan con `TaxSeries`:

```
TaxSeries {
  companyId, branchId, documentType, prefix,
  nextNumber, rangeFrom, rangeTo, authorization, active
}
```

- Al crear una empresa (onboarding o admin), automáticamente se siembra una
  serie default por sucursal: `prefix='A'`, `nextNumber=1`, sin rango. Esto
  es **placeholder** para que el sistema arranque con MockProvider.
- Cuando se contrate el certificador real (Infile/Digifact), el admin debe
  reemplazar el prefix por el autorizado por SAT y registrar el rango
  (`rangeFrom`, `rangeTo`) y el número de autorización.

Endpoint manual (futuro UI): crear/editar via `POST /api/tax-series` —
todavía no expuesto. Por ahora se hace vía SQL directo o seed.

---

## 4. Provider FEL

Tres opciones en `CompanySettings.felProvider`:

| Valor      | Estado                | Notas |
|------------|-----------------------|-------|
| `NONE`     | FEL deshabilitado     | `resolveProvider` lanza 409. |
| `MOCK`     | Activo desde Fase 16  | Certifica local, UUID determinístico desde `internalId`. |
| `INFILE`   | Stub                  | Lanza 501 hasta que se contraten credenciales reales. |
| `DIGIFACT` | Stub                  | Idem Infile. |

Para activar Mock, en `/api/settings` PUT:
```json
{ "felEnabled": true, "felProvider": "MOCK" }
```

Para activar Infile/Digifact (futuro):
```json
{
  "felEnabled": true,
  "felProvider": "INFILE",
  "felApiUser": "...",
  "felApiKey": "...",
  "felNitEmisor": "12345678"
}
```

⚠️ Credenciales hoy se guardan **en plano** en la DB. Sembrar `pgcrypto` y
helpers `encryptFelCredential / decryptFelCredential` antes de Infile/Digifact.

---

## 5. Plan de cuentas relevante

Estas cuentas hoja del plan estándar GT (Fase 14, ver `src/lib/accounting/accounts.ts`)
se usan al asentar ventas/notas:

- `1.1.01 Caja` (`CASH`)
- `1.1.02 Bancos` (`BANKS`)
- `1.1.04 Clientes` (`AR`)
- `1.1.05 IVA Crédito Fiscal` (`VAT_INPUT`)
- `2.1.02 IVA Débito Fiscal` (`VAT_OUTPUT`)
- `4.1.01 Ventas` (`SALES`)
- `4.1.02 Devoluciones sobre Ventas` (`SALES_RETURNS`)

Diferencia de asiento por régimen:
- **GENERAL**: DR Caja/Bancos/Clientes — CR Ventas + CR IVA Débito.
- **PEQUEÑO_CONTRIBUYENTE**: DR Caja/Bancos/Clientes — CR Ventas (incluyendo
  el 5% — NO se separa porque no es IVA débito recuperable).

---

## 6. Endpoints FEL

| Endpoint                                     | Acción |
|----------------------------------------------|--------|
| `POST /api/fel/certify/:saleId`              | Emite y certifica DTE FACT de una venta. |
| `POST /api/fel/cancel/:taxDocumentId`        | Anula DTE: emite NCRE asociada y marca el original CANCELLED. |
| `POST /api/credit-notes`                     | Alta de NCRE manual (devolución parcial). |
| `POST /api/fel/credit-notes/:id/certify`     | Certifica NCRE manual. |
| `POST /api/debit-notes`                      | Alta de NDEB (recargos/intereses). |
| `POST /api/fel/debit-notes/:id/certify`      | Certifica NDEB. |
| `GET /api/reports/tax/sales-book?from=&to=`  | Libro de Ventas SAT (JSON o CSV). |
| `GET /api/reports/tax/purchases-book?from=&to=` | Libro de Compras SAT. |
| `GET /api/reports/tax/iva-summary?period=YYYY-MM` | Resumen IVA débito vs crédito (solo régimen GENERAL). |

---

## 7. Migración

La migración `prisma/migrations/20260515000000_fel_infrastructure/migration.sql`
es **idempotente**. Pasos clave que ejecuta:

1. Crea enums `TaxRegime`, `TaxDocumentType`, `TaxDocumentStatus`.
2. Agrega `MOCK` al enum `FelProvider` (idempotente; valor no se usa en la
   misma migración por la restricción `unsafe use of new value` de Postgres).
3. Agrega columnas a `Company`, `Sale`, `SaleItem`.
4. Crea tablas `TaxSeries`, `TaxDocument`, `CreditNote*`, `DebitNote*`.
5. Siembra series FACT default por sucursal existente.
6. Habilita RLS + policies tenant_isolation en las 6 tablas nuevas.

Verificación post-deploy:

```sql
-- Series sembradas
SELECT b."name", ts.prefix, ts."nextNumber"
FROM "TaxSeries" ts JOIN "Branch" b ON b."id" = ts."branchId";

-- Régimen seteado
SELECT name, "taxRegime" FROM "Company";

-- Enum FelProvider tiene MOCK
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'FelProvider';
```

---

## 8. Issues conocidos / pendientes

- **Cifrado credenciales FEL**: hoy plano en DB. Necesario antes de activar
  Infile/Digifact.
- **UI**: no se entregaron componentes en esta fase. POS sigue sin mostrar
  desglose IVA en el carrito — usuarios verán el total con IVA pero sin línea
  separada. Fase 22/23 lo aborda.
- **Libro de Compras**: hoy reporta `tax=0` porque `PurchaseOrderItem` no tiene
  desglose IVA. Fase 19 (compras enterprise) introduce FEL receipt.
- **Backfill `Sale.invoiceNumber` legacy**: ventas anteriores a Fase 16 NO
  fueron certificadas. Quedan con `invoiceNumber=null` y `taxRegime=null`.
  No se reprocesan automáticamente.
