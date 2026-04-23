# Runbook — Health check completo del sistema

**Frecuencia**: diaria (cron automático 08:00) + manual cuando hay dudas.
**Endpoint**: `GET /api/admin/health-check`

## Cómo correrlo

### Modo visual (admins)

1. Login como admin
2. Ir a `/admin/sistema`
3. La página muestra cada check con estado (pass/warn/fail) y mensaje

### Modo CLI

```bash
curl https://golfersplus.vercel.app/api/admin/health-check \
  -H "Cookie: <tu-sesion-admin>" | jq
```

### Modo cron (automático)

Corre diario a las 08:00 UTC (cron Vercel en `vercel.json`). Resultado se guarda en tabla `health_check_log` con:
- `checked_at`: timestamp
- `status`: 'pass'|'warn'|'fail'
- `checks`: JSONB con todos los checks
- `duration_ms`: tiempo total

## Qué chequea

El endpoint verifica:

1. **Supabase connectivity**: query a `profiles` con timeout
2. **Tablas críticas**: existencia y permisos de `tournaments`, `rounds`, `rondas_libres`, `hole_scores`
3. **RLS policies**: que estén activas en tablas sensibles
4. **Env vars**: que las críticas existan en runtime
5. **Integraciones**: Anthropic, Sentry, PostHog accesibles
6. **Datos**: torneos activos, rondas en curso, scores de la última hora

Ver código completo: `src/app/api/admin/health-check/route.ts`

## Cómo leer el resultado

```json
{
  "timestamp": "2026-04-23T00:00:00Z",
  "duration_ms": 1234,
  "summary": { "total": 20, "passed": 18, "warnings": 2, "failed": 0 },
  "categories": [
    {
      "name": "Database",
      "checks": [
        { "name": "supabase_connectivity", "status": "pass", "duration_ms": 45 },
        { "name": "profiles_table_access", "status": "pass", "duration_ms": 12 }
      ]
    }
  ]
}
```

**Criterios**:
- **pass**: todo OK, no acción
- **warn**: algo degradado pero funcional. Revisar en próximas horas.
- **fail**: problema activo. Actuar inmediatamente — ver qué runbook aplica.

## Checks con fail — qué hacer

| Check en fail | Runbook |
|---|---|
| `supabase_connectivity` | `incident-supabase-down.md` |
| `env_var_*` missing | Arreglar en Vercel dashboard → Settings → Environment Variables |
| `rls_policy_*` | `docs/archive/` tiene SQL de RLS. Revisar policy faltante. |
| `anthropic_api` | tAIger+ caído — degradación graceful, no bloqueante |
| `sentry_connectivity` | Alertas no llegan. Revisar DSN. |

## Alertas automáticas

El cron diario **no** envía alerta si hay fails. Es deuda técnica (ver TECH_DEBT.md P2).
Hoy: el admin debe revisar manualmente `/admin/sistema` o el log.
Pendiente: email/Slack/PostHog alert cuando algún check falle.
