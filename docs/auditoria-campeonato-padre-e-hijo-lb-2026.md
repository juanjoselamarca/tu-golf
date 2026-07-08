# Auditoría E2E — Campeonato "Padre e Hijo LB 2026"

> Caso de prueba: **24 jugadores → 12 parejas · SCRAMBLE · NETO · 9 hoyos · cancha "Norte"** (Brisas de Santo Domingo). Objetivo: que cuando este torneo se cree de verdad, el ciclo completo inscripción→cierre sea perfecto (CERO FALLOS).
>
> Fecha: 2026-07-07 · Método: recon de código con evidencia `file:line` + verificación de datos contra **prod** vía `run-sql.mjs` + confirmación del motor con tests. La ejecución E2E live con Playwright queda como paso siguiente (los hallazgos abajo se verificaron por traza de código + datos de prod, no por click-through completo).

---

## Veredicto

| Subsistema | Estado | Escala (antes → después) |
|---|---|---|
| **Motor de neto de equipos 9h** (scramble/foursome/best_ball) | ✅ **GO** — fixes en prod (#245, #246) | **4/10 → 9/10** |
| **Ciclo de torneo** (inscripción→cierre) | 🔴 **NO-GO** hasta cerrar el P0 de congelado | **5/10 → objetivo 9/10** |

**Go/No-Go global: NO-GO** para correr el campeonato real hoy. El neto ya es correcto, pero **un torneo cerrado NO queda congelado** (P0-1) y **el "cupo máximo" del wizard no se respeta** (P1-1). Con esos dos cerrados + desempate de equipos, el ciclo pasa a GO.

---

## Seguridad de prod

En prod existen **3 torneos reales "Padre e Hijo"** que NO se deben tocar:

| Nombre | slug | status |
|---|---|---|
| COPA LB PADRE E HIJO 2026 | `copa-lb-padre-e-hijo-2026-mq6477ju` | draft |
| Padre e Hijo 2026 | `padre-e-hijo-2026-mpo9d6vm` | draft |
| LB OPEN 2026 PADRE E HIJO | `lb-open-2026-padre-e-hijo-mpleeet7` | in_progress |

Todos son scramble·9h. Cualquier caso de prueba debe usar slug único `qa-padre-hijo-<timestamp>` y limpieza verificada al final.

---

## Cancha "Norte" — dónde sale el CR/slope 9h y por qué la normalización de SI es necesaria

Parent 27h: **Club de Golf Brisas de Santo Domingo** (`61f27ef3-…`). Tiene 3 children 9h y varios combos 18h:

| Recorrido | course_id | tipo | CR / slope | SI (por hoyo) |
|---|---|---|---|---|
| **Child 9h "Norte"** | `78c9b8d2-0608-46fa-8085-c7a652601ce8` | 9h | 72.0 / 120 ⚠️ | `8,7,2,6,5,1,9,4,3` — **permutación limpia 1..9** |
| Child 9h "Este" | `e20b950c-…` | 9h | 72.0 / 120 ⚠️ | `8,5,7,1,2,4,9,6,3` (limpio) |
| Child 9h "Sur" | `7bb13daa-…` | 9h | 72.0 / 120 ⚠️ | `8,1,3,6,5,7,9,2,4` (limpio) |
| Combo 18h "Norte-Este / Norte-Sur (VARONES)" | `27936b1a-…` / `cc49e08f-…` | 18h | 72.0 / 113 | **front-9 = `15,13,3,11,9,1,17,7,5`** (4 hoyos con SI>9) |

**Dos hallazgos de datos:**

1. **CR72 / slope120 en los children 9h es un placeholder** (un CR de 72 es escala 18h; un 9h ronda ~36). El child 9h **no tiene tee 9h propio con `front_course_rating`**, así que `resolverCourseData` cae a la aproximación `courseRating/2` (`course-handicap.ts:251-259`). El CR/slope 9h **NO** debe leerse del placeholder crudo: sale de la rama `is9Hole` (front-9 del tee, o CR/2). Esto ya está correcto en el motor; documentado para que nadie "arregle" el placeholder a mano.

2. **La normalización de SI (#244/#245/#246) es genuinamente necesaria para este campeonato**, según cómo se elija la cancha:
   - Si el torneo usa el **child 9h "Norte"** → SI ya limpio 1..9 (la migración `20260707_normalize_stroke_index` normalizó el catálogo). Sin bug de catálogo.
   - Si el torneo usa un **combo 18h "Norte" jugado a 9 hoyos** (front-9) → SI = `15,13,3,11,9,1,17,7,5`, **4 hoyos con SI>9** → sin la normalización del motor, un course handicap 9h de N reparte **menos** golpes que N (los que caen en hoyos con SI>9 se "pierden"). El `courseSnapshot` congela justo esos valores al crear la ronda. **Aquí es donde #245/#246 salvan el neto.**

   → Recomendación operativa: **crear el campeonato con el child 9h "Norte"** (SI limpio + par-9 correcto), no con un combo 18h. Igual el motor ya cubre ambos casos.

---

## Tabla por etapa del ciclo

| # | Etapa | Camino en el código | Estado | Hallazgo |
|---|---|---|---|---|
| 1 | Inscripción self-service | `api/torneos/[slug]/inscribirse/route.ts` → `lib/data/tournaments/joinFlow.ts` | 🟡 | Solo inscribe en `status='open'`. Doble inscripción bloqueada (409 + `UNIQUE(tournament_id,user_id)`). **Sin cap de jugadores** (P1-1). |
| 2 | Alta por organizador | `organizador/[slug]/jugadores/components/InscribirPlayerForm.tsx` | ✅ | Soporta invitados (nombre+hcp). OK. |
| 3 | Armado de parejas | `tournament_groups` + `tournament_group_players` (el grupo = el equipo) | ✅ | 12 grupos de 2. Bloqueo previo por tamaño en `useTournamentLifecycle:170-194`. |
| 4 | Tees | `tournaments.tees` / por jugador | 🟡 | Verificar tee por jugador → slope/CR correcto (transversal, no específico de este flujo). |
| 5 | Arranque (start) | `useTournamentLifecycle.handleStartTournament:138-366` | 🟡 | `update status='in_progress'` **directo desde el cliente** (sin validación server-side; depende de RLS). Materializa `rondas_libres`/`ronda_equipos`. |
| 6 | Scoring en vivo (equipo) | `ronda-libre/[codigo]/score-grupo` → RPC `upsert_ronda_equipos_scores` | 🟡 | La RPC solo valida `rondas_libres.estado='en_curso'`; **no conoce el torneo** (raíz del P0-1). |
| 7 | Board neto | `torneo/[slug]/en-vivo/page.tsx` + `page.tsx` → `computeScrambleStandings` (`team-standings.ts`) | ✅ | Neto 9h correcto tras #245. Board = motor canónico. |
| 8 | Resultados / share | `torneo/[slug]/page.tsx:180-227` → `TournamentResults` + `ShareResultsButton` | 🟡 | `TournamentResults` muestra podio **individual** aunque el torneo sea por equipos (P2-2). |
| 9 | Cierre | `useTournamentLifecycle.handleCloseTournament:368-384` | 🔴 | **Solo hace `update status='closed'`. NO cierra las `rounds` ni finaliza `rondas_libres` → el torneo NO queda congelado (P0-1).** |

---

## Hallazgos rankeados

### 🔴 P0-1 — Un torneo cerrado NO queda congelado (scores de equipo editables post-cierre) · CONFIRMADO
- **Evidencia:** `handleCloseTournament` (`useTournamentLifecycle.ts:368-375`) solo hace `tournaments.update({status:'closed'})`. **Nunca** pone `rounds.status='closed'` ni `rondas_libres.estado='finalizada'`. El scoring de equipo va por la RPC `upsert_ronda_equipos_scores` (`migrations/20260522_…rpc.sql:32-34`), que **solo** bloquea con `estado='finalizada'`. Resultado: tras cerrar el torneo, cualquier scorer sigue editando scores de scramble/foursome/best_ball desde `/ronda-libre/[codigo]/score-grupo` (que solo bloquea con `estado==='finalizada'`, `score-grupo/page.tsx:161`).
- **Asimetría:** el scoring **individual** sí se bloquea (el route `/api/game` valida `tournament.status ∉ ['active','in_progress']`, `route.ts:60-63`). El de **equipos** no consulta el torneo → queda abierto. Un campeonato scramble es 100% equipos → 100% editable tras "cerrar".
- **Por qué es P0:** viola CERO FALLOS. "Resultados definitivos" que cambian tras el cierre = pérdida de confianza irreversible en torneo real.
- **Fix propuesto (permanente, no parche):** al cerrar el torneo, `handleCloseTournament` debe finalizar **atómicamente** todas sus rondas: `rounds.status='closed'` **y** `rondas_libres.estado='finalizada'` para las materializadas del torneo. Idealmente vía RPC `close_tournament(tournament_id)` `security definer` que haga las 3 escrituras en transacción y valide organizador server-side (cierra también la dependencia 100%-RLS del punto 5). Test: cerrar → intentar `upsert_ronda_equipos_scores` → debe fallar `RONDA_FINALIZED`.

### 🔴 P1-1 — El "cupo máximo" del wizard no se respeta (inscripción ilimitada) · CONFIRMADO
- **Evidencia:** `max_players` existe solo en el draft (`lib/draft/schema.ts:64`, UI `InscripcionSection.tsx:109-112`). **Ninguna migración lo persiste en `tournaments`** y `joinFlow.registerPlayerAndRound` nunca cuenta inscritos. La inscripción #25 (y #100) tiene éxito con cap 24.
- **Por qué importa:** el organizador configura "24 cupos" y la app no lo hace cumplir → parejas de más, caos el día del torneo.
- **Fix (EN PROD):** `max_players` persistido (migración + `mapTournamentForInsert`) y validado en `registerPlayerAndRound` (409 `tournament_full`) — cubre el flujo público (#25 > 24). **Follow-up abierto:** el alta manual por organizador (`usePlayers.ts` `inscribirPlayer`/`inscribirGuest`) inserta directo sin chequear el cupo → el organizador puede pasarse del tope. Decisión de producto: override intencional (con warning suave) vs. enforce. Pendiente + reflejar "cupos llenos" en la UI de `unirse`.

### 🟠 P2-1 — Board de equipos sin desempate (empate de neto → orden arbitrario) · CONFIRMADO
- **Evidencia:** `ordenarEquiposScramble` (`scramble.ts:208-218`) ordena solo por `scorePrimarioScramble`; en empate deja orden de entrada (sort estable). **No aplica `tournaments.tiebreak_rules`** (`back_9/6/3`), que sí existe para el path individual (`rank-entries.ts:85`).
- **Fix:** aplicar el mismo desempate USGA (back-9/6/3/último-hoyo por SI) en `ordenarEquipos*`, leyendo `tiebreak_rules`. Concepto único compartido con el path individual.

### 🟠 P2-2 — Resultados del torneo muestran podio individual en torneos por equipos · A VERIFICAR
- **Evidencia:** `TournamentResults.tsx:12-45` renderiza 1°/2° gross/neto **individual**. En un torneo por equipos el "ganador" mostrado puede no ser la pareja campeona del board.
- **Fix:** cuando el torneo es por equipos, mostrar el podio de **parejas** (del mismo `computeScrambleStandings` del board), no el individual.

### 🟡 P3-1 — start/close dependen 100% de RLS del cliente (sin validación server-side)
- `handleStartTournament`/`handleCloseTournament` hacen `update` directo desde el cliente; a diferencia de open/revert/cancel que pasan por `/api/game` con validación de organizador. Se cierra junto con el fix P0-1 (RPC `close_tournament` server-side).

---

## Edge cases obligatorios — resultado

| # | Caso | Resultado | Evidencia |
|---|---|---|---|
| a | Inscripción #25 con cap 24 | 🔴 **Falla**: no hay cap, la #25 se inscribe | P1-1 (`joinFlow` no cuenta inscritos) |
| b | Doble inscripción del mismo user | ✅ **Bloqueada** (409 + `UNIQUE`) | `inscribirse/route.ts:20-24`, `001:88` |
| c | 23 jugadores → pareja impar / `sorted[1]` undefined | ✅ **No crashea + bloqueo previo** | `scramble.ts:82-86` maneja `length===1`; `useTournamentLifecycle:170-194` bloquea el inicio con equipos fuera de rango |
| d | Empate de neto entre 2 parejas + desempate | 🟠 **Sin desempate** (orden arbitrario) | P2-1 (`scramble.ts:208-218`) |
| e | Editar score DESPUÉS de cerrar | 🔴 **NO bloqueado en equipos** | P0-1 (RPC solo mira `estado='finalizada'`) |
| f | RLS: no-organizador cierra / ve board en draft | ✅ **Bloqueado** | `UPDATE USING(auth.uid()=organizer_id)` (`001:261-263`); `draft` fuera del SELECT público (`001:249-251`) → `notFound()`. Nota: la policy UPDATE no tiene `WITH CHECK` (riesgo menor de reasignar `organizer_id`). |

Nota de método: b/c/f verificados por traza de código + esquema RLS; a/d/e confirmados por análisis de camino. La ejecución live con Playwright + creds E2E (crear `qa-padre-hijo-<ts>`, ciclo completo, limpieza) es el paso siguiente para confirmación empírica de a/e.

---

## Estado del motor de neto (contexto)

Los 3 formatos de equipo ya reparten el neto 9h correctamente sobre SI 18h-impar / corrupto:

- **scramble / foursome** — #245 (`normalizedStrokeIndexByHole` + `roundHoles` en `calcularScramble`/`calcularFoursome`).
- **best_ball** — #246 (mismo patrón en `calcularBestBall` + scorer `useTeamScorecard` + card + hints de `score-grupo`). NO re-divide el handicap (ya viene 9h).
- Canario: `team-standings.test.ts` invariante `Σgolpes == courseHandicap9h` con SI reales de Norte + paridad board≡scorer.

Residual (ruta **individual**, no equipo): call-sites de SI crudo en `torneo/[slug]/score/page.tsx`, `useScoreboardCalc`, `api/gwi/*`, `build-from-*` → rastreado en `docs/REORDENAMIENTO_TRACKING.md`.

---

## Próximos pasos (orden)

1. **Cerrar P0-1** (congelado al cerrar) — RPC `close_tournament` transaccional + tests. **Bloqueante para GO.**
2. **Cerrar P1-1** (cap de jugadores) — persistir + validar `max_players`.
3. **P2-1** desempate de equipos + **P2-2** podio de parejas.
4. **E2E live** con Playwright (slug `qa-padre-hijo-<ts>`) confirmando a/e empíricamente + limpieza.
