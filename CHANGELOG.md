# CHANGELOG · SIMTECH ERP

Historial de cambios mayores del sprint **Camino a producción** (Mayo 2026).

Para detalle de cada commit ver `git log`. Este archivo agrupa por fase para entender qué cambió a nivel de capacidad del producto.

---

## Sprint "Camino a producción" (Mayo 2026)

Bloque de trabajo entre Fase 27 (Onboarding wizard) y Fase 52 (Cron de avisos de trial). Apunta a tener el producto **lo suficientemente sólido para mostrar a un primer cliente real** sin que falten piezas obvias.

### Funcionalidades nuevas para el usuario final

- **Reset de contraseña por email** (Fase 31b). Páginas `/forgot-password` y `/reset-password?token=…`. Sin necesidad de que el admin haga el reset manualmente. Token URL-safe con 256 bits de entropía, single-use, expira en 30 minutos (configurable con `PASSWORD_RESET_TTL_MINUTES`). Sin Resend activo solo loguea — pero la UX completa funciona.
- **Email de bienvenida al crear empresa** (Fase 31c). Tras completar el onboarding, el admin recibe un correo con próximos pasos y link al sistema.
- **Notificación de planilla generada** (Fase 31c). Al cerrar una planilla, el admin RH recibe un correo con resumen (cantidad de empleados, total neto, link al detalle).
- **Aviso de trial por vencer** (Fase 52). Cron diario emite recordatorios a 7 días y 1 día antes de que se acabe la prueba gratuita. Idempotente: nunca manda el mismo aviso dos veces.

### Funcionalidades nuevas para vos como dueño del SaaS

- **Health dashboard** (`/admin/health`, Fase 37). Solo SUPER_ADMIN. Muestra status DB con latencia, email provider activo, Sentry on/off, info de deploy (commit / region / env) y flags de configuración. Auto-refresh cada 30s.
- **Directorio global de empresas** (`/admin/companies`, Fase 47). Lista todas las empresas registradas con métricas mensuales (ventas, planillas), estado de suscripción (TRIAL con días restantes / ACTIVE / Suspendida) y búsqueda por nombre/email/slug/NIT.
- **Detalle de empresa** (`/admin/companies/[id]`, Fase 49). Drill-down con info básica, suscripción, sucursales y sus ventas del mes, lista de usuarios y últimos 20 eventos de auditoría.
- **Links en sidebar** (Fase 47). Grupo "SaaS Global" del sidebar ahora incluye Directorio Global y Health Dashboard.

### Mejoras de calidad y operacionales

- **Branding en PDFs** (Fase 29). Logo de la empresa renderizado en factura electrónica y boleta de pago, con fallback gracioso si la imagen no se puede cargar (max 2MB, timeout 5s).
- **Páginas legales públicas** (Fase 32). Templates de Términos, Privacidad y Soporte para Guatemala. Linkeados desde footer de landing y login. Requieren revisión de abogado antes de uso comercial real.
- **SEO base** (Fase 36). `/robots.txt`, `/sitemap.xml`, OpenGraph y Twitter Card en metadata. La landing es indexable por Google y compartible con preview rico.
- **Sentry wiring real** (Fase 35). `observability.ts` dejó de ser stub: ahora envía eventos a Sentry cuando `SENTRY_DSN` está configurada en producción.
- **Capa email abstracta** (Fase 31a). `src/lib/email/` con interfaz `EmailProvider`. Default ConsoleProvider (logs); cuando se setea `RESEND_API_KEY`+`EMAIL_FROM`, cambia automáticamente a Resend sin tocar handlers de negocio.
- **Templates HTML cross-client** (Fase 41). 6 templates inline-styled compatibles con Outlook/Gmail/Apple Mail: password reset, welcome, payroll generated, invoice sent, payment reminder, account suspended.
- **Cron de mantenimiento** (Fase 38). Endpoint `/api/cron/maintenance` protegido por Bearer CRON_SECRET. Limpia tokens expirados (>7d) y login attempts viejos (>30d). Workflow GH Actions diario.
- **Mensajes NextAuth centralizados** (Fase 48). `src/lib/auth/error-messages.ts` con función `mapAuthError()`. Reemplaza el substring matching frágil que había en el login. 8 tests garantizan que ningún detalle técnico se filtre al usuario.
- **Smoke test extendido** (Fase 46). De 4 endpoints a 13. Cubre forgot/reset password, páginas legales, robots, sitemap, admin/health (401), cron/maintenance (405/401/503).
- **Documentación** (Fases 42, 43). `docs/email-setup.md` guía paso a paso para conectar Resend + Cloudflare DNS sin caer en spam. `docs/runbook.md` separa env vars esenciales vs recomendadas e incluye checklist post-deploy con migraciones.

### Fixes críticos descubiertos en producción

- **EnvBanner "LOCAL DEV" en producción** (Fase 38 — fix). Después de tres iteraciones, la solución final fue Client Component con `useSyncExternalStore` que lee `window.location.hostname` para decidir el ambiente.
- **Build Vercel falla por `<img>`** (Fase 40). Next.js 16 + Vercel estrictos: warnings de `@next/next/no-img-element` terminan en exit code 1. Reemplazado por `<Image />` con `unoptimized` para logos pequeños 40-64px de URL externa.
- **Build Vercel falla por `require('resend')`** (Fase 44). Turbopack hace análisis estático del `require()` dinámico y falla aunque esté envuelto en try/catch. Fix: `new Function('return require')()` para esconder el require del análisis y permitir resolución en runtime.
- **Build Vercel falla por `useSearchParams` sin Suspense en login** (Fase 45). Next.js 16 exige que toda página con ese hook esté dentro de `<Suspense>` o sea dinámica. Refactor: separar contenido en `LoginPageInner` y envolver con Suspense en el export default.

### Schema de base de datos

- **`PasswordResetToken`** (Fase 31b). Nueva tabla. Migración `20260620000000_password_reset_token`. Almacena solo el hash sha256 del token (nunca el token plano). Single-use vía `usedAt`. Cascada de borrado con `User`.

### Variables de entorno nuevas

Documentadas en `.env.example` y en `docs/runbook.md`:

- `RESEND_API_KEY` + `EMAIL_FROM` — para emails reales (Fase 31a). Sin estas, todo se loguea en consola.
- `PASSWORD_RESET_TTL_MINUTES` — validez del token de reset, default 30 (Fase 31b).
- `CRON_SECRET` — Bearer para `/api/cron/*` (Fase 38). Sin esta, los endpoints cron devuelven 503.
- `NEXT_PUBLIC_SITE_URL` — dominio canónico para metadataBase / sitemap / templates (Fase 36). Default `https://erp.simtechgt.com`.

### Acciones manuales requeridas tras este sprint

1. **`npx prisma migrate deploy`** en producción para crear `PasswordResetToken`.
2. **`npx prisma generate`** local + borrar `src/types/prisma-phase19.d.ts` y `prisma-phase20.d.ts` (Fase 39, no se pudo automatizar desde sandbox).
3. **Generar `CRON_SECRET`**: `openssl rand -hex 32`. Setear en GitHub Settings → Secrets + Vercel Production env vars.
4. **(opcional) Activar Resend**: seguir `docs/email-setup.md`. 5-15 minutos. Sin esto, los emails se loguean en Vercel pero no se envían.
5. **(opcional) Activar Sentry source maps**: crear cuenta, agregar `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` a Vercel. Sin esto los stack traces en Sentry son ilegibles.

### Pendiente (no se hizo en este sprint)

- **Fase 24a** · Migración de 75 handlers a `withTenantContext` (activar RLS app_user). Postpuesto hasta 1-3 clientes pagando — riesgo no justifica esfuerzo hoy.
- **Fase 28** · FEL real con Infile o Digifact. Bloqueante para clientes que facturan en serio. Esperando que Marvin contrate al certificador.
- **Fase 30** · Validación SAT por contador. PDF entregado en `docs/cuestionario-contador-simtech.pdf`; esperando respuestas para ajustar lo que corresponda.
- **Fase 33** · Billing automatizado (Stripe/etc.). Decisión: cobrar por transferencia mientras la base de clientes sea pequeña.
- **Fase 39** · Cleanup de shims Prisma phase19/phase20. Bloqueado por permisos del sandbox.

---

Para historial previo (Fases 1 a 27) ver `docs/audits/master-discovery.md` y la serie de archivos `phase-NN-*.md` en `docs/audits/`.
