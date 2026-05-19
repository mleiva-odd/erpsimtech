# Setup de email transaccional · SIMTECH ERP

**Objetivo:** enviar emails desde `noreply@simtechgt.com` (password reset, bienvenidas, notificaciones de planilla, recordatorios de pago) **sin caer en spam** y **sin pagar nada** mientras no superes ~3.000 envíos al mes.

Esta guía se sigue **una sola vez** cuando estés listo para que los usuarios reales reciban emails. Mientras no la sigas, todo funciona en modo "console" (los emails se loguean en Vercel pero no se envían).

---

## Stack elegido

- **Proveedor de envío:** [Resend](https://resend.com) — free tier 100 emails/día, 3.000/mes. Más que suficiente para arrancar.
- **DNS:** Cloudflare (ya lo usás para `simtechgt.com`).
- **Costo total:** Q0 mientras estés bajo el free tier.

**Por qué Resend y no Mailgun/SendGrid/SES:**
- Setup en 10 minutos vs 1 hora.
- API moderna y simple — el código del ERP ya está cableado.
- Free tier sin tarjeta de crédito (Mailgun y SendGrid sí la piden).
- Soporte por email, no chatbot.

**Por qué NO usar el redireccionamiento de Cloudflare Email Routing:**
Cloudflare Email Routing solo **recibe** (te llega lo que mandan a `info@simtechgt.com`). NO envía. Necesitás un servicio aparte para outbound. Resend hace solo outbound. Los dos pueden coexistir sin conflicto.

---

## Paso 1 · Crear cuenta en Resend (5 min)

1. Ir a [resend.com](https://resend.com) y registrarse con tu email habitual (no `@simtechgt.com` todavía).
2. Verificar el correo de bienvenida.
3. En el dashboard → **Domains** → **Add Domain** → escribir `simtechgt.com` → seleccionar región **us-east-1** (ahorra latencia desde GT).

Resend te va a mostrar **3 registros DNS** que necesitás pegar en Cloudflare. Algo así (los valores específicos los genera Resend, no copies estos textuales):

| Tipo | Nombre | Valor (ejemplo, NO usar este) |
|------|--------|-------------------------------|
| TXT | `simtechgt.com` | `v=spf1 include:_spf.resend.com ~all` |
| TXT | `resend._domainkey.simtechgt.com` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQK...` (clave DKIM larga) |
| MX  | `send.simtechgt.com` | `feedback-smtp.resend.com` (prioridad 10) |

**Dejá esa pestaña abierta** para copiar los valores reales en el siguiente paso.

---

## Paso 2 · Pegar los 3 records en Cloudflare DNS (5 min)

1. Login en [dash.cloudflare.com](https://dash.cloudflare.com) → seleccionar `simtechgt.com` → **DNS** → **Records**.

2. **Record SPF (TXT)** — autoriza a Resend a enviar en tu nombre:
   - Click **Add record**
   - Type: `TXT`
   - Name: `@` (significa el dominio raíz, simtechgt.com)
   - Content: el valor que te dio Resend, empieza con `v=spf1 include:_spf.resend.com ~all`
   - Proxy status: **DNS only** (gris, NO naranja — los TXT no se proxean)
   - TTL: Auto
   - Save

   **Ojo si ya tenés un SPF para Email Routing de Cloudflare:** no podés tener dos records SPF. Tenés que combinarlos en uno solo. Si tu actual dice `v=spf1 include:_spf.mx.cloudflare.net ~all`, lo reemplazás por:
   `v=spf1 include:_spf.mx.cloudflare.net include:_spf.resend.com ~all`

3. **Record DKIM (TXT)** — firma criptográfica que prueba que el email vino de Resend con tu autorización:
   - Type: `TXT`
   - Name: `resend._domainkey` (Cloudflare lo completa a `resend._domainkey.simtechgt.com`)
   - Content: el blob largo que empieza con `p=` (clave pública DKIM)
   - Proxy: DNS only
   - Save

4. **Record MX (return-path)** — para que las respuestas de bounce vuelvan a Resend:
   - Type: `MX`
   - Name: `send` (queda como `send.simtechgt.com`)
   - Mail server: `feedback-smtp.resend.com` (lo que te diga Resend)
   - Priority: 10
   - Proxy: DNS only
   - Save

5. **Record DMARC recomendado** — política de qué hacer con emails que fallen SPF/DKIM (Resend no te lo pide, pero subis tu reputación mucho):
   - Type: `TXT`
   - Name: `_dmarc`
   - Content: `v=DMARC1; p=none; rua=mailto:postmaster@simtechgt.com; aspf=r; adkim=r`
   - Save

   El `p=none` dice "no rechaces nada todavía, solo reportame qué pasa". Si en 1-2 meses los reportes están limpios, cambialo a `p=quarantine` (manda a spam si falla) o `p=reject` (descarta).

6. Volver al dashboard de Resend → **Domains** → click en `simtechgt.com` → **Verify DNS records**. Si todos están bien dice "Verified" en verde en cada uno. Si alguno dice "Pending" esperá 5-15 minutos (DNS tarda en propagarse) y volvé a click.

---

## Paso 3 · Generar API key en Resend (2 min)

1. Resend dashboard → **API Keys** → **Create API Key**
2. Name: `simtech-erp-production`
3. Permission: **Full access** (o **Sending access** si querés ser conservador)
4. Domain: `simtechgt.com` (selecciona el que verificaste)
5. Click **Create**
6. **Copiar el valor que empieza con `re_`** — Resend solo te lo muestra una vez, si lo perdés tenés que generar otro

---

## Paso 4 · Configurar Vercel (3 min)

1. Vercel dashboard → proyecto `erp-simtech` → **Settings** → **Environment Variables**
2. Agregar dos variables, ambas con scope **Production** (no Preview ni Development, así los emails de pruebas en preview siguen logueando en consola):

   | Name | Value |
   |------|-------|
   | `RESEND_API_KEY` | `re_xxxxxxxxxxxxxxxxxxxxxx` (el de paso 3) |
   | `EMAIL_FROM` | `SIMTECH ERP <noreply@simtechgt.com>` |

3. **Redeploy** para que las nuevas vars tomen efecto: Deployments → último → click los tres puntos → **Redeploy**.

---

## Paso 5 · Verificar que está funcionando (2 min)

1. Una vez deployed, ir a `https://erp.simtechgt.com/admin/health` (logueado como SUPER_ADMIN)
2. En la tarjeta **Email provider** debería decir: `Activo: resend` (verde)
3. Ir a `https://erp.simtechgt.com/forgot-password`, escribir tu email real, enviar
4. **Revisar tu bandeja en menos de 1 minuto.** Debería llegar de `SIMTECH ERP <noreply@simtechgt.com>` con el subject "Restablecer tu contraseña · SIMTECH ERP"
5. Si llega al **inbox normal** → todo perfecto
6. Si llega a **spam** → revisar los DNS records (volver al dashboard de Resend, todos deben decir "Verified")

---

## Paso 6 · Crear postmaster (recomendado)

Para que el DMARC funcione bien y recibás los reportes de envío:

1. Cloudflare → **Email** → **Email Routing** → Routes
2. Agregar custom address: `postmaster@simtechgt.com` → forward a tu email personal
3. Listo. Los reportes diarios de DMARC te llegan ahí.

---

## Troubleshooting

**Email cae a spam**
- Verificá los 3 records en Resend (deben decir "Verified" en verde, no "Pending")
- Asegurate de NO tener dos records SPF (solo uno combinado)
- Esperá 24h después de verificar — Gmail aprende rápido pero no instantáneo

**`/admin/health` dice "Console" en vez de "resend"**
- Falta `RESEND_API_KEY` o `EMAIL_FROM` en Vercel
- O las setasteaste en Preview en vez de Production
- Después de cambiar env vars en Vercel necesitás **redeploy** (no basta con save)

**Resend dice "Domain not verified"**
- DNS tarda 5-30 min en propagar globalmente
- Verificá los TXT con: `dig TXT simtechgt.com +short` y `dig TXT resend._domainkey.simtechgt.com +short`
- Si los valores aparecen, click "Verify" en Resend de nuevo

**Llegué al límite de 3.000/mes**
- Resend muestra un counter en su dashboard. Cuando lo veas pasar 2.500 considerar upgrade.
- Pro plan: $20/mes por 50.000 envíos. Sigue siendo barato vs SendGrid.

---

## Qué cambiar si querés migrar a otro proveedor

El código del ERP usa una capa abstracta (`src/lib/email/`) — para cambiar de Resend a SendGrid/Mailgun/SES:

1. Crear `src/lib/email/sendgrid-provider.ts` siguiendo el patrón de `resend-provider.ts`
2. Modificar `src/lib/email/index.ts` para detectar el nuevo provider según env vars
3. Listo — ningún handler de negocio se entera

Ningún email que envía la app está atado a Resend directamente, todos pasan por `sendEmail()` que abstrae el provider.

---

## Costo proyectado por volumen de clientes

| Clientes | Emails/mes estimados | Plan Resend | Costo |
|----------|---------------------|-------------|-------|
| 1-10 | ~500 (resets + welcomes + payrolls) | Free | Q0 |
| 10-50 | ~2.500 | Free | Q0 |
| 50-200 | ~10.000 | Pro $20 | ~Q155 |
| 200+ | >50.000 | Business custom | ver con Resend |

Las facturas FEL emitidas a clientes finales NO se mandan automáticamente por email (van por el flujo SAT). Si activás envío automático del PDF de factura al cliente, el volumen sube proporcional al volumen de ventas.
