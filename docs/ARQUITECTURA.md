# ARQUITECTURA GOLFERS+

## Stack
Next.js 14 · Supabase · Tailwind CSS · TypeScript · Vercel

## URLs
Producción: https://golfersplus.vercel.app
GitHub: github.com/juanjoselamarca/tu-golf (branch: main)
Supabase: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce

## Motor de reglas de golf — src/golf/

Toda la lógica de golf está centralizada en `src/golf/`:

```
src/golf/
  core/         Reglas universales
    rules.ts      ModoJuego, labels, formateo vsPar
    scoring.ts    Strokes, neto, stableford, resumen de ronda
    compare.ts    Comparar rondas por vsPar (NO por gross), separar 9/18 hoyos
    colors.ts     Colores por resultado + Garmin color mapping

  formats/      Modalidades de juego (extensible)
    index.ts      Interface GolfFormat + registry
    stroke-play   Medal play (activo)
    stableford    Puntos (activo)
    (futuro: match-play, best-ball, foursome, scramble)

  stats/        Métricas e índices
    personal.ts   Stats centralizadas con vsPar
    gwi.ts        GWI™ — probabilidad de ganar en ronda activa
    cpi.ts        CPI™ — índice de rendimiento (0-100)

  courses/      Canchas
    types.ts      Course, CourseHole, CourseTee, CourseSummary
    data.ts       Queries Supabase para canchas
    matching.ts   Fuzzy matching de nombres

  coach/        tAIger+ coach IA
    prompts.ts    System prompt y session starters
    patterns.ts   Biblioteca de patrones (extensible)
    analysis.ts   Motor de análisis de rondas (extensible)
```

### Regla clave
NUNCA comparar rondas por gross absoluto. Siempre usar `vsPar()` de `core/compare.ts`.
Un 44 en 9 hoyos (par 36 = +8) NO es mejor que un 82 en 18 hoyos (par 72 = +10).

### Cómo agregar un formato nuevo
1. Crear `src/golf/formats/match-play.ts`
2. Implementar interface `GolfFormat`
3. Registrar en `FORMATS` de `formats/index.ts`

## REGLA CRÍTICA — Nombres de columnas en BD
SIEMPRE usar estos nombres exactos:
- course_holes.numero (NO hole_number)
- course_holes.stroke_index
- courses.nombre (NO name)
- courses.ciudad, courses.pais
- profiles.role (NO rol): 'player' | 'organizer' | 'admin'
- rondas_libres.estado: 'en_curso' | 'finalizada' (NUNCA 'in_progress' ni 'closed')

## Tablas por función
SCORING:   hole_scores, rounds, ronda_libre_jugadores
TORNEOS:   tournaments, players, categories, flights
HISTORIAL: historical_rounds
COACHING:  player_patterns, taiger_sessions, player_psych_profile
TRACKING:  handicap_history
LIBRE:     rondas_libres, ronda_libre_jugadores

## Sistema de Diseño
bg-deep: #070d18 | bg-card: #0e1c2f
gold/brand: #c4992a | gold-light: #c8a55a
ivory/text: #edeae4 | gray-soft: #94a8c0

Títulos: Playfair Display | UI: DM Sans | Métricas: DM Mono | Números grandes: Cormorant Garamond

## Servicios externos
- Sentry: monitoreo de errores (DSN en NEXT_PUBLIC_SENTRY_DSN)
- PostHog: analytics de comportamiento (token en NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN)
- Anthropic: tAIger+ coach IA (ANTHROPIC_API_KEY)

## Flujo tAIger
ronda completada → patterns_need_recalc = TRUE
→ POST /api/taiger/patterns → calcula patrones
→ GET /api/taiger/context → contexto completo
→ Claude API → análisis + técnica
→ guardado en taiger_sessions

## Regla de oro del scoring
Siempre guardar gross_score + net_score + points en BD.
El modo_juego solo afecta QUÉ SE MUESTRA, no qué se guarda.
