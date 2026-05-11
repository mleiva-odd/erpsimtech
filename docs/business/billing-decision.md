# Decisión de billing — cobro de suscripciones

**Fecha:** 2026-05-10
**Decisión:** posponer integración con Stripe (u otra pasarela) hasta
contar con al menos 10 clientes activos pagando.

## Contexto

El ERP tiene en el schema (`Company`, `Subscription`, planes `negocio` /
`comercial` / `enterprise`) toda la lógica de suscripciones, pero **no
cobra automáticamente**. La Fase 7 del plan original contemplaba
integrar Stripe para cobros recurrentes con tarjeta.

## Por qué se descarta por ahora

1. **Mercado objetivo (Tecpán / Chimaltenango y similares).** Los
   negocios pequeños guatemaltecos prefieren transferencia bancaria o
   depósito sobre tarjeta de crédito empresarial. Forzar tarjeta puede
   ser fricción de adopción.
2. **Costo de Stripe Atlas.** Stripe no opera plenamente como entidad
   local en Guatemala. La vía estándar para SaaS GT es Stripe Atlas
   (LLC en Delaware), que cuesta ~USD 500 una vez + USD 100/año. No
   se justifica antes de tener MRR.
3. **Cobro manual = contacto con el cliente.** Con los primeros 5-10
   clientes hablar cada mes para cobrar es bueno: nos enteramos de
   cómo usan el sistema, qué les falta, qué les molesta. Es un canal
   de feedback gratis.
4. **Foco actual.** El objetivo del MVP es validar que el producto se
   vende, no automatizar el cobro.

## Plan operativo de cobro mientras tanto

- **Factura manual** cada mes (FEL cuando esté Fase 8, o factura
  papel/PDF mientras tanto).
- **Pago por transferencia bancaria** o depósito a cuenta del dueño.
- **Excel / Google Sheets** con: cliente, plan, monto, fecha de cobro,
  estado, próximo cobro.
- **Recordatorio manual** 3 días antes del vencimiento por WhatsApp.
- Si un cliente atrasa > 15 días: suspender acceso flippeando
  `Company.suspended = true` desde el panel admin (ya implementado).

## Cuándo retomar la integración

Cualquiera de estos triggers reabre la Fase 7:

- **≥ 10 clientes activos pagando** (el cobro manual empieza a doler).
- **Cliente internacional** que pida tarjeta o USD.
- **Plan anual** con descuento que requiera prepago automatizado.
- **Churn alto por olvido de pago** (clientes se van porque no se
  acuerdan de pagar — solo se ve cuando hay volumen).

## Alternativas a considerar cuando llegue el momento

| Opción | Pros | Contras |
|---|---|---|
| **Stripe Atlas** | Estándar mundial, mejor UX, fees ~3% | USD 500 setup + LLC US |
| **Paddle** | Vende como Merchant of Record (maneja IVA por vos) | Fees ~5%, menos flexible |
| **Recurly** | Hecho para suscripciones, buen dunning | Caro hasta cierto volumen |
| **Visanet / Credomatic GT** | 100% local, en GTQ | Integración técnica más cruda, no hay SDK moderno |
| **Banco local + reglas** | Cero fees, simple | Sin self-service, todo manual |

## Estado del schema

No se necesita ningún cambio de DB ahora — la columna `Subscription.plan`
y `Company.suspended` ya soportan el flujo manual. Cuando se retome la
integración, solo se agregará:

- `Subscription.stripeCustomerId` y `Subscription.stripeSubscriptionId`
- Tabla `Invoice` (si no usamos las facturas de Stripe directamente)
- Webhook endpoint en `/api/billing/stripe/webhook`

Ninguno de esos cambios bloquea funcionalidad del MVP.
