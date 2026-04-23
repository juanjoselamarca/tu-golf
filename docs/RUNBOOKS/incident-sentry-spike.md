# Runbook — Sentry dispara spike de errores

**Severidad**: depende del tipo de error y el volumen.
**Objetivo**: triage rápido — ¿es un deploy roto, un bug latente o ruido?

## Síntomas

- Alerta de Sentry al mail/Slack
- Gráfico de errores con spike visible en el dashboard
- PostHog muestra eventos `$exception` aumentados

## Paso 1 — Triage (2 min)

Abrir Sentry dashboard del proyecto Golfers+:

1. **¿Hay correlación temporal con un deploy?**
   - Sí → revisar si amerita revert (ver `incident-deploy-broken.md`)
   - No → el bug existe hace tiempo, es ruido o cambió un dato

2. **¿El error afecta un flujo crítico?**
   - Flujos críticos: login, wizard ronda, scorear, leaderboard
   - Si sí → P0/P1
   - Si es una ruta secundaria → P2/P3

3. **¿Cuántos usuarios afectados?**
   - 1-3: probablemente caso edge. Investigar sin urgencia.
   - >10 en <1h: spike real. Actuar.

## Paso 2 — Clasificar el error

Tipos comunes y qué hacer:

| Error | Causa probable | Acción |
|---|---|---|
| `PostgrestError` / `fetch failed` | Supabase issue | Ver `incident-supabase-down.md` |
| `TypeError: cannot read of undefined` | Bug de código con dato nuevo inesperado | Reproducir + fix |
| `Auth session missing` | Usuario sin cookie — probablemente session expirada | Normal a baja frecuencia |
| `DYNAMIC_SERVER_USAGE` | API route sin `force-dynamic` | Agregar al archivo afectado |
| `Hydration mismatch` | SSR vs CSR divergen | Buscar `typeof window` o `Date.now()` |
| Timeouts Anthropic API | tAIger overloaded | Rate limit en tAIger, no afecta scoring |

## Paso 3 — Reproducir (10-30 min)

1. Copiar el stack trace de Sentry
2. Identificar archivo + línea
3. Reproducir local con los mismos datos (usar `user_id` del Sentry event)
4. Si no se reproduce → puede ser bug de concurrencia o dato corrupto

## Paso 4 — Fix

- Crear branch `fix/<descripcion-corta>`
- Escribir test que reproduzca
- Fix
- Pre-push local (tsc + test + build)
- PR con link al Sentry issue
- Merge

## Paso 5 — Verificar post-fix

- Al deployarse, verificar que el error ya no aparece en Sentry
- Marcar el issue Sentry como "Resolved"
- Si vuelve a aparecer (regresión) → abrir bug P0

## Cuándo silenciar un error en vez de fixearlo

Muy raramente. Solo si:
- Es de una librería externa y no afecta al usuario
- El stack trace confirma que no es código nuestro
- Ya está reportado upstream

Nunca silenciar errores del código propio — siempre se arreglan.
