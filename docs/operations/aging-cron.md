# Cron de aging — Marcar documentos vencidos como OVERDUE

Fase 17 introduce `POST /api/cron/mark-overdue` que actualiza `Sale.status`
y `SupplierPayable.status` a `OVERDUE` cuando `dueDate < now()` y queda
saldo pendiente. El endpoint es público pero gateado por header
`X-Cron-Secret`.

## 1 · Setup del secret

Genera un string aleatorio largo y configuralo como `CRON_SECRET` en
Vercel (Production + Preview) **y** en GitHub Actions Variables:

```bash
openssl rand -base64 32
# copiá el output a Vercel env vars + GitHub repo settings → Variables → CRON_SECRET
```

Sin esta variable seteada el endpoint responde 503 (kill switch).

## 2 · Schedule

Hay tres opciones; elegí UNA. Recomendado para Supabase FREE: GitHub Actions
(mismo runner que usás para `keep-alive.yml`).

### Opción A · GitHub Actions schedule (recomendado)

Crear `.github/workflows/mark-overdue.yml`:

```yaml
name: Mark overdue docs

on:
  schedule:
    # 06:00 GT (12:00 UTC) todos los días — antes de la jornada laboral
    - cron: '0 12 * * *'
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: POST /api/cron/mark-overdue
        env:
          CRON_URL: ${{ vars.MARK_OVERDUE_URL || 'https://erp.simtechgt.com/api/cron/mark-overdue' }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for attempt in 1 2 3; do
            response=$(curl -fsS -X POST \
              -H "X-Cron-Secret: $CRON_SECRET" \
              -H "Content-Type: application/json" \
              --max-time 30 \
              "$CRON_URL")
            if [ $? -eq 0 ]; then
              echo "OK on attempt $attempt: $response"
              exit 0
            fi
            sleep 30
          done
          echo "All 3 attempts failed"
          exit 1
```

Requisitos:
- `CRON_SECRET` en repo settings → Secrets and variables → Actions → Secrets.
- (Opcional) `MARK_OVERDUE_URL` en Variables si el dominio cambia.

### Opción B · Vercel Cron

Editar `vercel.json` (crear si no existe):

```json
{
  "crons": [
    {
      "path": "/api/cron/mark-overdue",
      "schedule": "0 12 * * *"
    }
  ]
}
```

Limitación: Vercel Cron NO inyecta headers custom. Habría que cambiar el
endpoint para aceptar el secret en query string `?secret=...` (anti-pattern
porque queda en logs). Por eso preferimos GitHub Actions.

### Opción C · Supabase pg_cron

Aplicar en Supabase SQL Editor (proyecto debe tener la extensión `pg_cron`
habilitada en Database → Extensions):

```sql
SELECT cron.schedule(
  'mark-overdue-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://erp.simtechgt.com/api/cron/mark-overdue',
    headers := '{"Content-Type": "application/json", "X-Cron-Secret": "REEMPLAZAR_AQUI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Requiere extensión `pg_net` también. Y el secret queda en plain text en
la definición del cron — menos seguro que GitHub Actions con secrets.

## 3 · Verificación

Después de configurar, podés disparar manualmente:

```bash
curl -X POST \
  -H "X-Cron-Secret: $CRON_SECRET" \
  https://erp.simtechgt.com/api/cron/mark-overdue
```

Respuesta esperada:

```json
{ "salesMarkedOverdue": 12, "payablesMarkedOverdue": 4 }
```

Si responde 401, el secret está mal. Si responde 503, falta `CRON_SECRET`
en el ambiente.

## 4 · Limpiar cron viejo (si aplica)

Si en el futuro se renombra el endpoint o se descontinúa:

- GitHub Actions: borrar el workflow.
- Vercel Cron: borrar entrada de `vercel.json`.
- pg_cron: `SELECT cron.unschedule('mark-overdue-daily');`
