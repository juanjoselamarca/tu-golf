-- «Descartar ronda» no borra una ronda ya cerrada.
--
-- descartar_ronda_libre revisaba que la ronda existiera, que quien llama fuera su creador y que no fuera de un torneo,
-- pero no su estado: una ronda 'finalizada' se podía borrar entera (con las tarjetas de todos). En el scorer individual
-- pasaba tocando «Seguir anotando» en la pantalla final y después «Descartar ronda» (revisión Fable del #867).
-- Una ronda cerrada se puede reabrir (reabrir un torneo la devuelve a 'en_curso'), pero borrarla no tiene vuelta.
--
--   · Con la ronda en otro estado que 'en_curso': RONDA_FINALIZED (P0002), el mismo código del guardado y del cierre.
--     El chequeo va después de los de permiso: a quien no es el creador se le sigue diciendo que no puede (P0003).
--   · El estado se lee en el mismo SELECT ... FOR UPDATE: un cierre concurrente espera o ya quedó visto.
--   · Con la ronda en curso pero alguna tarjeta ya guardada en un historial (historical_rounds con
--     metadata.ronda_libre_jugador_id de un jugador de la ronda): RONDA_FORBIDDEN (P0003) con DETAIL
--     'ronda con tarjetas guardadas'. Decisión de producto (Juanjo, 24-nov): si nadie guardó, se descarta; si
--     alguien guardó, no. Pasa cuando uno finaliza y los demás siguen jugando: al recargar, «Descartar» volvía.
--     Usa el índice único ux_historical_rounds_ronda_libre_jugador (por eso el `metadata ? ...` en el JOIN).
--     Límite conocido: el historial lo inserta el cliente directo, sin tomar el lock de la ronda. Si alguien guarda
--     su tarjeta en los milisegundos entre este EXISTS y el DELETE, la ronda se borra igual y esa fila del historial
--     queda con el vínculo huérfano (autocontenida, como pasaba siempre antes de esta migración). Cerrarlo del todo
--     exige que el guardado del historial pase por un RPC que bloquee la ronda.
--
-- Prueba: scripts/ci/pruebas-sql/descartar-ronda-libre.sql. Idempotente.
-- Rollback: supabase/migrations/rollback/20261124_descartar_solo_ronda_en_curso_rollback.sql

CREATE OR REPLACE FUNCTION public.descartar_ronda_libre(p_codigo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_creador uuid;
  v_es_demo boolean;
  v_estado text;
BEGIN
  SELECT id, creador_id, es_demo, estado INTO v_id, v_creador, v_es_demo, v_estado
  FROM public.rondas_libres
  WHERE codigo = p_codigo
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo OR auth.uid() IS NULL OR v_creador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.ronda_libre_id = v_id) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de torneo';
  END IF;
  -- Una ronda cerrada no se descarta: borrarla se lleva las tarjetas de todos y no tiene vuelta.
  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  -- Alguien ya guardó su tarjeta de esta ronda en su historial (decisión de producto 24-nov): borrarla dejaría esa
  -- tarjeta apuntando a una ronda que no existe. Vale con la ronda aún en curso (otros siguen jugando).
  IF EXISTS (
    SELECT 1 FROM public.ronda_libre_jugadores j
    JOIN public.historical_rounds h
      ON h.metadata ? 'ronda_libre_jugador_id' AND h.metadata ->> 'ronda_libre_jugador_id' = j.id::text
    WHERE j.ronda_id = v_id
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda con tarjetas guardadas';
  END IF;

  BEGIN
    DELETE FROM public.rondas_libres WHERE id = v_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- p. ej. taiger_sessions (NO ACTION): la ronda tiene datos asociados.
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda con datos asociados';
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.descartar_ronda_libre(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_ronda_libre(text) TO authenticated, service_role;
