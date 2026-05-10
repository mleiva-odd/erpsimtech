# Tácticas comerciales para mercado price-sensitive (Guatemala)

Complemento de [`pricing-strategy.md`](./pricing-strategy.md). Este documento NO baja los precios públicos — eso erosiona valor percibido y dificulta subirlos después. Lo que hace es **agregar palancas laterales** que dan margen de cierre sin canibalizar el producto.

## Principio guía

**El precio público es ancla, no oferta final.**

El cliente guatemalteco PYME negocia. Si tu precio público ya fuera el "precio de cierre", no tenés con qué jugar en la conversación. Por eso publicamos a precio firme (Q899 / Q1.999 / Q4.499) y tenemos una caja de herramientas para usar en el momento de cerrar.

Cuatro mandamientos:

1. **Nunca bajes el sticker price recurrente** sin una palanca explícita justificable (compromiso, referido, migración).
2. **Preferí "regalar setup" antes que "bajar mensualidad"** — el setup es one-time, la mensualidad es para siempre.
3. **Atá descuentos a comportamientos** (cierre rápido, anual, referido). El cliente siente que "se ganó" el descuento.
4. **Limitá el descuento manual** a sales con autorización. Si todos pueden dar 20% off, es el nuevo precio público.

## Plan Lite — punto de entrada psicológico

Para atacar al cliente que dice "está caro" o "solo quiero POS", agregamos un plan **Lite** debajo de Starter:

| | Lite | Starter |
|---|---|---|
| **Precio** | **Q599/mes** | Q899/mes |
| Sucursales | 1 | 1 |
| Usuarios | 3 | 5 |
| Productos | 1.500 | 3.000 |
| Ventas/mes | 2.000 | 5.000 |
| POS + inventario + ventas | ✅ | ✅ |
| Reportes básicos | ✅ | ✅ |
| **Tesorería multi-banco** | ❌ | ✅ |
| **Contabilidad operativa** | ❌ | ✅ |
| **RRHH + planilla** | ❌ | ✅ Básico |
| Setup recomendado | Express Q4.500 | Express Q4.500 |

**Por qué funciona:**
- Compite con SDIG (Q500 POS-only) sin canibalizar Starter (Q899 ERP completo).
- Ruta natural de upgrade: cuando el cliente Lite necesita controlar bancos o pagar planilla, paga Q300 más al mes y queda en Starter.
- Si el comprador es muy chico, Lite es honestamente lo que necesita. No le vendés más de lo que usa.

**Riesgo a vigilar:** si > 60% de clientes nuevos eligen Lite, tu producto Starter está mal diferenciado. Ajustar features que pasan a Starter+.

## Catálogo de descuentos (cuándo usar cada uno)

### Automáticos (sin negociación)

| Descuento | Trigger | Valor | Cuándo aplicarlo |
|---|---|---|---|
| **Anual prepay** | Elige plan anual | 16% off (≈ 2 meses gratis) | Siempre disponible. Default en checkout. |
| **2 años commit** | Firma 24 meses prepago | 22% off | Cliente ya está convencido, querés cashflow |
| **3 años commit** | Firma 36 meses prepago | 28% off + setup tier inferior gratis | Cuenta estratégica, cierre largo |

### Cierre rápido (urgencia)

| Descuento | Trigger | Valor | Cuándo aplicarlo |
|---|---|---|---|
| **Setup -25%** | Firma en 7 días desde demo | 25% off del setup | Lead caliente que duda |
| **Primer mes 50%** | Firma en 7 días | 50% off solo primer mes | Reduce sticker shock inicial |

### Referidos (CAC bajo)

| Descuento | Trigger | Valor | Notas |
|---|---|---|---|
| **Mes gratis al referente** | Cliente activo refiere y referido firma | 1 mes gratis aplicado a próxima factura | Aplicar después de que el referido pague mes 1 |
| **Setup -50% al nuevo** | Llega vía referido | 50% off setup | Combinable con anual prepay |

**ROI de un referido**: si Pro recurrente Q1.999 y LTV = 18 meses, el referido vale ~Q36.000. Pagás 1 mes (Q1.999) al referente + 50% setup (Q6.250). Costo total Q8.249 vs valor Q36.000 = ROI 4.4×.

### Migración desde competidor (captura churn)

| Descuento | Trigger | Valor |
|---|---|---|
| **3 meses al 50%** | Migra desde Bind/Alegra/SIAC/SDIG/Microsip/etc. | 50% off primeros 3 meses + migración básica gratis (productos + clientes) |

**Cuándo usar:** lead que tiene contrato vigente con otro vendor pero está insatisfecho. La migración técnica le da una excusa para cambiar y el descuento le suaviza el cambio. Pedile screenshot del contrato actual para validar.

### Beta cerrada (primeros 5 clientes)

| | Detalle |
|---|---|
| Plan | Professional a **Q999/mes** durante 12 meses (50% off) |
| Setup | **Gratis** (vale Q12.500) |
| A cambio | Testimonio escrito + foto + uso de logo + uso real continuado + feedback estructurado mensual |
| Cupos | 5 clientes |
| Costo total | Q60.000 descuento + Q62.500 setup = **Q122.500 invertido en validación** |

**Por qué vale la pena:** sin testimonios reales, los precios públicos son difíciles de defender en frío. 5 testimonios filmados/escritos con foto = catalizador de ventas durante años.

### Manuales (sales con autorización)

| Código | Off | Cuándo |
|---|---|---|
| `CIERRE10` | 10% | Cuando no hay otra palanca y el lead está casi |
| `CIERRE15` | 15% | Cuentas estratégicas con plan anual. Doble autorización |

**Regla de oro:** si todos los leads requieren `CIERRE15` para cerrar, el precio público está alto. Reportar al gerente.

## Garantía de satisfacción (mecanismo de cierre)

> **30 días de devolución 100%.** Si en el primer mes el sistema no cumple lo prometido durante la demo, devolvemos la licencia Y el setup pagado. Sin preguntas.

**Por qué:**
- Reduce fricción de cierre. Convierte "no estoy seguro" en "probemos".
- Costo real bajo: la mayoría que pide refund se va igual sin pedirlo. La garantía solo influye en la decisión de compra.
- Genera confianza vs vendors locales que no la ofrecen.

**Excepciones:**
- Setup Enterprise (Q30.000+) NO entra en garantía total (riesgo migración legacy ya consumió costo). Sí se reembolsa la licencia.

## Pago facilitado

### Métodos aceptados

1. **Tarjeta de crédito/débito** (Stripe).
2. **Transferencia bancaria** GTQ (esencial para PYME GT — muchos no usan tarjeta corporativa).
3. **Efectivo** en agencias bancarias mediante boleta de pago (alternativa para clientes muy tradicionales).

### Cuotas para setup

Setup grande puede ser sticker shock. Permitir cuotas:

- Express Q4.500 → 2 cuotas de Q2.250 (firma + 30 días).
- Pro Q12.500 → 3 cuotas de Q4.500 + saldo (firma + 30 + 60 días).
- Enterprise Q30.000+ → cronograma personalizado, hasta 6 cuotas.

**Importante:** la implementación arranca con primera cuota pagada, no antes. Protege contra default.

## Precios públicos vs. precios negociados (qué decir y qué no)

### En la landing (precios públicos)

Mostrar **precios firmes** sin "desde Q...". Cliente ve compromiso de calidad.

### En la demo

- Mostrar valor primero (lo que el cliente puede hacer con el sistema).
- **Solo al final** mencionar precio.
- Si el lead dice "está caro", NO bajes precio en la primera objeción. Preguntá: *"¿Comparado con qué?"* Esto desnuda si está comparando con un POS o con un ERP.
- Si compara con POS: educá sobre la diferencia. Mostrá Lite como alternativa.
- Si compara con otro ERP: preguntá qué le falta a ese y mostrá cómo SIMTECH lo cubre.

### Al cierre

Negociación con palancas en orden:

1. **Anual prepay** (16% off automático).
2. **Setup -25%** si firma en 7 días.
3. **Migración 3 meses 50%** si viene de competidor.
4. **Manual CIERRE10/15** si nada del catálogo aplica.

Nunca dar más de UNA palanca acumulable a la vez sin justificar (excepto las naturalmente independientes: anual + setup -25% son ejes distintos).

## Programa de referidos formal

Para sistematizar la palanca de referidos:

1. Cada cliente activo recibe un **código único** al firmar (e.g. `MARIA-A8F2`).
2. Cuando un nuevo lead lo usa al checkout, ambos lados reciben el descuento.
3. El bono se aplica automáticamente en la próxima facturación del referente.
4. Dashboard del cliente muestra: cuántos referidos llevó, cuánto ahorró, links para compartir por WhatsApp.

**Implementación técnica:**
- Tabla `ReferralCode` con `userId` (referente), `code`, `redemptions[]`.
- Al onboarding nuevo cliente, opción "¿Te recomendó alguien?" con campo de código.
- Webhook al activar primera factura: suma 1 mes gratis al referente.

(Esto es Sprint 7 cuando hagamos billing — el catálogo `discounts.ts` ya tiene los descuentos definidos para enchufar.)

## Métricas a vigilar

Cada 30 días después del lanzamiento:

| Métrica | Meta | Acción si falla |
|---|---|---|
| Conversión Trial → Pago | 15-25% | < 15%: producto no convence en 30d. Revisar onboarding |
| % Lite vs Starter+ | < 50% Lite | > 60% Lite: Starter mal diferenciado, mover features a Lite |
| % usando descuentos manuales (CIERRE10/15) | < 30% | > 40%: precio público alto |
| Churn mensual | < 5% | > 8%: feature missing crítica o problema UX |
| MRR mes 3 | ≥ Q15.000 | Por debajo: ajustar marketing y captación |
| LTV / CAC | > 3 | < 2: estás regalando descuentos sin recuperar |

## Resumen de palancas (cheat sheet para sales)

```
DEFAULT  → Anual prepay (16% off automático)
LEAD CALIENTE QUE DUDA  → Setup -25% si firma 7d
STICKER SHOCK  → Primer mes 50% off
VIENE DE OTRO VENDOR  → 3 meses 50% + migración gratis
CIERRA EN 24M  → 22% off licencia
CIERRA EN 36M  → 28% off + setup tier inferior gratis
LO REFERIDO  → Setup -50% (referente recibe 1 mes gratis)
NADA FUNCIONA  → CIERRE10 (10%) o CIERRE15 (15% con autorización)
PRIMEROS 5 CLIENTES  → Beta program: Pro Q999/mes 12 meses + setup gratis a cambio de testimonio
```

**Recordá:** mejor regalar setup (one-time) que mensualidad (recurrente).
