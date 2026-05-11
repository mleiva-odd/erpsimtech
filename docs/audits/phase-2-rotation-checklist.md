# Sprint 2.A · Checklist de rotación de credenciales y secretos

Acciones manuales que **tienen que ejecutarse en Supabase y Vercel** después de correr el script de limpieza. El script borra archivos del repo, pero las contraseñas viejas y secretos siguen activos en los servicios externos hasta que vos los rotes.

> Tiempo estimado: 25-40 minutos.
> Hacer **todo de un tirón** para evitar dejar el sistema con credenciales mixtas.

---

## 1) Generar contraseñas nuevas (1 min)

Usá un gestor (1Password, Bitwarden) o un comando en tu terminal:

```bash
# Genera 5 contraseñas fuertes (24 chars, alfanumérico + símbolos)
for label in superadmin company-admin manager cashier nextauth-secret; do
  printf "%-18s : %s\n" "$label" "$(LC_ALL=C tr -dc 'A-Za-z0-9!@#%^&*-_+=' </dev/urandom | head -c 24)"
done
```

Guardalas en tu gestor. **Nunca** las pegues en credentials.md, README, ni en commits.

---

## 2) Rotar `NEXTAUTH_SECRET` (3 min)

Es el secret que firma los JWT de sesión. Rotarlo invalida TODAS las sesiones activas (lo que está bien — es lo que queremos para descartar tokens viejos).

**Vercel → Settings → Environment Variables**

- `NEXTAUTH_SECRET` (Production, Preview): nuevo valor de la lista del paso 1.
- Después: **Vercel → Deployments → Redeploy** (sin rebuild, solo redeploy del último build).

---

## 3) Rotar `SUPABASE_SERVICE_ROLE_KEY` (5 min)

⚠️ **Crítico**: este key bypasea RLS y da acceso total a la BD. Si filtró, tu data está expuesta.

**Supabase → Project Settings → API**

- `Service Role Key`: click en `Roll API key`. Copiá el nuevo.

**Vercel → Settings → Environment Variables**

- `SUPABASE_SERVICE_ROLE_KEY` (Production, Preview): nuevo valor.
- Redeploy.

> Si la key vieja aparece en algún backup o repositorio que clonaste, también rotala allí. Y si lo subiste a Slack, GitHub Issues, etc., revisar.

---

## 4) Rotar `NEXT_PUBLIC_SUPABASE_ANON_KEY` (opcional, 3 min)

El anon key NO es secreto (va al cliente) pero rotarlo es buena higiene si sospechás abuso. Mismo procedimiento que el service_role en Supabase, y actualizar `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel.

---

## 5) Rotar contraseñas de usuarios reales en Supabase (10-15 min)

Las contraseñas creadas vía seed (`admin123`, `gerente123`, `cajero123`) están en producción si el seed corrió contra Supabase. Hay dos caminos:

### Opción A — Re-seed completo (si los datos son demo y se pueden tirar)

Solo si tu base productiva es 100% demo y se puede limpiar:

```bash
# En tu terminal local (NO en CI), exportá las nuevas contraseñas como variables:
export SEED_SUPERADMIN_EMAIL="admin@simtechgt.com"
export SEED_SUPERADMIN_PASSWORD="<contraseña-fuerte-1>"
export SEED_COMPANY_ADMIN_EMAIL="simtech@simtechgt.com"
export SEED_COMPANY_ADMIN_PASSWORD="<contraseña-fuerte-2>"
export SEED_MANAGER_PASSWORD="<contraseña-fuerte-3>"
export SEED_CASHIER_PASSWORD="<contraseña-fuerte-4>"

# Asegurate de que DATABASE_URL en .env apunta a la DB que querés re-seedear.
# (Esta operación BORRA datos. No correr contra DB de cliente real).
npm run seed
```

### Opción B — Rotar SOLO contraseñas (preserva datos)

Mejor si ya hay datos demo que querés conservar. Bootstrap el super admin con la herramienta segura, y para los demás usuarios resetealos vía la UI de la aplicación (`/admin/companies/[id]` o `/users` editando cada uno).

```bash
# Solo super admin:
export BOOTSTRAP_SUPERADMIN_EMAIL="admin@simtechgt.com"
export BOOTSTRAP_SUPERADMIN_PASSWORD="<contraseña-fuerte-1>"
export BOOTSTRAP_SUPERADMIN_FORCE_RESET="true"
npm run bootstrap:superadmin
```

Para los demás usuarios (gerentes, cajeros), entrá como super admin a la app y editales la contraseña uno por uno.

---

## 6) Rotar `DATABASE_URL` y `DIRECT_URL` (10 min, solo si la considerás comprometida)

Si sospechás que alguien tuvo acceso al `.env` con la connection string de Postgres:

**Supabase → Project Settings → Database → Connection string** → cambiar la contraseña del usuario `postgres`.

Re-componé la URL con la contraseña nueva y actualizala en Vercel (`DATABASE_URL` y `DIRECT_URL`). Redeploy.

---

## 7) Verificación post-rotación (5 min)

1. **Login**: entrar a la app productiva con cada nueva contraseña. Confirmar que las viejas (`admin123`, etc.) ya NO funcionan.
2. **Vercel logs**: que no aparezcan errores `Missing required environment variable`.
3. **Supabase logs**: revisar autenticación reciente, descartar accesos no esperados.
4. **DB**: `SELECT email, role, "updatedAt" FROM "User" ORDER BY "updatedAt" DESC LIMIT 10;` — debería mostrar tus rotaciones recientes.

---

## 8) Documentar (3 min)

En tu gestor de secretos personal/del equipo, anotá:
- Fecha de rotación.
- Quién hizo la rotación.
- Qué se rotó (NEXTAUTH_SECRET, SERVICE_ROLE, contraseñas X/Y/Z).
- Próxima rotación programada (sugerido: trimestral para secrets, semestral para contraseñas humanas).

---

## Lo que NO hace falta rotar

- Contraseñas de NextAuth de usuarios que NO estaban en `credentials.md` y se crearon vía la UI con buena contraseña.
- Keys de servicios externos que aún no se integraron (Stripe, etc.).
