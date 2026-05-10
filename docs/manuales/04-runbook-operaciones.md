# Runbook de Operaciones — SIMTECH ERP

Para vos (Marvin) como operador del SaaS. Cubre tareas recurrentes y respuesta a incidentes.

## Stack

- **Frontend + API**: Next.js 16 (App Router) en Vercel.
- **DB**: Postgres en Supabase (proyecto `cfluozcpcrqfapqwquip`).
- **Auth**: NextAuth con JWT, cookies `__Secure-`.
- **Hosting de assets**: Supabase Storage (bucket `products`).
- **CDN**: Cloudflare delante de Vercel (incluye Web Analytics).
- **CI**: GitHub Actions (lint, typecheck, build) + Vercel auto-deploy desde `develop`.

## Repositorio

`github.com/mleiva-odd/erpsimtech` — branch principal de deploy: `develop`.

## Flujo de deploy

1. PR a `develop` desde rama de feature/audit.
2. CI corre lint + typecheck + build.
3. Merge → Vercel detecta push y deploya automáticamente.
4. Verificá `vercel.com → Deployments` que esté **Ready**.
5. Smoke test: login, una venta de prueba.

`main` queda como branch de "release archive" — no es la fuente de deploys.

## Tareas recurrentes

### Diario (lunes a viernes en horario laboral)

- [ ] Revisar Vercel logs por errores 500 acumulados.
- [ ] Mirar Supabase advisor: `https://supabase.com/dashboard/project/cfluozcpcrqfapqwquip/advisors`.

### Semanal

- [ ] Revisar tabla `LoginAttempt`: si hay un email con muchos fallos, podría ser ataque dirigido. Limpiar registros >24h:
  ```sql
  DELETE FROM "LoginAttempt" WHERE "createdAt" < NOW() - INTERVAL '24 hours';
  ```
- [ ] Revisar `AuditLog` por acciones inusuales (anulaciones masivas, cambios de configuración fuera de hora).

### Mensual

- [ ] Backup verificado: confirmar que Supabase está haciendo backups (Settings → Database → Backups).
- [ ] Revisar usuarios inactivos hace >90 días y proponer desactivación.
- [ ] Auditar permisos de roles personalizados creados por clientes.

### Trimestral

- [ ] Rotar `NEXTAUTH_SECRET` en Vercel (afecta sesiones, todos vuelven a loguearse).
- [ ] Revisar dependencias con `npm outdated` y aplicar updates de seguridad.
- [ ] Run `npm audit` y resolver vulnerabilidades altas/críticas.

### Semestral

- [ ] Rotar `SUPABASE_SERVICE_ROLE_KEY`. Roll API key en Supabase, actualizar en Vercel, redeploy.
- [ ] Pedir a clientes que roten contraseñas de admin si tienen >6 meses.

## Incidentes

### "El login no funciona"

1. Verificá Vercel: deployment Ready.
2. Verificá Supabase: project ACTIVE_HEALTHY.
3. Revisá logs de Vercel por errores en `/api/auth/...`.
4. Test con curl:
   ```bash
   curl -i https://erp.simtechgt.com/login
   ```
   Esperás 200 con HTML.
5. Si está caído: rollback al último deploy bueno desde Vercel UI.

### "Algún cliente reporta que ve datos de otra empresa"

🚨 **Crítico**: posible bug de aislamiento multi-tenant.

1. **Inmediatamente**: pedir captura de pantalla del cliente, ID del recurso aparentemente cruzado.
2. Loguéate como Super Admin, abrí el recurso en cuestión y verificá su `companyId`.
3. Loguéate como el usuario afectado y reproducí el caso.
4. Si confirmás el cruce:
   - Revisá `git blame` del endpoint involucrado para ver si falta `companyId` en el where.
   - Aplicá hotfix con commit firmado descriptivo.
   - Push directo a `develop` (saltate el PR si es bug de seguridad confirmado).
   - Notificá a los dos clientes afectados con detalles de qué se vio y qué se corrigió.

### "Rate limit me bloqueó injustamente"

Para destapar a un email/IP específico:

```sql
-- Ver intentos recientes
SELECT email, "ipAddress", success, "createdAt"
FROM "LoginAttempt"
WHERE email = 'usuario@cliente.com'
  AND "createdAt" > NOW() - INTERVAL '15 minutes'
ORDER BY "createdAt" DESC;

-- Borrar fallos del usuario (le permite loguear de nuevo)
DELETE FROM "LoginAttempt"
WHERE email = 'usuario@cliente.com'
  AND success = false
  AND "createdAt" > NOW() - INTERVAL '15 minutes';
```

### "Vercel deploy falló"

1. Vercel → Deployments → click en el deploy fallido → ver logs.
2. Causas comunes:
   - Typecheck error: corrige y commit.
   - Build error por env var faltante: agregar en Vercel → Settings → Environment Variables.
   - Prisma generate falla: revisar `prisma/schema.prisma`.
3. Mientras tanto, el deploy anterior sigue activo. No hay downtime.

### "Una venta quedó duplicada"

- El sistema previene duplicados por `clientRequestId` (idempotencia).
- Si efectivamente hay dos sales con el mismo cliente/items/timestamp:
  - Verificá que NO sean realmente dos compras consecutivas.
  - Si confirmás duplicación, anulá una desde el panel del admin de la empresa (PATCH `/api/sales/[id]` con action=CANCEL).
  - Investigá los logs para entender por qué pasó (Vercel logs filtrados por `/api/sales`).

## Migraciones de DB

### Aplicar nueva migración

1. Edita `prisma/schema.prisma` localmente.
2. Probalo: `npx prisma db push` contra DB de testing.
3. Cuando esté listo:
   ```bash
   # Sin perder datos:
   npx prisma db push
   ```
   O para preservar histórico:
   ```bash
   npx prisma migrate dev --name nombre_descriptivo
   ```
4. Genera el cliente: `npx prisma generate`.
5. Commit y push.

Para Supabase específicamente, usar el MCP o el SQL editor para migraciones manuales (queda registrado en Migrations).

### Restore desde backup

Supabase → Database → Backups → elegí timestamp → Restore. Crea una nueva DB; tenés que actualizar `DATABASE_URL` en Vercel para apuntar al restore. **Hacelo solo en emergencia**.

## Variables de entorno (resumen)

En Vercel (`Settings → Environment Variables`):

| Variable | Valor | Notas |
|---|---|---|
| `NEXTAUTH_SECRET` | string aleatorio 32+ chars | Rotar trimestralmente |
| `NEXTAUTH_URL` | `https://erp.simtechgt.com` | URL pública |
| `DATABASE_URL` | Supabase pooler (5432, pgbouncer) | Para runtime |
| `DIRECT_URL` | Supabase direct (5432) | Para `prisma migrate` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://...supabase.co` | Público OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key | Público OK |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role | **Secreto** — solo server |

**Nunca commitear** `.env` o `.env.local`. Están en `.gitignore`.

## Soporte

- **Status público**: si Cowork lo soporta, publicar status page.
- **Canal de soporte cliente**: definir email/WhatsApp.
- **Escalation a Anthropic/Vercel/Supabase**: cuentas de soporte con su SLA.

## Emergencias / Contacto

- Operador principal: Marvin (mleiva@odd.digital).
- Backup: [definir].
- Acceso a Vercel/Supabase/GitHub: cuenta `mleiva-odd`.
