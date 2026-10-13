-- Agrega la columna `orden` a ronda_equipo_jugadores.
--
-- Root cause descubierto por el smoke end-to-end del productor de equipos
-- (PR #90, 02-jun-2026): el create route de ronda libre
-- (api/ronda-libre/create/route.ts), el productor de torneos
-- (useTournamentLifecycle.ts), el leaderboard de equipos
-- (lib/data/tournaments/teamLeaderboard.ts) y el scorer en cancha
-- (ronda-libre/[codigo]/score-grupo/page.tsx) TODOS referencian `orden`
-- (insert + select de ronda_equipo_jugadores), pero la columna NUNCA existió.
--
-- Consecuencia: el insert de miembros fallaba en silencio (PGRST204, sin
-- chequeo de error en el create route) y el read del leaderboard erraba
-- (tragado como board vacío). Por eso NINGÚN torneo de equipos mostraba sus
-- equipos, aunque se crearan los ronda_equipos.
--
-- `orden` es semánticamente necesario: ordena los miembros del equipo (display)
-- y en foursome define quién sale en hoyos pares/impares. Default 0 / NOT NULL
-- porque todo el código que inserta provee siempre el valor (idx).
--
-- Aplicada a prod vía run-sql.mjs el 02-jun-2026.

alter table ronda_equipo_jugadores
  add column if not exists orden integer not null default 0;
