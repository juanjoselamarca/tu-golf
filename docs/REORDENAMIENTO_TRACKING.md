# Tracking del reordenamiento — Regla "El que toca, ordena"

**Vigente desde:** 24-may-2026
**Referencia:** `CLAUDE.md` sección "REGLA OPERATIVA"
**Informe:** `docs/INFORME_CTO_2026-05-22.md`

---

## Cómo se usa este archivo

Cada vez que un agente refactorice un archivo "sucio", actualiza este tracking:
- Marca el archivo con ✅ + fecha + PR
- Anota LOC antes / LOC después
- Si el archivo no estaba en la lista pero ahora aplica (creció >600), agregar fila

Al iniciar cada sesión, agente principal revisa este archivo. Si hay items >60 días sin tocar, propone refactor proactivo aunque no haya pedido pendiente.

---

## Archivos productivos >1000 LOC (snapshot 22-may-2026)

| # | Archivo | LOC antes | LOC después | Estado | PR | Fecha |
|---|---|---|---|---|---|---|
| 1 | `src/app/ronda-libre/nueva/page.tsx` | 2118 | — | ⏳ Pendiente | — | — |
| 2 | `src/app/ronda-libre/[codigo]/page.tsx` | 2038 | 275 | ✅ Hecho | `3267d66` | 17-18 jun |
| 3 | `src/app/perfil/historial/page.tsx` | 1408 | 54 | ✅ Hecho | PR #75 (hooks/components) + RSC jul-2026 (Server Component, capa `lib/data/historial.ts`, golf en `src/golf/stats/historial.ts`) | 28 may / 15 jul |
| 4 | `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | 1305 | — | ⏳ Pendiente | — | — |
| 5 | `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx` | 1112 | — | ⏳ Pendiente | — | — |
| 6 | `src/components/import/ImportGuide.tsx` | 1077 | — | ⏳ Pendiente | — | — |
| 7 | `src/app/admin/golf-ops/page.tsx` | 1033 | — | ⏳ Pendiente | — | — |
| 8 | `src/app/ronda-libre/[codigo]/score/page.tsx` | 1951 | 1025 | ✅ Hecho | `e98e3e3` | 14-15 may |
| 9 | `src/components/CourseSelector.tsx` | 1018 | — | ⏳ Pendiente | — | — |

---

## API routes monstruo (>500 LOC)

| # | Archivo | LOC antes | LOC después | Estado | PR | Fecha |
|---|---|---|---|---|---|---|
| 1 | `src/app/api/import/screenshot/route.ts` | 767 | — | ⏳ Pendiente | — | — |
| 2 | `src/app/api/admin/health-check/route.ts` | 600 | — | ⏳ Pendiente | — | — |
| 3 | `src/app/api/import/garmin-zip/route.ts` | 540 | — | ⏳ Pendiente | — | — |
| 4 | `src/app/api/inbox/webhook/route.ts` | 505 | — | ⏳ Pendiente | — | — |

---

## Dominio en `src/lib/` por mover a `src/golf/`

| # | Item | Destino | Estado | PR | Fecha |
|---|---|---|---|---|---|
| 1 | `src/lib/coach/` (directorio vacío) | Borrar | ⏳ Pendiente (ola 1) | — | — |
| 2 | `src/lib/scoring.ts` (shim) | Borrar + migrar imports | ⏳ Pendiente (ola 1) | — | — |
| 3 | `src/lib/ronda/` | `src/golf/ronda/` | ⏳ Pendiente | — | — |
| 4 | `src/lib/mi-golf/` | `src/golf/mi-golf/` o `src/golf/stats/` | ⏳ Pendiente | — | — |
| 5 | `src/lib/cpi.ts` | `src/golf/stats/cpi.ts` | ⏳ Pendiente | — | — |
| 6 | `src/lib/share-card.ts` | `src/golf/share/share-card.ts` | ⏳ Pendiente | — | — |
| 7 | `src/lib/gwi.ts` | `src/golf/stats/gwi.ts` | ⏳ Pendiente | — | — |
| 8 | `src/lib/course-matching.ts` | `src/golf/courses/matching.ts` | ⏳ Pendiente | — | — |
| 9 | `src/lib/courses.ts` | `src/golf/courses/api.ts` | ⏳ Pendiente | — | — |
| 10 | `src/lib/course-types.ts` | `src/golf/courses/types.ts` | ⏳ Pendiente | — | — |
| 11 | `src/lib/garmin-colors.ts` | `src/golf/core/colors.ts` o `src/golf/stats/` | ⏳ Pendiente | — | — |
| 12 | `src/lib/score-colors.ts` | `src/golf/core/colors.ts` | ⏳ Pendiente | — | — |
| 13 | `src/lib/indice-golfers.ts` | `src/golf/stats/indice.ts` | ⏳ Pendiente | — | — |

---

## Capa de datos (`src/lib/data/`)

Hoy: 41 archivos en `src/app/` (fuera de `api/`) hacen `supabase.from(...)` directo.

Meta: <10 archivos. Resto vía funciones tipadas en `src/lib/data/<dominio>.ts`.

| Archivo de UI con acceso directo | Migrado a `lib/data/` | Fecha |
|---|---|---|
| (lista completa se llena cuando arranque la ola 4) | | |

---

## Observabilidad — migración `console.*` → `captureError`/`logger`

Hoy: 465 `console.*` en 66 archivos productivos.
Meta: <50 ocurrencias.

Cada vez que se toque un archivo con `console.*`, se migra a `captureError(err, 'contexto.operacion', {meta})` o al logger correspondiente.

---

## Métricas globales — escala 1-10

Actualizar al cierre de cada PR de refactor:

| Fecha | Archivos >1000 LOC | Archivos >600 LOC | Endpoints >500 LOC | UI con supabase directo | console.* | Escala global |
|---|---|---|---|---|---|---|
| 22-may-2026 (baseline) | 9 | ~20 | 4 | 41 | 465 | 5-6/10 |

Meta post-reordenamiento: **8/10** (nivel The Grint / V-Par).

---

## "Un concepto, una fuente" — duplicaciones de concepto (regla 22-jun-2026)

Cada concepto de dominio vive en UN solo lugar canónico. Lista de duplicaciones detectadas y su estado.

### Concepto "formato por equipos" → `TEAM_FORMAT_KEYS` / `isTeamFormat()` en `src/golf/formats`

| Sitio | Estado |
|---|---|
| `src/golf/formats/index.ts` (fuente canónica + `SHARED_BALL_FORMAT_KEYS`) | ✅ creado (22-jun) |
| `[codigo]/page.tsx`, `[codigo]/layout.tsx`, `score/hooks/useRondaScoreData.ts`, `score-grupo/page.tsx`, `nueva/page.tsx` | ✅ migrado |
| `organizador/[slug]/jugadores/types.ts`, `organizador/nuevo/sections/EquiposSection.tsx` | ✅ migrado |
| `lib/data/ronda-libre.ts`, `lib/data/ronda-metadata.ts`, `lib/data/tournaments/teamRounds.ts`, `lib/ronda/share.ts`, `lib/ronda/team-ranking.ts`, `lib/share-card.ts` | ✅ migrado |
| `api/ronda-libre/create/route.ts` | ✅ migrado |
| `torneo/[slug]/en-vivo/LiveView.tsx` (render path del torneo en vivo) | ✅ migrado (22-jun, cerró finding del code-reviewer) |

### Concepto "lista completa de formatos válidos" → `KNOWN_FORMAT_KEYS` en `src/golf/formats`

| Sitio | Estado |
|---|---|
| `api/ronda-libre/create/route.ts` (`LATAM_FORMATOS`) | ⏳ pendiente — write-path crítico, migrar al tocar el flujo de creación |
| `api/torneos/create/route.ts` (`FORMATOS`) | ⏳ pendiente — write-path crítico, migrar al tocar el flujo de creación |

### Concepto "¿hay puntajes para mostrar?" (predicado de gating en pantalla de resultados)

| Sitio | Estado |
|---|---|
| `[codigo]/page.tsx` — 3 definiciones inconsistentes (`leaderboard[0]` vs `leaderboard.some(...)`) | ⏳ pendiente — unificar en un `hasPlayData` único (PR siguiente, resultados) |

### Concepto "par de un hoyo con fallback estándar" → `STANDARD_PARS` / `parForHoleWithFallback()` en `src/golf/coach/hole-pars.ts`

| Sitio | Estado |
|---|---|
| `src/golf/coach/hole-pars.ts` (fuente canónica: `STANDARD_PARS` + `parForHoleWithFallback`) | ✅ creado (1-jul, PR #233) |
| `coach/analysis.ts`, `coach/mental-index.ts`, `coach/patterns.ts` | ✅ migrado — borradas sus copias locales de `STANDARD_PARS` |
| `coach/metrics/helpers.ts` | ✅ re-exporta la canónica (no rompe `import { STANDARD_PARS } from '@/golf/coach/metrics'`) |
| `src/golf/core/compare.ts` (fallback `par_total ?? (holes<=9?36:72)` y `?? 4` / `push(4)`) | ⏳ pendiente — **write/scoring path app-wide** (leaderboards/resultados), y usa OTRO modelo de fallback (flat-4, no el layout estándar). Migrar/reconciliar al tocar ese flujo de scoring. Gap latente conocido: un hoyo sin par da vsPar layout-aware en el motor del coach pero flat-4 en leaderboards. |

### Concepto "inscribir un jugador a un torneo" → `enrollPlayer()` en `src/lib/data/tournaments/enrollPlayer.ts`

Antes: 3 caminos insertaban en `players`+`rounds` reimplementando la lógica, y el cupo (`max_players`) se validaba SOLO en self-service. Fuente única creada (feat/cupo-inscripcion, jul-2026); política de cupo "bloquear + ampliar" (decisión PM 2026-07-09).

| Sitio | Estado |
|---|---|
| `src/lib/data/tournaments/enrollPlayer.ts` (canónica: `enrollPlayer` + `tournamentCapacity`) | ✅ creado — gate status + cupo + INSERT players/rounds en un lugar |
| `src/lib/data/tournaments/cupo.ts` (`updateMaxPlayers`, valida no-bajar-de-inscritos) | ✅ creado |
| Camino A — self-service (`joinFlow.registerPlayerAndRound`) | ✅ migrado — wrapper delgado sobre `enrollPlayer` |
| Camino B — alta registrado del organizador (`usePlayers.inscribirPlayer`) | ✅ migrado — POST `/api/torneos/[slug]/players` → `enrollPlayer` (cupo enforced) |
| Camino B — alta invitado del organizador (`usePlayers.inscribirGuest`) | ✅ migrado — mismo endpoint (cupo enforced) |
| `players.ts::inscribePlayer` (dead code, insertaba `profile_id` inexistente) | ✅ eliminado (era trampa "parece canónico") |
| `calcCourseHandicap` duplicado (18h only) en `usePlayers` | ✅ eliminado — course handicap ahora vía `resolverCourseHandicap` (fuente única 9h/18h) en el endpoint |
| **Cupo atómico** (check-then-insert, race bajo concurrencia) | ⏳ pendiente — constraint/trigger DB `count(approved)<=max_players`. Riesgo bajo a cadencia de inscripción; documentado en `enrollPlayer.tournamentCapacity`. |
| **RPC transaccional** players+rounds (hoy round es best-effort) | ⏳ pendiente — un jugador puede quedar sin `rounds` si el 2º insert falla (comportamiento preexistente, no regresión) |
| **Gate de status en camino organizador** | ⏳ decisión PM pendiente — hoy `enforceStatusGate:false` (el organizador puede inscribir en draft/open; NO se bloquea en closed/published). Definir si el organizador debe bloquearse en algún status. |
| Camino C — grupos/parejas (`useGroups` + `groups.ts::createGroup/assignPlayerToGroup` muertos) | ⏳ pendiente — no toca cupo; consolidar `useGroups` → endpoint sobre `groups.ts` al tocar ese flujo |

### Concepto "stroke index como permutación válida para repartir golpes" → `normalizeStrokeIndexMap()` en `src/golf/core/stroke-index.ts`

| Sitio | Estado |
|---|---|
| `src/golf/core/stroke-index.ts` (canónica: `normalizeStrokeIndexMap` + `isValidStrokeIndexPermutation`) | ✅ creado (7-jul, bug "net +12 Don Jorge") |
| Data catálogo: `course_holes.stroke_index` de 31 canchas rank-normalizado a 1..N | ✅ migración `20260707_normalize_stroke_index.sql` (backup en `course_holes_si_backup`) — arregla los 18h en TODOS los caminos |
| Health guard "Catálogo: stroke index válido" | ✅ anti-regresión de import |
| `src/lib/data/ronda-libre.ts` (`loadRondaLibre` → siMap) | ✅ normaliza en la fuente → leaderboard/compartir/match/notif/detalle coherentes (incl. 9h) |
| `src/lib/ronda/leaderboard.ts` (`buildLeaderboard`) | ✅ normaliza (defense-in-depth, idempotente) |
| Formatos de equipo scramble/foursome (`hole.stroke_index` crudo) | ✅ normalizan en el motor (PR #245, `normalizedStrokeIndexByHole` + `roundHoles` en `calcularScramble`/`calcularFoursome`) |
| Formato de equipo best_ball (motor board + scorer `useTeamScorecard` + `BestBallTeamCard` + hints team-visible de `score-grupo/page.tsx`) | ✅ normalizan (commit `d589a066`, misma fuente canónica; canario `team-standings.test.ts` invariante Σgolpes==CH9h) |
| Residual SI crudo en ruta INDIVIDUAL (no-equipo): `build-from-ronda-libre.ts`, `build-from-legacy.ts`, `torneo/[slug]/score/page.tsx` (L127/182/302), `score-grupo/page.tsx` (bloque `!isTeamFormat`, L1092/1094/1107), `score/hooks/useScoreboardCalc.ts`, `api/gwi/*`, `MiniLeaderboard.tsx`, `Scorecard.tsx`, `api/game/actions.ts` (`hole.stroke_index`/`si` crudo, sin `roundHoles`) | ⏳ pendiente — 18h ya correcto por la migración de catálogo; gap latente SOLO en loops de 9h de canchas 18h (front-9 con SI>9, 166 canchas). Barrer con la fuente canónica al tocar cada flujo (o en el barrido final de la capa de datos). No afecta el board/scorer de EQUIPO (ya cerrado). |

### Concepto "course_id → pares indexados por número de hoyo" → `buildCourseParMap()` en `src/golf/courses/course-par-map.ts`

| Sitio | Estado |
|---|---|
| `src/golf/courses/course-par-map.ts` (canónica: `buildCourseParMap`) | ✅ creado (9-jul, bug inbox 2268163d "los eagles no me calzan") — indexa por `numero-1`, robusto a orden de fetch |
| `src/app/api/historial/stats/route.ts` | ✅ usa la canónica (además arregla la causa raíz: paginaba `course_holes` con `.order('numero')` no-único → drops entre páginas `.range()`). Jul-2026: la lógica se movió intacta a `src/golf/stats/historial.ts` (compute) + `src/lib/data/historial.ts` (paginación determinista) — misma fuente para el route Y el RSC `/perfil/historial` |
| `src/golf/coach/detect-and-save-patterns.ts:53` (`holeParsByCourse[cid][numero-1]=par`, idéntico byte-a-byte) | ⏳ pendiente — converger al tocar el flujo del coach. Sin bug de paginación (fetch acotado por `.in('course_id',…)`) |
| `src/golf/coach/tools.ts:368` y `src/golf/coach/context.ts:217` (variante objeto 1-indexed `parsByCourse[cid][numero]=par`) | ⏳ pendiente — converger al tocar el flujo del coach. Sin bug de paginación (fetch acotado) |
