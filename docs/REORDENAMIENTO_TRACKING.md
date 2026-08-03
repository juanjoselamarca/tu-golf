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

### Concepto "¿hay puntajes para mostrar?" → `hasPlayData()` en `src/golf/leaderboard/board-rules.ts`

| Sitio | Estado |
|---|---|
| `src/golf/leaderboard/board-rules.ts` (fuente canónica) | ✅ creado (29-jul, board individual unificado) |
| `torneo/[slug]/en-vivo/formats/IndividualLeaderboard.tsx` | ✅ migrado (29-jul) |
| `torneo/[slug]/tv/page.tsx` | ✅ migrado (29-jul) |
| `components/TournamentTabs.tsx` — 6 copias inline (`p.holes > 0` / `=== 0`) + la columna Pos, que mostraba `T1` para el field entero con el torneo recién abierto | ✅ migrado (29-jul, findings I2 y F3 del code-reviewer) |
| `[codigo]/page.tsx` — 3 definiciones inconsistentes (`leaderboard[0]` vs `leaderboard.some(...)`) | ⏳ pendiente — migrar a `hasPlayData` al tocar resultados de ronda libre |

### Concepto "nombre del jugador de torneo" → `resolveLegacyPlayerName()` en `src/golf/leaderboard/board-rules.ts`

Antes el mismo invitado se llamaba distinto en cada pantalla: `"Sin nombre"` en /en-vivo,
`"Jugador"` en el board de la landing y su `player_name` real en el TV.

| Sitio | Estado |
|---|---|
| `src/golf/leaderboard/board-rules.ts` (fuente canónica) | ✅ creado (29-jul) |
| `build-from-legacy.ts` (entries + `noRound` + gwiInputs) | ✅ migrado (29-jul) |
| `torneo/[slug]/en-vivo/page.tsx`, `torneo/[slug]/tv/page.tsx` | ✅ migrado — consumen el motor, ya no resuelven nombre |

### Concepto "¿contra qué par se mide *a par*?" → `parOfPlayedHoles()` en `src/golf/leaderboard/board-rules.ts`

P0 cerrado el 29-jul: las tres pantallas medían contra el par de la vuelta COMPLETA
mientras la vuelta estaba a medias, así que el jugador con menos hoyos encabezaba el
leaderboard (−60 con 3 hoyos en 18h). El orden tenía el mismo defecto: `rankEntries`
ordenaba por golpes crudos, no por score a par.

| Sitio | Estado |
|---|---|
| `src/golf/leaderboard/board-rules.ts` (fuente canónica) | ✅ creado (29-jul) |
| `build-from-legacy.ts` (`parPlayed`, neto derivado de `hole_scores`) | ✅ migrado (29-jul) |
| `build-from-ronda-libre.ts` (ya lo calculaba; ahora lo expone en el entry) | ✅ migrado (29-jul) |
| `rank-entries.ts` (`vsParFor` + orden + countback sobre score a par) | ✅ migrado (29-jul) |

**Decisión asociada — el countback es sólo para tarjetas terminadas.** Pasar el orden a
"score a par" tuvo un efecto de segundo orden que cazó el code-reviewer: los empates
pasaron de raros (requerían colisión exacta de golpes) a ser la norma (enteros chicos
alrededor de 0), y el countback empezó a correr sobre todo el field. Como
`compareCountback` suma los hoyos sin jugar como **0 golpes**, con `lower_wins` el
desempate se lo llevaba siempre el que menos había jugado — el P0 reaparecía por otra
puerta — y además el 100% del field quedaba con "(empate)" pegado al nombre.
`rankEntries` ahora aplica countback **sólo** dentro de grupos donde todas las tarjetas
están completas; los empates en vuelta se ordenan por hoyos jugados (desc) y no se anotan.

**Sub-decisión — el gate mira la TARJETA, no el contador.** `cardIsComplete` cuenta los
hoyos con score en `entry.scores` (la tarjeta que el countback efectivamente lee) y no
`holesPlayed`. No son lo mismo: una ronda con sólo los totales cargados suma al contador
pero llega con la tarjeta vacía, y esos nulls se leen como ceros que barren todos los
segmentos — el jugador sin tarjeta le ganaba a una vuelta real del mismo score. Además el
orden desempata por hoyos jugados y, si persiste, por hoyos en tarjeta.

**Follow-ups conocidos del countback (no bloquean, anotados para no re-diagnosticarlos):**

| Caso | Estado |
|---|---|
| `holeCount` se deriva de `max(scores.length)` en vez del `ctx.totalHoyos` autoritativo. Una ronda de 9h guardada en los hoyos 10-18 daría `holeCount=18` y el countback no dispararía. **No existe hoy en prod** (los torneos de 9h usan hoyos 1-9). | ⏳ latente — arreglar pasando `totalHoyos` a `rankEntries` |
| Multi-ronda de largos distintos (18 + 9): `cardIsComplete` mira la última tarjeta, así que funciona; pero el `holeCount` global sigue saliendo del máximo. | ⏳ latente — mismo fix |
| Una sola tarjeta incompleta en un grupo empatado desactiva el countback para todo el grupo. Correcto mientras se juega; al cierre de un torneo, un hoyo faltante por hueco de data deja el podio sin resolver. | ⏳ pendiente — decidir si al cerrar el torneo se fuerza el countback |
| `Player.today` muestra el score NETO también en el tab GROSS (`applyToday` lo pisa en `playersByGross`). Preexistente, se renderiza en `LeaderboardTable.tsx`. | ⏳ pendiente — fuera del alcance de este PR |

**Decisión asociada — `PAR_FALLBACK`.** El par asumido para un hoyo ausente del catálogo
vive una sola vez en `board-rules.ts` y lo consume también `buildFallbackCourseHoles`.
NO se reusa `STANDARD_PARS` de `golf/coach/hole-pars`: es un layout par-72 concreto (su
propio doc avisa que miente en canchas par 70/71, varias de las nuestras) y no cubre los
hoyos >18 de canchas multi-recorrido. Conceptos parecidos, no el mismo.

### Concepto "¿es stableford?" → `isStablefordFormat()` en `src/golf/formats`

Detectado el 30-jul por el code-reviewer. El predicado `formato_juego === 'stableford'`
está reescrito inline en ~10 archivos productivos (`TeamLeaderboard`,
`compute-tournament-results`, `lib/ronda/leaderboard`, `share-card`, `api/en-vivo`, los
dos `IndividualLeaderboard`, entre otros). Es el mismo smell que `TEAM_FORMAT_KEYS`
resolvió para los formatos por equipo: corresponde un `isStablefordFormat()` en
`src/golf/formats`, derivado del registry.

NO se migró en el PR del board individual a propósito: habría ensanchado el blast radius
de un PR de display hacia el motor de share cards y el de equipos. Migrar al tocar cada
flujo.

| Sitio | Estado |
|---|---|
| `src/golf/formats` — `isStablefordFormat()` | ✅ creada (2-ago, refactor del scorer del organizador) |
| Scorer del organizador (`useScoreEntry` + `ScorecardPanel`; además los puntos salen de `puntosStablefordHoyo`, no de la fórmula inline) | ✅ migrado (2-ago) |
| ~8 call-sites productivos restantes con el predicado inline (`TeamLeaderboard`, `compute-tournament-results`, `lib/ronda/leaderboard`, `share-card`, `api/en-vivo`, los dos `IndividualLeaderboard`, …) | ⏳ pendiente — migrar al tocar cada flujo |

### P0 CERRADO (30-jul) — el board legacy usaba `handicap_at_registration` crudo como course handicap

Detectado el 29-jul al verificar el board unificado contra la data real del gate.
`build-from-legacy.ts` tomaba `handicap_at_registration` tal cual para repartir golpes,
sin ajuste a 9h ni por slope del tee — mientras la tarjeta del organizador ya repartía el
course handicap WHS (PR #289). Las dos pantallas del mismo torneo mostraban netos
distintos; en una vuelta de 9 hoyos el board daba **el doble** de golpes.

Evidencia (Las Brisas Norte-Sur, par 72 / slope 113 / CR 71.9, vuelta de 9h): índice 12 →
el board repartía **12 golpes**; el course handicap 9h correcto es **6**
(`round(12/2 × 113/113 + (35.95 − 36))`).

Cerrado en `fix/board-publico-hcp-9h-claude` (va DESPUÉS de #289): el board llama a
`resolveScoringCourseHcp` — la MISMA función que el scorer — con el contexto que arma
`fetchLegacyHcpContext` (fuente única para `/torneo`, `/tv` y `/en-vivo`). En **el board
individual legacy** el gate `hcp_calc_mode` se respeta: los torneos que no son `'whs'`
siguen con el índice crudo. El ÍNDICE que se MUESTRA (`hcpDisplay`) no se toca: sigue
siendo el de inscripción.

| Sitio | Estado |
|---|---|
| `build-from-legacy.ts` (golpes vía `resolveScoringCourseHcp`, display vía índice) | ✅ migrado (30-jul) |
| `leaderboard.ts::fetchLegacyHcpContext` (canónica del contexto de handicap del board) | ✅ creada (30-jul) |
| `/torneo`, `/torneo/tv`, `/torneo/en-vivo` | ✅ los tres consumen la canónica |
| `COURSE_TEE_COLUMNS` en `resolve-player-tee.ts` (columnas de las que depende que board y scorer coincidan) | ✅ canónica creada — la consumen el board y `scoring/page.tsx` |
| `LEGACY_PLAYER_SELECT` compartido `leaderboard.ts` ↔ `tvBoard.ts` | ✅ una sola copia (eran dos listas byte-idénticas) |
| **El gate `hcp_calc_mode` NO se consulta en los caminos hermanos** | ⏳ **abierto** — `fetchRondaLibreJugadoresConCourseHcp` y los standings por equipo (best_ball/scramble/foursome) convierten índice → course handicap incondicionalmente, en `/torneo` y en `/en-vivo`. Deuda preexistente, no la introduce este PR. Migrar al tocar cada flujo. |
| **Catálogo: 9 de 11 canchas de 9 hoyos tienen `course_rating` de 18h** | ⏳ **P1 abierto** — `(CR − par)` infla el course handicap ~36 golpes en el scorer Y en el board (misma clase que el negativo de #289, por el otro lado). Hoy sólo apunta ahí el torneo semilla `gate-scorer-9h-individual`; ningún torneo real. Es data, no motor: se arregla en el catálogo, no acá. |

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

### Follow-ups del PR #269 (P0 scorer — Máquina de Verdad 16-jul)

Marcados por el `code-reviewer` como no-bloqueantes; se registran acá en vez de ensanchar el PR.

| Follow-up | Estado |
|---|---|
| `generarOrdenHoyos`: el default `courseHoles=18` es correcto para el 100% de los inputs alcanzables hoy (multi-loop siempre juega 18h por combos de 2 loops; single-course 9h tiene shotgun deshabilitado → `hoyoInicio ∈ {1,10}`). Si alguna vez se habilita jugar un loop único de ≤9 hoyos con shotgun (start>9), el caller DEBE pasar el `courseHoles` real. | ⏳ latente (documentado en el JSDoc + test `courseHoles` explícito). No reachable hoy |
| Match play sobre un **back-9** de cancha single 18h: `calcularMatchPlay` hace `slice(0, totalHoles)` que toma los 9 hoyos de MENOR número (front-9), no los realmente jugados (10-18). Pregunta de correctitud PREVIA al PR #269 (no la introdujo). | ⏳ pendiente — probar en la re-corrida de la Máquina de Verdad (P0 scorer). Data prod: 1 sola ronda match_play 9h y es GROSS, no se dispara |
| Ronda `OI1KQY` (única back-9 de 9h en prod, test de Juanjo): scores guardados bajo hoyos 1-9; con el fix el scorer muestra 10-18. Re-mapeo 1-9→10-18 pendiente de decisión de PM (su data, reversible). | ⏳ decisión PM |

### Cabecera de torneo canónica — `TorneoHeader` (feat 21-jul)

`src/components/torneo/TorneoHeader.tsx` = fuente única de la identidad visual del torneo
(nombre + cancha + hoyos + formato + estado), un componente con dos estados (navy broadcast
en vivo / editorial claro estático — decisión PM). Consume `tournament-status.ts` (estado) y
`src/golf/formats` (formato). Migración de call-sites, rastreada (no se ensancha el blast
radius de golpe hacia las páginas gigantes):

| Call-site | Estado |
|---|---|
| `src/app/torneo/[slug]/en-vivo/LiveHeader.tsx` | ✅ cableado — elimina su maqueta propia + `FORMAT_LABEL` hardcodeado (duplicaba `src/golf/formats`) |
| `src/app/torneo/[slug]/page.tsx` (cabecera serif + pill dorada + wordmark "Golfers +" redundante) | ⏳ pendiente — migrar al tocar el flujo del torneo público |
| `src/app/organizador/[slug]/scoring/page.tsx` (bloque navy propio, hoy `components/ScoringHeader.tsx`) | ⏳ pendiente — el refactor 2-ago lo aisló en su componente, pero NO lo migró: lleva controles operativos (EN VIVO, Rn/N, guardando, deshacer) que `TorneoHeader` no modela, y el swap visual es decisión de diseño del hilo principal |
| `src/app/ronda-libre/[codigo]` en-vivo (título genérico "Marcador en vivo", no el nombre del torneo) | ⏳ pendiente — migrar al tocar ronda-libre |

---

## Corrección de #289 — la escala se decide por la RELACIÓN rating↔par (PR #293, 2-ago-2026)

#289 cambió la señal de escala a "el par decide, el CR obedece". Eso rompió las
9 filas del catálogo que guardan `par_total = 36` con `course_rating = 72`: no se
partía el rating y quedaba `(72 − 36)` = **+36 golpes** en cada course handicap
de 9 hoyos. En el gate, un índice 30 recibía 52 golpes en vez de 16, y como el
reparto por hoyo topea en 3 los cuatro jugadores terminaban con 27 golpes
iguales, un plus incluido.

Esas 9 filas NO son canchas de 9 hoyos: son los **loops hijos** de Rocas de
Santo Domingo, Brisas y Marbella (clubes de 27), sin tees propios.

Ahora `courseRatingEnEscalaDe9` prueba "ya viene en 9" (`|cr − par9| ≤ 6`),
después "viene en 18" (`|cr/2 − par9| ≤ 6`), y si ninguna cierra devuelve `par9`
para anular el término. Las dos ventanas no se solapan mientras `par9 > 18`
(test explícito).

| Punto | Estado |
|---|---|
| `courseRatingEnEscalaDe9` decide por relación, no por par solo | ✅ (#293) |
| `resolverCourseData` paso 0 (multi-recorrido) normaliza el rating de CADA loop antes de sumar — sumarlos crudos daba +36 con un loop y **+72 con dos**, y la UI preselecciona dos loops sola | ✅ (#293, finding bloqueante del code-reviewer) |
| Canario del catálogo: las 600+ filas de `courses` + `course_tees` pasan por la función; el conjunto "imposible" queda fijado con `toEqual` (contarlas dejaba pasar un swap) | ✅ (#293, `src/__tests__/integration/catalogo-escala-rating.test.ts`) |
| El paso 0 tomaba `parTotal` a ciegas — el único de los tres caminos. Ahora `parDeLosLoops` sólo lo acepta si viene en la MISMA escala que `parSum`; si no, manda el par de los loops. Cierra las dos direcciones: parTotal de 18 en recorrido de 9 (daba −30) y de 9 en recorrido de 18 (daba +108) | ✅ (#293) |
| La rama de fallback por tee del paso 0 no la ejercitaba ningún test — y es la que corre con el catálogo degradado (children sin rating propio). Cubierta con el caso mixto: un loop con `front_course_rating` medido de 9h y otro con `rating` de 18h, que sumados crudos daban 107.5 contra par 72 | ✅ (#293) |
| **La degradación por rating imposible es MUDA** — una cancha nueva mal cargada sirve handicaps aproximados sin avisar. Falta un check en `/api/admin/health-check` que liste los ratings que no cierran en ninguna escala. | ⏳ pendiente |
| `src/lib/data/tee-resolver.ts:148-165` es una **cuarta** derivación de "rating de 9 hoyos" (usa `front_course_rating` o `cr − back_course_rating`, y devuelve `null` si no puede — es segura, pero es otra fuente del mismo concepto) | ⏳ pendiente — converger al tocar el flujo del coach |
| `esEscalaDe18Hoyos(par) = par > 50` tiene borde en 50 exacto (un par-50 daría "es de 9"). No hay filas en 50. | ⏳ latente |
| Los tests de integración **skipean en CI** (sin service-role key), que es por lo que #289 llegó a prod con la regresión. Decisión de producto/infra: exponerlos. | ⏳ decisión de Juanjo |
| `gate-scorer-handicap.test.ts` no envuelve su carga desde prod en try/catch: un rechazo de red marca el archivo failed con los tests skipped (rojo intermitente que no dice nada). Mismo patrón ya arreglado en los otros dos. | ⏳ pendiente |

## Deuda anotada por PR #289 (handicap 9 hoyos) — 30-jul-2026

El PR cerró el bug de los course handicaps negativos en vueltas de 9 hoyos y
unificó la decisión de escala (`esEscalaDe18Hoyos` / `parEnEscalaDe9` /
`courseRatingEnEscalaDe9` / `parDeLosHoyosJugados` / `indiceDe9Hoyos` en
`src/golf/core/course-handicap.ts`). Lo que quedó FUERA de alcance, en orden de
prioridad, con el motivo:

| # | Deuda | Dónde | Por qué quedó fuera |
|---|---|---|---|
| 1 | ~~**P0 — El board público no aplica el course handicap.**~~ | `src/golf/leaderboard/build-from-legacy.ts:62` | ✅ **CERRADO (#290, 30-jul).** `courseHcpDe` resuelve con `resolveScoringCourseHcp` (misma cuenta que la tarjeta en cancha), y el par que entra a la fórmula es el de los hoyos jugados. Verificado en prod tras #293: Paty índice 30 → 16 golpes, Cacho 10 → 5, Nacho 18 → 10, Plus −2 → −1. |
| 2 | **P0 — `handicap_at_registration` carga dos conceptos distintos.** Para jugadores registrados guarda un course handicap de 18h ya resuelto; para invitados, el índice crudo. `computePlayerCourseHcp` lo trata como índice y le aplica la fórmula WHS de nuevo (doble conversión, conocida desde el 8-jun) y ahora también la mitad de 9h. | `src/app/api/torneos/[slug]/inscribirse/route.ts:44`, `.../players/route.ts:107`, `src/golf/core/compute-player-course-hcp.ts` | Arreglarlo toca el motor de INSCRIPCIÓN de torneos. CLAUDE.md: "nunca se ensancha el blast radius de un PR de display hacia el motor de creación". Se migra al tocar ese flujo (ver `project_inscripcion_unificacion`). |
| 3 | **P1 — "Qué hoyos se juegan" contestado de dos formas.** `normalizedStrokeIndexByHole` filtra por `numero <= holeCount` SIN deduplicar; `parDeLosHoyosJugados` deduplica y hace `slice`. Sobre un catálogo con filas repetidas por recorrido operan sobre conjuntos distintos. | `src/golf/core/stroke-index.ts:224` vs `src/golf/core/course-handicap.ts` | Cambiar la normalización del SI altera el reparto de golpes en TODOS los torneos, incluidos los de 18h en curso. Necesita su propio PR con canario. |
| 4 | **Datos sucios — C.G. Río Blanco.** `par_total` 35 con `rating` 55 en sus 4 tees y 0 filas en `course_holes`. Ese 55 no es válido en ninguna escala: +20 sobre el par si fuera de 9, −15 si fuera de 18. | tabla `courses` / `course_tees` | ⚠️ **Contenido desde #293**, no cerrado. El código ya no lo propaga: al no cerrar ninguna hipótesis de escala, el término `(CR − par)` se anula y un índice 12 recibe 6 golpes (antes de #293 daba 26; antes de #289, −1). Sigue siendo un handicap **aproximado** — le falta el ajuste real de rating. Cierra sólo con el CR de 9 hoyos verdadero del club. El canario `catalogo-escala-rating.test.ts` fija estas 4 filas como el conjunto conocido de ratings imposibles. |
| 5 | ~~**`scoring/page.tsx` sigue "sucio"**~~ | `src/app/organizador/[slug]/scoring/page.tsx` | ✅ CERRADO (2-ago-2026, `fix/organizador-resumen-claude`): 1007 → 219 LOC al estándar — datos en `lib/data/tournaments/scoring.ts`, lógica en `hooks/`, vista en `components/`. |

### Resumen del organizador consume el motor del board — fix 2-ago-2026

El tab "Resumen" de `/organizador/[slug]/scoring` era la CUARTA copia del concepto
"quién va mejor en este torneo" con una TERCERA definición de "terminado", y las dos
tarjetas mentían en prod: "N completos" filtraba `rounds.status === 'completed'` (la
columna sólo toma `in_progress`/`closed` — contador clavado en 0) y "Mejor Neto" leía
`rounds[0].total_net` con guard `n !== 0` (19/77 rondas de prod con la columna en 0 →
"--" con el torneo jugado).

| Sitio | Estado |
|---|---|
| `useResumenBoard` → `buildLeaderboardFromLegacy` con contexto idéntico al de `/torneo` (`fetchResumenBoardInputs` = `LEGACY_PLAYER_SELECT` + mismo filtro de status + `fetchLegacyHcpContext`) | ✅ el organizador y el público ven los MISMOS números |
| `computeResumenCards` en `src/golf/leaderboard/resumen-cards.ts` — proyecta `computeTournamentResults` (podio) + `isFinishedCard` + `hasPlayData` | ✅ creada (2-ago) — cero re-derivación |
| Tabla de jugadores del Resumen (orden, gross/neto/pts, estado) | ✅ proyecta el ranking del motor; "Completo" = `isFinishedCard` |

