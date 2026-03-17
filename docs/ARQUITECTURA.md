# ARQUITECTURA TU GOLF

## Stack
Next.js 14 · Supabase · Tailwind CSS · TypeScript · Vercel

## URLs
Producción: https://tu-golf.vercel.app
GitHub: github.com/juanjoselamarca/tu-golf (branch: main)
Supabase: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce

## REGLA CRÍTICA — Nombres de columnas en BD
SIEMPRE usar estos nombres exactos:
- course_holes.numero (NO hole_number)
- course_holes.stroke_index
- courses.nombre (NO name)
- courses.ciudad, courses.pais

## Tablas por función
SCORING:   hole_scores, rounds, ronda_libre_jugadores
TORNEOS:   tournaments, players, categories, flights
HISTORIAL: historical_rounds
COACHING:  player_patterns, taiger_sessions, player_psych_profile
GARMIN:    garmin_connections
TRACKING:  handicap_history
LIBRE:     rondas_libres, ronda_libre_jugadores

## Librerías propias
src/lib/scoring.ts → gross/neto/stableford
src/lib/gwi.ts → Golf Win Index probabilidades
src/constants/golf.ts → colores y labels
src/utils/supabase/errors.ts → manejo errores BD

## Sistema de Diseño
bg-deep: #070d18
bg-card: #0e1c2f
gold: #c4992a
gold-light: #e8c06a
ivory: #edeae4
gray-soft: #7a8fa8

Títulos: Playfair Display
UI: DM Sans

## Flujo tAIger
ronda completada → patterns_need_recalc = TRUE
→ POST /api/taiger/patterns → calcula patrones
→ GET /api/taiger/context → contexto completo
→ Claude API → análisis + técnica
→ guardado en taiger_sessions

## Flujo Garmin (Sprint 11)
OAuth → garmin_connections
→ Webhook → parser → historical_rounds
→ Trigger → recalcular patrones → notificación

## Regla de oro del scoring
Siempre guardar gross_score + net_score + points en BD.
El modo_juego solo afecta QUÉ SE MUESTRA, no qué se guarda.
