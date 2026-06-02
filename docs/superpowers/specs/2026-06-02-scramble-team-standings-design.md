# Spec: Leaderboard de equipos Scramble (v1)

**Fecha:** 2026-06-02
**Autor:** Claude (CTO)
**Estado:** aprobado (diseño), pendiente plan
**Branch:** `feat/team-scoring-v1-claude`

## Contexto

Cierra el último tramo del wizard de equipos (P0 FTUE 22-may). Tras PRs #83
(persistencia `team_config`) y #85 (organizador arma equipos vía grupo=equipo),
falta lo único que ve el jugador: **el leaderboard del torneo muestra resultados
individuales, no de equipo**, en torneos Scramble.

### Estado real auditado (2026-06-02)

El scoring de equipos está **~90% construido**. Lo que existe y funciona:

- **Motor** (`src/golf/formats/scramble.ts`): `calcularScramble`,
  `calcularHandicapScramble` (USGA: 35%/15% a 2; 20/15/10 a 3; 25/20/15/10 a 4),
  `ordenarEquiposScramble`. Con tests.
- **Carga de scores** (`src/app/ronda-libre/[codigo]/score-grupo/page.tsx`):
  para scramble/foursome esconde el scoring individual y entra **un score
  compartido por equipo**, persistido en la tabla `ronda_equipos` (FK `ronda_id`)
  vía RPC `upsert_ronda_equipos_scores`.
- **Componente UI** (`src/app/torneo/[slug]/en-vivo/formats/TeamLeaderboard.tsx`):
  tabla de equipos ordenada por `team_total`.
- **Switch de leaderboard** (`LiveView.tsx`): ya renderiza `TeamLeaderboard`
  cuando `format ∈ {best_ball, scramble, foursome}`.

### El gap (una frase)

Los server components del leaderboard **nunca conectan los grupos+scores con el
motor**:

- `src/app/torneo/[slug]/en-vivo/page.tsx:173` pasa `teams={[]}` con el comentario
  *"MVP: teams y matches quedan como [] hasta que existan datos reales en BD"*.
- `src/app/torneo/[slug]/page.tsx` (resultados finales) computa solo individuales
  (`computeTournamentResults`), nunca equipos.

## Path de datos

```
tournament_groups (grupo = equipo, modelo PM 02-jun)
  └─ ronda_libre_id ─→ ronda_equipos (id, nombre, handicap_equipo, scores JSONB)
                        └─ ronda_equipo_jugadores (jugador_id, orden)
  + índices de los jugadores del equipo (profiles.indice / ronda_libre_jugadores.handicap)
        │
        ▼
  calcularScramble(team, holes, parTotal) → ScrambleTeamResult
        │
        ▼
  ordenarEquiposScramble(...) → ranking
        │
        ▼
  map → ExtendedTeam[] (team_total, nombre, …) → <TeamLeaderboard teams={…} />
```

Nota: en el modelo grupo=equipo, cada grupo del torneo genera **una** `ronda_libre`
(en `handleStartTournament`) y por ende su(s) `ronda_equipos`. El leaderboard
agrega los equipos de todas las rondas de los grupos del torneo.

## Arquitectura — 3 piezas nuevas (chicas, testeables)

### 1. `src/golf/leaderboard/team-standings.ts` (lógica pura)

```ts
export interface TeamStandingInput {
  id: string
  nombre: string
  handicaps: number[]            // índices de los jugadores del equipo
  scores: Record<string, number> // score compartido por hoyo
}

export interface TeamStanding {
  id: string
  nombre: string
  team_total: number             // neto (o gross según modo) — orden ascendente
  gross: number
  neto: number
  thru: number                   // hoyos jugados
  // … campos que TeamLeaderboard ya consume
}

export function computeScrambleStandings(
  teams: TeamStandingInput[],
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number,
): TeamStanding[]
```

Envuelve `calcularScramble` por equipo + `ordenarEquiposScramble`. **No modifica el
motor.** Cubierto por tests (scores conocidos → ranking esperado, desempates, thru).

### 2. `src/lib/data/tournaments/teamLeaderboard.ts` (acceso a datos)

```ts
export async function fetchScrambleTeams(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<TeamStandingInput[]>
```

Query: `tournament_groups` (con `ronda_libre_id`) del torneo → `ronda_equipos`
(scores + handicap + miembros) + índices de los jugadores. Espejo del query que
ya usa `score-grupo`. Devuelve la lista lista para `computeScrambleStandings`.

### 3. Wiring en 2 server components (lectura, delgado)

- `en-vivo/page.tsx`: si `formato ∈ formatos-equipo`, `teams = computeScrambleStandings(await fetchScrambleTeams(...))` mapeado a `ExtendedTeam[]`; reemplaza `teams={[]}`.
- `torneo/[slug]/page.tsx`: idem, renderiza la tabla de standings de equipos
  cuando el formato es scramble (componente existente o uno fino reutilizando
  `TeamLeaderboard`).

## Alcance

### En v1
- Tabla de **standings de equipos** (ranking por score del equipo) en la vista
  **en-vivo** y en la **final** (`/torneo/[slug]`), solo **Scramble**.

### Fuera de v1 (deferido a v2, no se construye ahora)
- **Best Ball / Foursome**: a un `if` de distancia — el motor (`calcularBestBall`,
  `calcularFoursome`) ya existe. Se suman cuando se validen sus mecánicas de carga.
- **Podio de equipos con premios** en la vista final: por ahora solo standings;
  el podio/premios por equipo es v2.
- **Refactor de `score-grupo`** (1305 LOC, sucio): no se toca. Solo se lee de su
  misma fuente (`ronda_equipos`). Su refactor es trabajo aparte.

## Riesgos y mitigación

- **R1 — datos faltantes**: un grupo sin `ronda_libre_id` (torneo no iniciado) o
  sin `ronda_equipos` → el equipo se omite o muestra `thru 0`. El cómputo debe ser
  defensivo (sin crashear con scores vacíos), igual que el individual.
- **R2 — handicap de equipo**: `ronda_equipos.handicap_equipo` ya está
  precomputado, pero `calcularScramble` recalcula desde los índices. Para una sola
  fuente de verdad, v1 usa los índices de los jugadores (consistente con el motor y
  con `score-grupo`). Si difiere de `handicap_equipo`, se investiga antes de cerrar.
- **R3 — formato canónico**: usar `formato_juego` (canónico) con fallback a
  `format` (legacy), igual que `en-vivo/page.tsx` ya hace.

## Testing

- Unit `computeScrambleStandings`: scores conocidos → totales + orden esperados;
  desempate; equipo sin scores (thru 0); 2/3/4 jugadores (handicap correcto).
- Unit del mapeo `TeamStanding → ExtendedTeam`.
- Verificación E2E manual en preview con el torneo scramble real
  ("Padre e Hijo 2026") tras iniciarlo y cargar algunos hoyos.

## Verificación final (pre-merge)
- `npx tsc --noEmit` limpio · `npm run test` · `npm run build`
- code-reviewer (diff >100 LOC)
- Smoke en preview con torneo scramble real
- Confirmar deploy production `success`
