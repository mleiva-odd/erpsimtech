# Estrategia de precios — SIMTECH ERP (v3 · ERP completo, no POS)

**Mercado:** Guatemala (PYMEs · 1 a 50 empleados).
**Moneda principal:** GTQ (Quetzal). Referencia: 1 USD ≈ Q7.70 (mayo 2026).

## Posicionamiento del producto

SIMTECH **NO es un POS**. Es un ERP completo que incluye:

- POS (punto de venta) multi-sucursal con FEL integrable.
- Inventario con variantes, combos, traslados entre sucursales.
- Compras + cuentas por pagar a proveedores.
- Ventas + cuentas por cobrar a clientes (crédito, abonos).
- Tesorería: bancos, caja chica, conciliación, transferencias entre cuentas.
- Contabilidad operativa: asientos automáticos, categorías, reportes.
- RRHH: empleados, planilla con ISR/IGSS/Bono14/Aguinaldo, asistencia, vacaciones.
- Multi-tenant SaaS con aislamiento real (RLS en Postgres).
- Multi-empresa (multi-razón social) en planes superiores.
- Auditoría completa de cambios.
- API access en Enterprise.

Esto NO es Sictel/Vendty/InVentas (POS-only ~Q300-800). Es comparable a:
- **Alegra Premium** (~Q1.700-2.000/mes)
- **Bind ERP Pro** (~Q2.460/mes)
- **SAP Business One PYME** (~Q3.500-5.500/mes para 5 usuarios)
- **Acontrol/Invex** (Q1.540-7.000/mes)
- **Microsip** (~Q1.500-3.000/mes)

## Investigación de precios reales (validada 2026)

| Producto | Tipo | Precio mensual | Notas |
|---|---|---|---|
| SDIG Web | POS+inventario básico | Q500 | NO ERP completo, sin RRHH, sin contabilidad real |
| Alegra Plus | Contabilidad+POS | ~Q920 | 5 usuarios, 1.000 facturas, sin multi-sucursal real |
| **Bind ERP Pro** | **ERP completo** | **Q2.460** | 5 usuarios, sin FEL, multi-sucursal limitada |
| Acontrol mid | ERP medio | Q1.540 | $200 USD |
| Acontrol high | ERP alto | Q6.000-7.000 | $850-900 USD |
| **SAP B1 Cloud Limitada** | **ERP completo** | **Q693/usuario** | 5 usuarios = Q3.465/mes |
| **SAP B1 Cloud Profesional** | **ERP completo** | **Q1.117/usuario** | 5 usuarios = Q5.585/mes |
| Microsip | ERP tradicional | Q1.500-3.000 | On-premise, complejo |

**Lectura definitiva:**

1. **Banda baja real para ERP completo en GT: Q900-Q1.500/mes.** Por debajo de eso solo hay POS+inventario o soluciones agnósticas (Alegra) que se quedan cortas en RRHH/multi-sucursal.
2. **Banda media (PYME establecida): Q1.500-Q3.500/mes**. Acá juega Bind, Acontrol, SAP B1 chico.
3. **Banda alta (cadena, alto volumen): Q3.500-Q8.000+/mes**. SAP B1 Profesional, Acontrol Enterprise, soluciones a medida.
4. **Implementación: 30-60% del costo anual de licencia** (estándar regional).

## Cambios respecto a v2

| Decisión | v2 (POS-style) | v3 (ERP completo) |
|---|---|---|
| Starter mensual | Q399 | **Q899** |
| Professional mensual | Q899 | **Q1.999** |
| Enterprise mensual | Q1.999 | **Q4.499** |
| Setup Express | Q2.500 | **Q4.500** |
| Setup Pro | Q6.500 | **Q12.500** |
| Setup Enterprise | Q15.000+ | **Q30.000+** |

## Tabla de planes — v3

### 🟢 Starter — Q899/mes

**Para:** PYME chica que necesita el ERP completo desde el inicio (no solo POS). Comercio único, 1-3 empleados, contabilidad simple.

| Recurso | Límite |
|---|---|
| Sucursales | 1 |
| Usuarios | 5 |
| Productos | 3.000 |
| Ventas/mes | 5.000 |
| Almacenamiento imágenes | 1 GB |
| Razones sociales | 1 |
| FEL | Add-on (BYO o gestionada) |
| Soporte | Email 24-48h |
| Reportes contables | Sí |
| RRHH + planilla | Básico (hasta 10 empleados) |

**Anual:** Q8.990/año (paga 10 meses, recibe 12 — 16% off).

### 🔵 Professional — Q1.999/mes ⭐ MÁS POPULAR

**Para:** PYME establecida con varias sucursales o alto volumen. 5-25 empleados. 100K-1M GTQ/mes en facturación.

| Recurso | Límite |
|---|---|
| Sucursales | 5 |
| Usuarios | 20 |
| Productos | 15.000 |
| Ventas/mes | 30.000 |
| Almacenamiento imágenes | 5 GB |
| Razones sociales | 1 |
| FEL gestionada | Disponible add-on |
| Soporte | WhatsApp horario GT (8-18h) |
| Reportes contables completos | Sí |
| Tesorería multi-banco | Sí |
| RRHH + planilla completa | Sí (hasta 50 empleados) |
| Backup diario | Incluido |

**Anual:** Q19.990/año (16% off).

### 🟣 Enterprise — Q4.499/mes

**Para:** cadena con varias sucursales y razones sociales, alto volumen, equipo robusto. 25+ empleados. 1M+ GTQ/mes.

| Recurso | Límite |
|---|---|
| Sucursales | 20 |
| Usuarios | 60 |
| Productos | Ilimitado |
| Ventas/mes | 200.000 |
| Almacenamiento imágenes | 25 GB |
| Razones sociales | 5 (multi-empresa) |
| FEL incluida | 1.000 facturas/mes + Q0.79 c/u después |
| Soporte | WhatsApp prioritario + onboarding incluido |
| API access | Sí (read-only) |
| RRHH + planilla | Ilimitado |
| Backup diario + restore on-demand | Incluido |
| SLA | 99.5% uptime |
| Cuenta gerente (account manager) | Sí, primer año |

**Anual:** Q44.990/año (16% off).

### ⚪ Trial — Gratis 30 días

Funciones equivalentes a Professional pero limitadas a 30 días, sin tarjeta. Al vencer, modo lectura por 30 días más para que el cliente recupere data si decidió no contratar.

## Implementación / Setup (one-time, OBLIGATORIA)

Sin setup profesional, las PYMEs guatemaltecas no extraen valor real de un ERP completo y churnean en mes 2-3.

| Tier | Precio | Horas | Recomendado para |
|---|---|---|---|
| **Express** | **Q4.500** | 5h | Starter — comercio chico que arranca |
| **Pro** | **Q12.500** | 15h | Professional — PYME con multi-sucursal y contabilidad operativa real |
| **Enterprise** | **Q30.000+** | 35h+ | Enterprise — migración legacy, integraciones, multi-empresa |

**Express incluye** (5h):
- Capacitación remota 3h
- Importación de catálogo (productos, clientes, proveedores) vía CSV
- Configuración fiscal NIT/régimen + setup FEL si aplica
- Setup sucursal principal + 1 cuenta bancaria
- Seguimiento por WhatsApp primera semana

**Pro incluye** (15h):
- Capacitación presencial GT capital o remoto extenso (8h)
- Importación legacy completa (productos, clientes, proveedores, saldos abiertos)
- Configuración multi-sucursal con permisos por usuario
- Setup completo de FEL (gestionada o BYO)
- Acompañamiento del primer cierre de caja en vivo
- Acompañamiento del primer cierre contable mensual
- 1 mes de soporte premium gratis (WhatsApp 8-20h)

**Enterprise incluye** (35h+):
- Plan de migración personalizado
- Migración de datos desde sistema legacy (productos, clientes, saldos abiertos, histórico de ventas si aplica)
- Integraciones con sistemas externos (e-commerce, contabilidad externa, banca electrónica)
- Capacitación a múltiples usuarios y sucursales en cascada
- Acompañamiento del primer mes operativo completo
- Documentación operativa interna a medida
- Línea directa con el implementador durante onboarding

**Política**: el setup es **obligatorio** salvo "self-onboarding waiver" firmado. El waiver te ahorra el setup pero pierdes:
- Garantía de uptime los primeros 30 días.
- Soporte prioritario los primeros 90 días (queda en email best-effort).
- Free re-implementation si tenés que rehacer datos por error de carga.

## FEL — modelo separado (no incluida en planes salvo Enterprise)

Razón: los certificadores (Infile, Digifact) cobran por volumen (Q0.25-1.50/factura) + cuota base. Empaquetarla a precio fijo en el plan es perdedor para el proveedor o caro para el cliente, depende del volumen.

### Opción A — BYO (Bring Your Own)
Cliente contrata Infile/Digifact directo. SIMTECH integra. **Costo SIMTECH: Q0**.

### Opción B — FEL gestionada por SIMTECH
SIMTECH es reseller con margen ~50% sobre costo del certificador.

| Volumen mensual | Cuota base | Por factura | Total ejemplo |
|---|---|---|---|
| 1-100 facturas | Q199/mes | Q1.49 c/u | 50 facturas = Q273 |
| 101-500 | Q199/mes | Q1.19 c/u | 300 facturas = Q556 |
| 501-2.000 | Q299/mes | Q0.89 c/u | 1.000 facturas = Q1.189 |
| 2.001+ | Q399/mes | Q0.69 c/u | 3.000 facturas = Q2.469 |

### Opción C — FEL incluida en Enterprise
1.000 facturas/mes incluidas en el plan. Excedente Q0.79 c/u.

## Add-ons (sobre cualquier plan compatible)

| Add-on | Precio | Disponible en |
|---|---|---|
| Sucursal extra | **Q299/mes** c/u | Pro, Enterprise |
| Usuario extra | **Q79/mes** c/u | Pro, Enterprise |
| Razón social extra | **Q499/mes** c/u | Enterprise |
| Soporte 24/7 | **Q899/mes** | Enterprise |
| Backup horario (no diario) | **Q399/mes** | Pro, Enterprise |
| Reporte contable a medida | **Q2.500** one-time | Pro, Enterprise |
| Capacitación adicional | **Q700/h** | Todos |
| Integración API custom | **Q8.000+** one-time | Enterprise |
| Capacitación in situ fuera GT capital | **Q1.500/día + viáticos** | Pro, Enterprise |

## Comparación cabeza a cabeza (mercado real)

| Producto | Mensual | Setup | Sucursales | Usuarios | RRHH/Planilla | Multi-empresa |
|---|---|---|---|---|---|---|
| Alegra Plus | Q920 | bajo | 5 | 5 | ❌ | ❌ |
| Bind ERP Pro | Q2.460 | medio | 3 | 5 | Limitado | ❌ |
| SAP B1 Cloud Limitada (5u) | Q3.465 | alto | Sí | 5 | Sí | ✅ |
| Acontrol mid | Q1.540 | medio | Sí | Variable | Sí | Limitado |
| **SIMTECH Pro** | **Q1.999** | **Q12.500** | **5** | **20** | **✅ completo** | ❌ |
| **SIMTECH Enterprise** | **Q4.499** | **Q30.000+** | **20** | **60** | **✅ completo** | **✅ (5)** |

**Mensaje pegador (Pro):** *"Por menos que Bind y un cuarto del precio de SAP B1, tenés un ERP completo con 4× los usuarios de Bind, soporte en horario guatemalteco y planilla GT-compliant (ISR, IGSS, Bono 14, Aguinaldo)."*

**Mensaje pegador (Enterprise):** *"Multi-empresa real (5 razones sociales), 60 usuarios, 20 sucursales, FEL incluida (1.000 facturas), API. SAP Business One para el mismo escenario te cuesta Q15.000+/mes solo licencia."*

## Estrategia comercial

### Beta cerrada (mes 1-2)

- 5 clientes invitados, Pro a Q999/mes los primeros 12 meses (descuento 50%) a cambio de:
  - Testimonio escrito + foto + autorización para usar logo en landing.
  - Uso real continuado (no para parquearlo).
  - Feedback estructurado mensual primer trimestre.
- Setup gratis para esos 5 (vale Q62.500 distribuido — costo de oportunidad acotado).

### Lanzamiento público (mes 3+)

- Precios públicos según tabla.
- Trial 30 días sin tarjeta.
- Setup obligatorio (con waiver para los que insistan).
- Demo personalizada de 30 min antes de cerrar (la objeción mayor: "¿realmente me sirve?").

### Escalado de captación

- Demo en vivo via Zoom/Meet a leads tibios.
- WhatsApp Business para leads que prefieren ese canal (mayoría de PYME GT).
- Pago por transferencia bancaria aceptado además de tarjeta — muchas PYMEs GT no usan tarjeta corporativa para SaaS.
- Casos de éxito por industria publicados en landing (tienda, ferretería, salón, lavandería, restaurante).

## Unit economics (con números v3)

Suponiendo cliente promedio en Pro a Q1.999/mes:

- **Ingreso licencia/mes:** Q1.999
- **Setup primer mes:** Q12.500 cash inmediato.
- **Costos directos infra:** ~Q80/mes
- **FEL gestionada (si optan, ~300 facturas/mes):** +Q357/mes margen para SIMTECH
- **Margen bruto recurrente:** ~Q1.920/mes (96%) sin FEL, ~Q2.275/mes con FEL gestionada.

Punto de equilibrio:
- **Costos fijos infra base:** ~Q1.000/mes (Vercel Pro + Supabase Pro + dominio + Stripe fees fijos).
- **1 cliente Pro estable** = costos cubiertos.
- **5 clientes Pro estables** = Q9.995 MRR + Q62.500 setup acumulado primeros meses.
- **15 clientes Pro estables** = Q29.985 MRR ≈ ingreso de equipo de 2 personas senior.
- **30 clientes Pro estables** = Q59.970 MRR + setups recurrentes = momento de contratar implementador full-time.

Con setup obligatorio (Q12.500 promedio), **3 clientes nuevos Pro** = Q37.500 cash inmediato + Q5.997 MRR adicional. Esto financia tu trimestre completo.

## Decisiones clave

1. ✅ **Precios v3** alineados a ERP completo. Starter Q899, Pro Q1.999, Enterprise Q4.499.
2. ✅ **Setup obligatorio** Q4.500 / Q12.500 / Q30.000+.
3. ✅ **FEL separada** con tres modelos (BYO / Gestionada / Incluida en Enterprise).
4. ✅ **Beta paga cerrada** primero (Q999/mes para 5 clientes durante 12 meses).
5. **¿Cobro mensual y anual desde el día 1?** Sí, anual al 16% off.
6. **¿Pago por transferencia + tarjeta?** Sí, ambos.

## Fuentes

- [SAP Business One Cloud — precios FCS Consultores GT](https://www.tusap.com.gt/precio-sap-business-one/)
- [SAP Business One — guía de precios actualizada](https://noeldcosta.com/es/sap-business-one-price-guide/)
- [Bind ERP en ComparaSoftware GT](https://www.comparasoftware.gt/bind-erp)
- [Alegra precios](https://www.alegra.com/mexico/contabilidad/precios/)
- [SDIG ERP Guatemala](https://sdigweb.com/)
- [SIAC ERP Guatemala (sidgt.com)](https://sidgt.com/)
- [Smartbit ERP Guatemala](https://www.smartbiterp.com/gt/)
- [Solaria ERP](https://www.procom.cr/solaria-erp/)
- [Virtual Books Guatemala](https://virtualbooks.com.gt/)
- [PlanillaRRHH Guatemala](https://www.planillarrhh.com/)
- [Infile Guatemala](https://infile.com.gt/)
- [Digifact Guatemala](https://www.digifact.com.gt/)
- [ComparaSoftware Guatemala — ERP PYMEs](https://www.comparasoftware.gt/software-erp-para-pymes)
- [Click & Cargo — Precio ERP 2026](https://clickandcargo.com/precio-erp/)
