# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-04-29 | Commit: `9136fa2`

## Último deploy

- **Commit:** `9136fa2` — feat(theme): tri-state toggle Auto/Claro/Oscuro en Navbar dropdown
- **Fecha:** 2026-04-28
- **Branch:** main (743 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (45 páginas)

- `/admin/analytics`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/auth/auth-code-error`
- `/coach/onboarding`
- `/coach`
- `/coach/sesion/nueva/chat`
- `/coach/sesion/nueva`
- `/coach/sesion/[id]`
- `/dashboard`
- `/demo`
- `/demo/taiger`
- `/en-vivo`
- `/importar`
- `/indices`
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/salida`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil/historial/[id]`
- `/perfil`
- `/perfil/stats`
- `/privacidad`
- `/ranking`
- `/recuperar`
- `/reembolsos`
- `/register`
- `/ronda-libre/nueva`
- `/ronda-libre/[codigo]`
- `/ronda-libre/[codigo]/score`
- `/ronda-libre/[codigo]/score-grupo`
- `/tarjeta/[id]`
- `/terminos`
- `/torneo/[slug]`
- `/torneo/[slug]/score`
- `/torneo/[slug]/tv`
- `/torneo/[slug]/unirse`

## Documentación del proyecto

| Archivo | Contenido |
|---------|-----------|
| [SPRINT_LOG.md](./SPRINT_LOG.md) | Historial de sprints |
| [ROADMAP_COMPLETO.md](./ROADMAP_COMPLETO.md) | Sprints 9C→14 |
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Schema BD + stack |
| [TAIGER_SYSTEM_PROMPT.md](./TAIGER_SYSTEM_PROMPT.md) | Coach IA |
| [GWI_MODELO.md](./GWI_MODELO.md) | Probabilidades de ganar |
| [SQL_PENDIENTE.md](./SQL_PENDIENTE.md) | SQL a ejecutar |

## Sprint Log reciente

# SPRINT LOG — TU GOLF

> Agregar nueva entrada AL INICIO después de cada sprint

---

## Sesión 28 Abr 2026 — Cross-validation canchas + fix slope FedeGolf

**Problema**: tras la migración 026 que renombró `course_holes.yardaje_campeonato → yardaje_negras` y normalizó tees por género, quedó pendiente `course_tees.nombre`. El sync `sync-courses-unified.ts` seguía guardando los tees como singular masculino (`'negro'`), mientras la UI envía plural Chilean Spanish (`'negras'`) post-026. Resultado: la función `cargarCourseData()` hacía `ILIKE 'negras%'` que NO matcheaba con `'negro'` en BD, caía al fallback `courses.slope_rating` (que para FedeGolf es placeholder universal `113`), produciendo course handicaps subestimados (~−4 strokes) para jugadores con tee Negras en cancha FedeGolf. Impacto histórico medido: 3 jugadores con tee `negras` en rondas libres FedeGolf calcularon HCP con slope falso. 0 torneos afectados (no había torneos sobre canchas FedeGolf todavía).

**Causa raíz adicional**: `course_tees.nombre` tenía 4 capas de inconsistencias:
1. FedeGolf con `'negro'` singular vs UI `'negras'` plural
2. Manual con aliases en inglés (`'Blue'`, `'White'`, `'Red'`, `'Black'`) duplicando filas en español del mismo color (4 canchas, 11 filas duplicadas: Lomas de La Dehesa, Los Leones, Prince of Wales, Sport Francés)
3. Manual con sinónimos inconsistentes (`'campeonato'`, `'blancas'`, `'azules'`)
4. FedeGolf con capitalize inicial (`'Rojo'`, `'Blanco'`, `'Azul'`, `'Dorado'`) vs manual lowercase

**Solución**:

### Migración 030 (`supabase/migrations/030_normalize_course_tees_nombres.sql`)
- DEDUP: borra filas que tras normalizar colisionarían en `(course_id, nombre)` UNIQUE — 11 filas borradas
- RENAME simples: 5 mapeos canónicos en una pasada (case-insensitive)
  - `negro|negra|black|championship|campeonato → negras`
  - `blue|azules → azul`
  - `blanca|blancas|white → blanco`
  - `roja|rojas|red|ladies → rojo`

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
