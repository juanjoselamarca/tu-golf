# Benchmarks visuales — Golfers+

Referencias visuales de competidores categorizadas por feature. **Antes de tomar decisiones de diseño en una categoría, leé los screenshots de ese subdirectorio.**

## Categorías

| Categoría | Competidores objetivo | Estado |
|---|---|---|
| `scorer/` | Garmin Golf, Arccos, GolfShot, 18Birdies | pendiente captura |
| `leaderboard/` | Augusta App, PGA Tour Live, ESPN | pendiente captura |
| `profile/` | MyScorecard, Strava, Garmin Connect | pendiente captura |
| `coach/` | Whoop, Apple Health, Garmin Coach | pendiente captura |
| `widget-pga/` | PGA Tour app, ESPN scoreboard widgets | pendiente captura |

## Política de captura on-demand

**No se capturan benchmarks especulativamente.** Se capturan cuando el primer bug visual de esa categoría llega al inbox, antes de tomar la decisión de diseño. Razón: YAGNI — capturar 50 screenshots de competidores que nunca consultamos es trabajo perdido y se desactualiza.

Cuando un bug visual entra:
1. Si la categoría tiene benchmarks recientes (<6 meses) → usar.
2. Si no tiene o están viejos → capturar 3-4 referencias con skill `browse` antes de invocar `design-shotgun`.

## Cómo capturar

```
skill: browse
target: <URL competidor>
viewport: 1080×1920 (mobile-first, matchea iPhone 14 Pro)
naming: <competidor>-<feature>-<viewport>.png
```

Ejemplos:
- `garmin-scorer-mobile.png`
- `arccos-leaderboard-desktop.png`
- `whoop-coach-mobile.png`

## Reglas de uso

- **NO copiar pixel-by-pixel.** Inspirarse, identificar patrones que funcionan, aplicarlos con nuestro twist: **minimalista premium deportivo**.
- **NO usar benchmarks viejos** sin verificar que el competidor no haya cambiado significativamente.
- **Si un competidor lo hace mal, no lo replicamos.** Los benchmarks NO son verdad absoluta — son referencia.
- Las decisiones finales se documentan en `docs/design-decisions/<fecha>-<slug>.md` con razón objetiva (no "porque Garmin lo hace así").

## Categorías adicionales

Se pueden crear subdirectorios nuevos cuando aparezcan features sin precedente. Convención: kebab-case, descriptivo (ej. `match-play-bracket/`, `coach-mental-curve/`).
