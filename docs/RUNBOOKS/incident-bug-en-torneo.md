# Runbook — Jugador reporta bug durante torneo real

**Severidad**: P0 siempre. Directiva CERO FALLOS.
**Objetivo**: minimizar impacto en la experiencia del jugador Y capturar evidencia completa.

## Paso 1 — No entrar en pánico, capturar evidencia (2 min)

Pedirle al jugador/organizador:
- Screenshot de la pantalla donde ocurre
- Hora aproximada del evento (para cruzar con logs)
- Qué estaba haciendo cuando pasó (paso a paso)
- Qué dispositivo + navegador (iPhone/Android, Safari/Chrome)
- ¿Pasa consistentemente o solo a veces?

Guardar todo esto. Va al SPRINT_LOG.

## Paso 2 — Workaround inmediato (5 min)

El jugador NO PUEDE esperar a que arregles el código. Opciones según el bug:

| Bug | Workaround para el jugador |
|---|---|
| No puede scorear en la app | Scorecard de papel. Tú ingresas scores después por admin. |
| No carga su ronda | Dale el código a mano, que otro jugador del grupo lo scoree |
| Leaderboard espectador no actualiza | Refrescar manualmente, o compartir URL alternativa |
| Se cierra sesión constantemente | Recomendar modo navegador (no PWA) mientras investigas |
| Error al finalizar ronda | Tú finalizas por admin desde `/admin/ronda-libre/<id>` |

## Paso 3 — Investigación paralela (mientras el torneo sigue)

1. Abrir Sentry, filtrar por hora del evento
2. Buscar el `user_id` del jugador en logs (si lo sabes)
3. Si el bug está en código reciente → considerar revert (ver `incident-deploy-broken.md`)

## Paso 4 — Fix después del torneo

Salvo que el bug sea trivial (1 línea, test obvio), **NO pushear durante el torneo**.

Razón: un push implica deploy, que implica recompilar, que implica potencial de romper OTRA COSA durante el torneo. El workaround del Paso 2 es suficiente durante las 4-6h del torneo.

Después:
1. Branch `fix/bug-<descripcion>`
2. Reproducir localmente con los datos del evento
3. Escribir test canario que detecte el bug
4. Fix
5. Pre-push completo (tsc + test + build)
6. PR + merge + deploy
7. Verificar con el jugador que reportó

## Paso 5 — Agradecer al jugador

Literalmente. Un jugador que reporta un bug está haciendo trabajo de QA. Agradecerle aumenta la probabilidad de que reporte el próximo.

Opcional: darle algo (suscripción premium cuando exista, etc.).

## Paso 6 — Post-mortem en SPRINT_LOG

Entrada obligatoria con:
- Fecha + torneo
- Descripción del bug
- Qué workaround se usó
- Cuál fue la causa raíz
- Qué cambió para que no vuelva
- Si se agregó test canario

## Regla de oro

**Los bugs reportados en campo son P0. Siempre.**

Un bug que no se reportó porque el jugador no volvió a abrir la app → ese es el verdadero enemigo, y es invisible. Cada reporte que recibís es oro.
