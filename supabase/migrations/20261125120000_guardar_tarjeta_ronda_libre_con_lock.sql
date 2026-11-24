-- Guardar una tarjeta de ronda libre en el historial bloqueando la ronda (cierra la carrera de #868).
--
-- 20261124120000_descartar_solo_ronda_en_curso hizo que descartar_ronda_libre no borre una ronda en curso si alguna
-- tarjeta ya está en un historial (P0003 'ronda con tarjetas guardadas'). Pero el historial lo insertaba el cliente
-- directo en historical_rounds, sin tocar la ronda: si alguien guardaba su tarjeta entre el EXISTS y el DELETE del
-- descarte, la ronda se borraba igual y esa fila quedaba apuntando a una ronda que ya no existe.
--
-- guardar_tarjeta_ronda_libre inserta la fila (la arma el cliente, filaHistorialRondaLibre) después de tomar la ronda
-- FOR SHARE, el mismo patrón que upsert_ronda_libre_scores. Choca con el FOR UPDATE del descarte (y con su DELETE),
-- así que los dos se serializan:
--   · Si el guardado llega primero, el descarte espera a que confirme y su EXISTS (sentencia nueva, foto nueva) ya ve
--     la tarjeta: P0003 'ronda con tarjetas guardadas'.
--   · Si el descarte llega primero, el guardado espera; al confirmar el DELETE la ronda ya no está: RONDA_NOT_FOUND
--     (P0001) y no queda una fila huérfana.
-- Varios guardados a la vez no se bloquean entre sí (SHARE con SHARE), ni con las escrituras de golpes.
--
-- Permisos (SECURITY DEFINER, así que se exigen a mano los mismos que antes ponían la RLS y el cliente):
--   · user_id de la fila = auth.uid() (policy own_rounds de historical_rounds). Si no: 42501, el mismo código con
--     que la RLS rechazaba el INSERT.
--   · El jugador de metadata.ronda_libre_jugador_id es de quien guarda (jugador.user_id = auth.uid()): es esMiTarjeta,
--     que ya exigen los tres caminos del cliente (scorer individual, scorer de grupo, «Guardar en mi historial»).
--     Antes la RLS no lo miraba: cualquiera podía ocupar el vínculo de una tarjeta ajena. Si no: 42501.
--   · Sin ronda_libre_jugador_id (o con uno que no es un uuid): 22023. Esta función es solo para rondas libres.
-- La unicidad (ux_historical_rounds_ronda_libre_jugador) sigue devolviendo 23505, que el cliente trata como
-- `duplicada`, igual que con el INSERT directo.
--
-- Las columnas son las de FilaHistorialRondaLibre (src/golf/ronda-libre/tarjeta-historica.ts); las que no vienen en
-- la fila (id, created_at, import_source, …) quedan con su default, igual que con el INSERT directo.
--
-- Aditiva: el INSERT directo sigue permitido (la RLS no cambia). El código que la usa va en un PR aparte, después de
-- aplicar esta migración (docs/CONVENCIONES_TECNICAS.md, «Migración antes que el código que la usa»).
--
-- Prueba: scripts/ci/pruebas-sql/guardar-tarjeta-ronda-libre.sql (con dos sesiones: el cruce con el descarte).
-- Idempotente. Rollback: supabase/migrations/rollback/20261125_guardar_tarjeta_ronda_libre_con_lock_rollback.sql

CREATE OR REPLACE FUNCTION public.guardar_tarjeta_ronda_libre(p_fila jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fila public.historical_rounds;
  v_jugador_texto text;
  v_jugador_id uuid;
  v_ronda_id uuid;
  v_dueno uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR p_fila IS NULL OR jsonb_typeof(p_fila) <> 'object' THEN
    RAISE EXCEPTION 'TARJETA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_fila := jsonb_populate_record(NULL::public.historical_rounds, p_fila);
  IF v_fila.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'TARJETA_FORBIDDEN' USING ERRCODE = '42501', DETAIL = 'historial ajeno';
  END IF;

  v_jugador_texto := p_fila -> 'metadata' ->> 'ronda_libre_jugador_id';
  IF v_jugador_texto IS NULL
     OR v_jugador_texto !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'TARJETA_INVALIDA' USING ERRCODE = '22023', DETAIL = 'sin ronda_libre_jugador_id';
  END IF;
  v_jugador_id := v_jugador_texto::uuid;

  -- La ronda del jugador, sin bloquear: solo para saber cuál bloquear.
  SELECT j.ronda_id INTO v_ronda_id FROM public.ronda_libre_jugadores j WHERE j.id = v_jugador_id;
  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Primero la ronda (FOR SHARE), en su propia sentencia: el mismo orden que upsert_ronda_libre_scores, el cierre y
  -- el descarte. Si un descarte la borró mientras esperábamos, no vuelve ninguna fila.
  PERFORM 1 FROM public.rondas_libres r WHERE r.id = v_ronda_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Con la ronda tomada, el jugador sigue en ella y es de quien guarda.
  SELECT j.user_id INTO v_dueno FROM public.ronda_libre_jugadores j
  WHERE j.id = v_jugador_id AND j.ronda_id = v_ronda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_dueno IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'TARJETA_FORBIDDEN' USING ERRCODE = '42501', DETAIL = 'tarjeta ajena';
  END IF;

  INSERT INTO public.historical_rounds (
    user_id, course_name, course_id, played_at, total_gross, adjusted_gross, scores, par_per_hole, metadata,
    holes_played, tee_color, privacy, slope_rating, course_rating, diferencial, formato_juego, modo_juego,
    match_result, team_name
  ) VALUES (
    v_fila.user_id, v_fila.course_name, v_fila.course_id, v_fila.played_at, v_fila.total_gross, v_fila.adjusted_gross,
    v_fila.scores, v_fila.par_per_hole,
    -- El id del jugador en forma canónica (minúsculas): el índice único compara texto; 'E3…' y 'e3…' no chocarían.
    jsonb_set(v_fila.metadata, '{ronda_libre_jugador_id}', to_jsonb(v_jugador_id::text)),
    v_fila.holes_played, v_fila.tee_color,
    coalesce(v_fila.privacy, 'private'), v_fila.slope_rating, v_fila.course_rating, v_fila.diferencial,
    coalesce(v_fila.formato_juego, 'stroke_play'), coalesce(v_fila.modo_juego, 'gross'),
    v_fila.match_result, v_fila.team_name
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_tarjeta_ronda_libre(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_tarjeta_ronda_libre(jsonb) TO authenticated, service_role;
