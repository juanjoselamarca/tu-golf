-- Rollback de 20261027120000_anon_columnas_vistas_publicas.sql.
-- Vuelve al baseline: anon con SELECT de tabla en 8 de las 9 tablas y, en ronda_libre_jugadores, SELECT por
-- columna sin telefono_invitado ni perfil_sugerido_id. No pierde datos. Idempotente.
-- El REVOKE de tabla borra también los SELECT por columna, para que el catálogo quede igual al baseline.

REVOKE SELECT ON public.hole_scores, public.players, public.rounds, public.tournament_groups,
  public.tournament_group_players, public.rondas_libres, public.ronda_equipos, public.ronda_equipo_jugadores
  FROM anon;

GRANT SELECT ON public.hole_scores, public.players, public.rounds, public.tournament_groups,
  public.tournament_group_players, public.rondas_libres, public.ronda_equipos, public.ronda_equipo_jugadores
  TO anon;

GRANT SELECT (id, ronda_id, nombre, user_id, scores, created_at, nombre_invitado, is_guest, tarjeta_aceptada,
              pending_user_id, handicap, tees)
  ON public.ronda_libre_jugadores TO anon;
