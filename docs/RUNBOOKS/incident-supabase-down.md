# Runbook — Supabase caído o lento durante torneo

**Severidad**: P0 si hay torneo activo.
**Objetivo**: minimizar pérdida de datos + comunicar transparente a usuarios.

## Síntomas

- Errores 500 en endpoints que tocan BD (`/api/game`, `/api/ronda-libre/create`, etc.)
- Jugadores reportan "no guarda score"
- Sentry dispara errores de tipo `PostgrestError` o `network timeout`
- Health check `/api/admin/health-check` reporta FAIL en BD

## Paso 1 — Confirmar que el problema es Supabase (1 min)

1. Status oficial: https://status.supabase.com
2. Dashboard del proyecto: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce
   - ¿Hay warning de degradación?
   - Pestaña "Project Health" — ver latencia
3. Query directo:
   ```bash
   curl "https://hoswfwhvcgqlqdmzpnce.supabase.co/rest/v1/profiles?select=id&limit=1" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
   ```
   Si tarda >5s o da 5XX → Supabase está degradado.

Si Supabase está OK → el problema es otro. Ver `incident-sentry-spike.md`.

## Paso 2 — Activar modo degradado (si existe torneo activo)

Actualmente **no hay modo degradado** — es deuda técnica (ver TECH_DEBT.md).
Lo que se puede hacer hoy:

1. **Mostrar banner global de aviso**: por implementar. Mientras tanto, comunicar por el canal del torneo.
2. **Offline resilience del scoring**: la app tiene `useScoreSync` y `score-storage` que retienen scores offline. Los jugadores pueden seguir registrando y se sincronizan cuando Supabase vuelva. Verificar en `src/hooks/useScoreSync.ts`.

## Paso 3 — Escalar

Si la caída es >5 min y hay torneo activo:

1. Abrir ticket de soporte en Supabase (dashboard → soporte)
2. Comunicar a los organizadores del torneo para que los jugadores usen scorecards de papel como respaldo
3. Registrar tiempo de inicio del incidente

## Paso 4 — Al volver Supabase

1. Correr `/api/admin/health-check` completo
2. Verificar que los scores offline se sincronizaron (ver jugadores con `score_source='manual_player'` en `hole_scores`)
3. Si algún score NO se sincronizó, se recupera del `localStorage` del jugador (no es automático hoy — deuda técnica)

## Paso 5 — Post-mortem obligatorio

Si afectó torneo:
1. Entrada en `docs/SPRINT_LOG.md`
2. Evaluar si vale la pena implementar "modo degradado global" con banner
3. Revisar si la offline resilience retuvo todos los scores
