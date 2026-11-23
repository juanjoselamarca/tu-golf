# Plan: "Scramble rápido" (equipos con hándicap del club) in ronda libre

## Objective and scope

**In:** scramble quick rounds created with 1–4 teams, each just a name plus the club's handicap, scored on one phone or one phone per team.

**Out:**
- Foursome and best ball, tournaments, and the existing full-players scramble (untouched).
- 27 holes: the form only offers 9/18, so the API rejects 27 in this mode.
- Plus team handicaps: iOS numeric keypad has no minus and they are very rare.
- History cards for second-phone scorers.

## Verified facts that drive the design

- `ronda_equipos.handicap_equipo` is `numeric(4,1)` and `handicap_equipo_juego` is `smallint` (`supabase/schema.sql:705-714`). `strokesRecibidosEnHoyo` requires an integer (`src/golf/core/stableford-score.ts:110-121`), so the club handicap must be an integer.
- `handicapDeEquipoParaHoyos` returns `juego` untouched when non-null (`team-handicap.ts:160`). Storing the club value in both columns makes every engine and display consumer correct with no code change.
- No mechanism exists for a second account to join a ronda libre: `ronda_libre_jugadores` inserts are creator-only (`schema.sql:3998`) and there is no join RPC.
- `upsert_ronda_equipos_scores` authorises via `puede_anotar_ronda` only (`schema.sql:3113-3118`), which is round-wide: anyone who passes can write any team.
- **Main hazard:** `autoFillTeamsWithPar` and `completarEquiposConPar` par-fill every team in local state (`useTeamScoreSave.ts:71-94`), and the RPC merges with `scores || p_delta`. A phone holding a stale copy of another phone's team would overwrite real scores with pars.

## 1. Data model

**Creator row:** the creator stays as the only `ronda_libre_jugadores` row (position 0, `user_id`) and the only member of team 1 ("Tu equipo"). Other teams have zero members. This keeps working, unchanged:
- `jugadores.min(1)` in the API schema;
- `useFinalizeGrupo` history (`:261-269`) and `finalizarRondaLibre({jugadorId: [0]})` (`:310`);
- GuardarEnMiHistorial, dashboard and "repeat last round" (by `creador_id`), push senders;
- the `finalizar_ronda_libre` fallback: a stranger still cannot close, because the creator's own card is empty.

**Handicap storage:**
- Neto: `handicap_equipo = handicap_equipo_juego = club value`.
- Gross: both null (the engine treats null as 0) and the field is not asked.
- Range: integer 0 to 36 for 18 holes, 0 to 18 for 9 holes. 0 is valid and explicit; empty means missing.

**Migration** (needed for multi-phone and to tell club teams apart without inferring from "team with fewer than 2 members"):

```sql
ALTER TABLE ronda_equipos
  ADD COLUMN handicap_origen text NOT NULL DEFAULT 'calculado'
    CHECK (handicap_origen IN ('calculado','club')),
  ADD COLUMN anotador_user_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN anotador_nombre text NULL;
GRANT SELECT (handicap_origen) ON ronda_equipos TO anon;  -- anon uses column grants (schema.sql:4473)
```

- `upsert_ronda_equipos_scores`: same signature; read `re.anotador_user_id` in the locked select and extend the check to `v_is_service OR puede_anotar_ronda(v_ronda_id) OR v_anotador = auth.uid()`.
- `puede_anotar_ronda` is NOT modified. It is used by finalize, Timba and others, and a team scorer must not gain round-wide power.
- New `reclamar_equipo_de_ronda(p_codigo text, p_equipo_id uuid) RETURNS jsonb`, SECURITY DEFINER, granted to authenticated only:
  - Lock order: ronda `FOR SHARE`, then equipo `FOR UPDATE` (same as the upserts).
  - Requires a session, `estado='en_curso'`, not demo, `admin_mode IS NOT TRUE`, team `handicap_origen='club'`, and no `tournament_groups.ronda_libre_id` pointing at the round.
  - Returns `{estado:'ok'}` (idempotent if already mine), `{estado:'tomado', anotador_nombre}`, or `{estado:'ya_tienes_equipo', equipo_id}` (one team per user per round).
  - Sets `anotador_nombre` from `profiles.name` inside the function, because authenticated clients cannot read other profiles.
- New `liberar_equipo_de_ronda(p_codigo, p_equipo_id)`: the creator or the scorer itself sets both columns to null.
- Rollback file: restore the upsert body from `20261020200000_orden_guardados_ronda_equipos.sql`, drop both RPCs, drop the three columns.

## 2. Multi-phone

- **Opt-in:** the creator picks "Cada equipo en su celular", which creates the round with `admin_mode=false`. Every existing team round has `admin_mode=true`, so nothing existing becomes claimable.
- **At creation:** the API sets team 1's `anotador_user_id` to the creator.
- **Phone 2:** opens the "Invitar a jugar" link (`/score` redirects to `/score-grupo`, `useRondaScoreData.ts:126`) and logs in if needed (existing redirect). `cargarDelServidor` returns a new `{tipo:'elegir_equipo'}` and the page renders `ElegirEquipo`.
- **Conflict:** the claim is atomic under the row lock. The loser sees «Ese equipo ya lo anota {nombre}. Elige otro.» and the list refreshes.
- **Scoping rule, single source:** create `src/golf/ronda-libre/anotador-de-equipo.ts`:
  - `unCelularPorEquipo(ronda, equipos): boolean` is shared ball, `!admin_mode`, and some team with `handicap_origen==='club'`.
  - `equiposQueAnota(ronda, equipos, userId): Equipo[]`. In one-phone rounds: all teams. In multi-phone rounds: teams where `anotador_user_id===userId`, plus unclaimed teams if the user is the creator.
- **Applied once:** `cargarDelServidor` filters `teamEquipos` through `equiposQueAnota` (`useRondaGrupoData.ts:150`). Par-fill, pending sends, `hoyoInicial` and the snapshot are then scoped automatically, and a phone never holds another phone's scores.
- **Teams scored elsewhere:** shown as a strip, not a card: «Equipo 3 · lo anota Pedro» with «Ver tabla en vivo». The creator also gets «Liberar». Hide the in-scorer ranking in multi-phone rounds, since it would rank only local teams.
- **Finalize** (creator only; phone 2 cannot, by SQL): before closing, refetch all teams with `fetchEquiposDeRondas`. If a team scored by another phone has missing holes, block with «{Equipo} va en el hoyo {n}. Espera a que termine o libéralo para cerrarlo tú.»
- **Phone 2 when complete:** «Tarjeta completa. {creador} cierra la ronda.»
- **Released while scoring:** the next save returns P0003. Reload the claim state and show «Ya no anotas este equipo.» instead of the generic rejected-card toast.
- **Entry gate:** replace `useRondaGrupoData.ts:136` with one predicate in the same golf file. Today a team round with `admin_mode=true` lets any logged-in user reach the scorer UI (only the RPC rejects); the predicate closes that too.

## 3. UX (creation)

Paso Jugadores, only when `formato==='scramble'`: a segmented control «Con jugadores» (default, today's flow) | «Solo equipos».

In «Solo equipos»:
- If the plan allows, set modo to neto on entering. Check `netoBloqueadoPorPlan('scramble')`.
- Team cards, 1 to 4, with «+ Agregar equipo» (56px):
  - Name input, placeholder «Equipo N», max `NOMBRE_EQUIPO_MAX`. Empty falls back to `nombreVisibleDeEquipo`.
  - «Hándicap del equipo»: `inputMode="numeric"`, 56px high, 18px+ font, neto only.
- In gross: «Juegan gross, sin hándicap.»
- With 2 or more teams, a required choice with nothing preselected: «Yo anoto todos» | «Cada equipo en su celular». With 1 team it is not asked (`admin_mode=true`).

Validation copy:
- «Escribe el hándicap de {equipo}.»
- «El hándicap de equipo va de 0 a {max}, sin decimales.»
- «Dos equipos se llaman igual. Cambia uno.»
- «Este modo admite hasta 4 equipos.»
- «Elige quién anota.»
- «Este modo se juega a 9 o 18 hoyos.»

Confirmar: «Scramble · Neto · 3 equipos», one line per team «Los Tigres · HCP 8 (club)», and «Anota: cada equipo en su celular».

PantallaCompartir, multi-phone only: the first block becomes «Un celular por equipo» with «Envía este link a un jugador de cada equipo. Al abrirlo elige su equipo.» Share text: «Anota el score de tu equipo en Golfers+».

## 4. Golf correctness

- `calcularScramble` (`scramble.ts:88-122`) allocates `teamHcpHoyos` over a normalised SI permutation of the holes played. An integer of at most 2 × holes is fully modelled, hence the 18 cap on 9 holes.
- 9-hole neto shows and scores the same club number (both columns equal), consistent with "HCP visible, never halved".
- Ranking for N teams is generic (`ordenarEquiposScramble`, countback).
- Shared-ball rounds never touch the índice (unchanged).

## 5. PRs (all critical zone, `revisor-fable` each)

**PR1: migration only.**
- Files: `supabase/migrations/&lt;ts&gt;_scramble_equipos_de_club.sql`, rollback, `supabase/schema.sql`, `src/__tests__/helpers/migration-sql.ts:69`, new `scripts/ci/pruebas-sql/equipos-de-club.sql`.
- SQL tests: stranger write is forbidden; a scorer writes its own team and not another; double claim has one winner; claim refused on `admin_mode` and tournament rounds; after release, write is forbidden; a scorer cannot finalize.
- Update prod tests `privilegios-tablas` and `rls-public-read`.

**PR2: golf, validator, API (no UI caller yet).**
- New `src/golf/ronda-libre/equipos-de-club.ts`: `MAX_EQUIPOS_DE_CLUB=4`, `handicapDeClubMaximo(holes)`, `esHandicapDeClubValido(v, holes)`, `handicapsDeEquipoDeClub(v: number|null): HandicapsDeEquipo`.
- `validar-nueva-ronda.ts`: add optional `equiposDeClub?: { equipos: {nombre: string; handicap: number|null}[]; holes: number; quienAnota: 'uno'|'cada_equipo'|null }`. When present, branch before `problemaDeCantidad`: scramble only, exactly 1 jugador, then `problemaDeEquiposDeClub`.
- `create/route.ts`: accept `equipos_de_club` (zod, max 4), mutually exclusive with `equipos`. Skip `handicapsDeEquipoDeRondaNueva`. Insert teams with `handicap_origen:'club'`, creator as member of team 1, and `anotador_user_id` when multi-phone. The server derives `admin_mode`. `deshacerRonda` on any failure.
- Tests: validator and golf units; route tests (neto, gross, 27 holes, 5 teams, decimal, both payloads); `calcularScramble` with club hcp 0, 8, 18, 36 on 9 and 18 holes (sum of strokes equals the handicap).

**PR3: creation UI, one phone.**
- `nueva/hooks/useEquiposDeClub.ts` with tests, `components/EquiposDeClub.tsx`, plus `PasoJugadores`, `PasoConfirmar`, `useCrearRonda`, `page.tsx`.
- `page.tsx` routes to score-grupo for any team format.
- `SharedBallTeamCard`: hide member chips for club teams.
- `ronda-libre-nueva.ts:112` and `repetirRonda`: restore the mode and team names, with handicaps left empty (a stale club handicap is a wrong result).
- Check `PasoJugadores` LOC first ("el que toca, ordena").

**PR4: multi-phone.**
- `anotador-de-equipo.ts` with tests, `src/lib/data/ronda-libre-anotador.ts` (RPC wrappers), `ElegirEquipo.tsx`, `useRondaGrupoData`, `useFinalizeGrupo`, score-grupo `page.tsx`, `PantallaCompartir`, the «Quién anota» control, and the live page CTA (`[codigo]/page.tsx`, its one `admin_mode` use).
- Tests: `equiposQueAnota` matrix; finalize blocked by a foreign incomplete team; P0003 after release; par-fill never touches foreign teams.

Order: PR1 merged and the migration approved in prod before PR2 is promoted, otherwise the insert fails with PGRST204.

## 6. Risks and prod smoke

- **Par overwrite across phones** (above): the reviewer must confirm no code path sends a delta for a team outside `equiposQueAnota`.
- **Not verified by me, Opus must check with 3 to 4 teams and member-less teams:**
  - `TeamLeaderboards`, `WinnerCelebration` and `round-snapshot` rendering.
  - That 9-hole callers pass only the 9 played holes to `calcularScramble`.
  - Whether saves from a non-player scorer trigger push to watchers.
  - That the account-deletion function tolerates the new FK.
- **Phone 2 has no dashboard entry.** It re-enters by the link; the local snapshot covers reloads.
- **Smoke** (after `evento-en-vivo.mjs` exits clean), 390px, two accounts:
  - Create 9-hole and 18-hole neto rounds with 4 teams.
  - Claim from the second account, including the same team from two sessions.
  - Score in parallel and confirm no cross-writes.
  - Release a team, then finalize.
  - Check the live table, the creator's history card, and the gross variant.

## Decisions for Juanjo

1. Plus team handicaps are excluded in v1.
2. Second-phone scorers get no history card in v1.
3. The second phone needs a Golfers+ account.
4. Copy strings above.

## Done criteria for `revisor-fable`

- `puede_anotar_ronda` is unchanged.
- The club range lives only in `equipos-de-club.ts`.
- The multi-phone predicate lives only in `anotador-de-equipo.ts`.
- No `supabase.from()` outside `api/` or `src/lib/data`.
- The existing scramble flow is unchanged (tests untouched and green).
- SQL tests are present for each authorisation case.
- Rollback file is present.