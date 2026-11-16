# Plan: hándicap de torneo — aviso sin índice, edición post-inicio, privacidad separada de la fuente

Decisión de Juanjo (16-nov-2026): jugador sin índice → aviso no bloqueante al iniciar; edición del índice ya iniciado
debe llegar a la tarjeta y al hándicap del equipo. Plan diseñado por refactor-arquitecto (Fable), 16-nov.

## 1. Privacidad separada de la fuente (requiere migración)
Columna nueva `ronda_libre_jugadores.handicap_de_inscripcion boolean NOT NULL DEFAULT false` ("el índice de esta fila lo
gobierna la inscripción del torneo"). Sin ella no se puede separar: el creador de ronda libre entra con `user_id` + `handicap`
tipeado (`api/ronda-libre/create/route.ts:358-365`) y hoy se muestra sin sesión.

Predicados en `src/golf/ronda-libre/permisos.ts` (parámetro OBLIGATORIO para que tsc fuerce el select):
```ts
type FilaIndice = { user_id?: string|null; handicap?: number|null; handicap_de_inscripcion: boolean|null }
indiceVieneDelPerfil(j)     = !!j.user_id && j.handicap == null && !j.handicap_de_inscripcion   // FUENTE
handicapOcultoSinSesion(j)  = !!j.user_id && (j.handicap == null || !!j.handicap_de_inscripcion) // PRIVACIDAD
```
Regla de la tarjeta de torneo: función pura `filaDeHandicapDeTorneo(player, hcpCalcMode, teamFormat)` en
`src/golf/ronda-libre/handicap-tarjeta-de-torneo.ts` (mover `handicapDeLaTarjeta` ahí y re-exportar):
- WHS: siempre `{ handicap: player.handicap_at_registration, handicap_de_inscripcion: true }` (con o sin cuenta; null si no
  tiene → sinIndice / "S/Ind").
- raw: igual que hoy (`teamFormat || !user_id` → handicapDeLaTarjeta + flag; individual con cuenta → `{}`).
Consumidores de FUENTE (solo agregan columna al select): `ronda-libre.ts:135,156`, `tournaments/leaderboard.ts:454`,
`tournaments/teamLeaderboard.ts:32`.
Consumidores que pasan a `handicapOcultoSinSesion`: `gwi-ronda-libre.ts:157`; `leaderboard.ts:510` (campo
`handicap_de_perfil` → `handicap_oculto_sin_sesion`, `torneo/[slug]/types.ts:115`, `vista-publica.ts:63-67`);
`ronda-libre-live-api.ts:196`; `permisos.ts:70` (`netoNoDisponibleSinSesion`); `courseHandicapsDeRonda` con
`leerIndices === null` trata oculto como hoy; `datosRondaLibrePublicos` anula `handicap` de filas ocultas también en no-soloBruto.

## 2. Propagación de la edición
Ruta `PUT src/app/api/torneos/[slug]/players/[playerId]/handicap/route.ts` (service role; body `{value, esperado}`; auth como
start: sesión + organizer_id; valida con `rangoDeHandicapDeInscripcion`/`esHandicapDeInscripcionValido`).
Lógica `src/lib/data/tournaments/editarHandicapInscrito.ts`: `planDeEdicion` pura (fila con `filaDeHandicapDeTorneo`; equipo
solo `isSharedBallFormat` con `handicapsDeEquipoDelGrupo` + `fetchRoundPlayConfig(svc,t,1)` + `fetchContextoHcpDeEquipos` +
`leerHandicapDeEquipo`, idéntico al inicio; miembros = los materializados en `ronda_equipo_jugadores` por `orden`).
`editarHandicapInscrito` lee → planifica → RPC; conflicto → relee y reintenta (máx 3) → 409.
RPC `editar_handicap_inscrito(p_player_id, p_esperado, p_valor, p_tocar_tarjeta, p_handicap_tarjeta, p_base jsonb, p_equipos jsonb) returns jsonb`,
SECURITY DEFINER, solo service_role, en una transacción: lock `players` (editado ∪ base) ORDER BY id FOR UPDATE; verificar
esperados (IS NOT DISTINCT FROM) o `{ok:false,motivo:'conflicto'}`; UPDATE players; UPDATE ronda_libre_jugadores (handicap, flag
true) vía `tournament_group_players.jugador_ronda_id`; UPDATE ronda_equipos validando que el equipo es de un grupo del torneo;
filas ≠ esperadas → RAISE.
Hoyos ya jugados: scores es bruto; el neto se calcula al leer.
Cliente: `updatePlayerHandicap(slug, playerId, value, esperado)` hace fetch; `useHcpEditor` recibe slug, pasa `current`; 409 →
toast "Otro cambio llegó primero" + recarga.
Start vs edición simultánea: en `start/route.ts`, antes de `ponerEnJuego`, releer `handicap_at_registration` de aprobados; si
difiere → `fallar(...)`.

## 3. Aviso de inicio
Predicado `sinIndiceEnNingunaParte(p) = p.handicap_at_registration == null && p.profiles?.indice == null` junto a
`handicapInscrito` (`src/golf/core/compute-player-course-hcp.ts`). `jugadoresSinIndice(aprobados)` en `motivo-para-no-iniciar.ts`.
Servidor: `GET /api/torneos/[slug]/start` → `{ motivo, sinIndice }` (lector `leerParaIniciar(svc, slug, userId)` compartido con
el POST). Cliente: `handleStartTournament` hace el GET y muestra UN modal de confirmación que, si hay sin índice, agrega
(copy final, revisada) WHS: "Sin índice: A, B. Jugarán con índice 0." · raw: "Sin hándicap inscrito: A, B. Su neto puede salir mal."
(en raw la tarjeta toma el perfil y el board lo inscrito: no se afirma número; "corrígelo en Scoring → Resumen" vuelve con el PR C). POST lleva `{ sinIndiceVistos }`; si el
servidor encuentra alguien fuera → 409 `{codigo:'confirmar-sin-indice', sinIndice}` ANTES del rate limit y de toda escritura.
Nunca 400 ni bloqueo.

## Orden de PRs
- **D — aviso** (independiente, primero).
- **A — migración sola**: columna; GRANT SELECT (handicap_de_inscripcion) a anon y authenticated; `ANON_COLUMNS` en
  `src/__tests__/helpers/migration-sql.ts`; backfill flag (true en filas enlazadas por jugador_ronda_id con handicap NOT NULL;
  no toca valores); RPC; rollback. Tests SQL en `scripts/ci/pruebas-sql/`.
- **B — predicados + inicio** (requiere A aplicada en prod ANTES de promover: B selecciona la columna → 42703).
  Con B ya en prod: migración nueva con solo `SELECT public.backfill_handicap_de_inscripcion();` (los torneos
  iniciados entre A y B quedan con handicap y flag false → su hándicap inscrito se vería sin sesión).
- **C — pendiente de la revisión de A:** la RPC valida que el equipo sea de un grupo del torneo, no que el editado
  sea miembro. Si C lo necesita, endurecer con `CREATE OR REPLACE` (EXISTS en `ronda_equipo_jugadores`) tras
  confirmar que el inicio materializa esos miembros en todo formato de bola compartida. Verificar también que solo
  la ronda 1 materializa tarjeta de grupo (la RPC reescribe todas las tarjetas enlazadas del jugador).
- **C — ruta de edición**.

## Riesgos
1. Promover B sin A aplicada → caen las vistas en vivo. 2. Torneos individuales en juego al promover siguen con perfil vivo
(no se backfillean valores). 3. Raw individual con cuenta: la edición no llega a la tarjeta (inscrito es CH, tarjeta espera
índice). 4. Sin índice pasa de "0" a "S/Ind" en la tarjeta. 5. Un select que omita la columna filtraría el hándicap: tipo
obligatorio, el revisor busca casts. 6. Jugador retirado tras inicio: equipo con miembros materializados. 7. Backfill = UPDATE
masivo en prod (idempotente).

## No verificado por el arquitecto
Policies/grants reales de authenticated sobre ronda_libre_jugadores/profiles; si `rounds.total_net`/`hole_scores.net_score`
quedan desactualizados; que solo la ronda 1 materialice tarjeta de grupo; default de `hcp_calc_mode`; si `useRondaGrupoData`
admite visor sin sesión; si la tarjeta ignora `players.tee_id`.
