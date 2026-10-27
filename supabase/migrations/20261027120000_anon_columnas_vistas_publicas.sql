-- Privado por defecto, capa 2 (docs/PLAN-MAX.md, item 4): en las 9 tablas que se leen sin sesión desde
-- /torneo/[slug] y /api/ronda-libre/[codigo]/live, anon lee solo las columnas que usan las vistas públicas.
-- SOLO permisos de anon; authenticated y service_role no cambian.
--
-- Una columna nueva en estas tablas nace invisible para anon. Si una vista pública la necesita, su migración
-- agrega GRANT SELECT (col) ... TO anon; olvidarlo rompe la vista al probarla (42501) en vez de exponer el dato.
--
-- Las listas salen de la auditoría del 27-oct sobre todo src, sin el código que usa service role ni las rutas
-- protegidas por src/proxy.ts: columnas del select, de filtros y order, de los embeds y las FK que usan esos
-- embeds (ronda_equipo_jugadores.equipo_id). Las policies que leen estas tablas en subconsultas, y que se
-- evalúan con el rol que consulta, solo usan columnas que se quedan: las de gestión FOR ALL, tp_select de
-- tournament_prizes (players.tournament_id, players.user_id) y manage_match_pairings. La lista de cada
-- tabla vive también en ANON_COLUMNS (src/__tests__/helpers/migration-sql.ts), que la exige en prod.
--
-- Quedan fuera:
--   hole_scores: source, status, garmin_activity_id, garmin_shot_data, created_at, updated_at
--   players: flight_id, tees, status_changed_at
--   rounds: started_at
--   tournament_groups: created_at
--   rondas_libres: custom_stroke_index, course_snapshot
--   ronda_libre_jugadores: created_at, nombre_invitado, is_guest, tarjeta_aceptada, pending_user_id
--     (telefono_invitado y perfil_sugerido_id ya eran privadas)
--   ronda_equipo_jugadores: id
-- tournament_group_players y ronda_equipos quedan con todas sus columnas, pero por lista.
--
-- REVOKE SELECT de tabla también quita los SELECT por columna, así que cada GRANT deja exactamente su lista.
-- Idempotente.
--
-- Rollback: supabase/migrations/rollback/20261027_anon_columnas_vistas_publicas_rollback.sql

REVOKE SELECT ON public.hole_scores FROM anon;
GRANT SELECT (id, round_id, hole_number, par, gross_score, net_score, points, putts, fairway_hit, gir)
  ON public.hole_scores TO anon;

REVOKE SELECT ON public.players FROM anon;
GRANT SELECT (id, tournament_id, user_id, category_id, handicap_at_registration, status, created_at, status_reason,
              pending_user_id, player_name, tee_id, genero)
  ON public.players TO anon;

REVOKE SELECT ON public.rounds FROM anon;
GRANT SELECT (id, tournament_id, player_id, status, total_gross, total_net, total_points, closed_at, round_number)
  ON public.rounds TO anon;

REVOKE SELECT ON public.tournament_groups FROM anon;
GRANT SELECT (id, tournament_id, name, tee_time, ronda_libre_id, sort_order)
  ON public.tournament_groups TO anon;

REVOKE SELECT ON public.tournament_group_players FROM anon;
GRANT SELECT (id, group_id, player_id, jugador_ronda_id)
  ON public.tournament_group_players TO anon;

REVOKE SELECT ON public.rondas_libres FROM anon;
GRANT SELECT (id, codigo, creador_id, course_id, course_name, tees, holes, fecha, estado, created_at, modo_juego,
              hoyo_inicio, admin_mode, admin_user_id, recorridos, formato_juego, es_demo, hcp_pct)
  ON public.rondas_libres TO anon;

REVOKE SELECT ON public.ronda_libre_jugadores FROM anon;
GRANT SELECT (id, ronda_id, nombre, user_id, scores, handicap, tees)
  ON public.ronda_libre_jugadores TO anon;

REVOKE SELECT ON public.ronda_equipos FROM anon;
GRANT SELECT (id, ronda_id, nombre, handicap_equipo, scores, created_at, handicap_equipo_juego)
  ON public.ronda_equipos TO anon;

REVOKE SELECT ON public.ronda_equipo_jugadores FROM anon;
GRANT SELECT (equipo_id, jugador_id, orden)
  ON public.ronda_equipo_jugadores TO anon;
