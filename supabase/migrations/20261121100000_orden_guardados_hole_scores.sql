-- Orden de los guardados de un hoyo de torneo (hole_scores), residual de #754.
--
-- El scorer del jugador y el del organizador guardan cada hoyo con un POST a /api/game (upsert_score), que hacía un
-- upsert por (round_id, hole_number) sin versión. Si el jugador anota 5 y corrige a 4, y por red o reintento el POST
-- del 5 llega al servidor después del 4, quedaba guardado el 5. El cliente no lo puede ver: los dos "ok" llegan.
--
-- Es el mismo arreglo que ya tienen la ronda libre y los equipos (20261020190000, 20261020200000): cada carga de la
-- página del scorer es un "dispositivo" (uuid) con una secuencia monotónica en memoria. El servidor recuerda, por hoyo
-- y por dispositivo, la secuencia más alta que aplicó y descarta una igual o menor. La marca es POR HOYO (no por
-- tarjeta como en la ronda libre) porque cada POST trae un solo hoyo: con una marca por tarjeta, el hoyo 3 que llega
-- después del hoyo 4 se descartaría y el golpe se perdería.
--
-- Por qué no reloj del cliente: los relojes de dos teléfonos no se pueden comparar (minutos de desfase), y un reloj
-- corregido hacia atrás descartaría en silencio golpes buenos. Por qué la marca va en una tabla aparte y no en la fila
-- de hole_scores: la fila sólo recordaría al último dispositivo. A anota 5 (seq 1, demorado) y 4 (seq 2); el
-- organizador anota 6; llega el 5 de A: la fila dice "organizador", así que el 5 entraría y pisaría al 6.
--
-- Entre dispositivos distintos (jugador y organizador sobre el mismo hoyo) gana el que llega último, como antes y como
-- en la ronda libre: ninguno de los dos está "más al día" que el otro, y rechazarlo exigiría una pantalla de conflicto.
--
-- guardar_hole_score hace la marca y el upsert en UNA transacción: el INSERT ... ON CONFLICT sobre la marca toma el
-- candado de esa fila hasta el COMMIT, así que dos guardados del mismo dispositivo y hoyo se serializan y el más viejo,
-- al despertar, ve la secuencia nueva y se descarta. Con la marca y el upsert en dos llamadas, el viejo podía marcar
-- primero y escribir último.
--
-- p_fila trae las columnas que el servidor ya armó (actions.ts upsertScore). Una clave AUSENTE deja la columna como
-- está (igual que el upsert de PostgREST, que sólo pone en el DO UPDATE SET las columnas del payload): así un fallo de
-- la derivación del neto no borra el neto bueno guardado. Sin p_seq o p_dispositivo no hay orden (clientes viejos).
--
-- Despliegue: el código nuevo cae al upsert de antes si la función no existe (PGRST202 / 42883) o si falta la tabla o
-- el permiso (42P01 / 42501, reportado), así que el orden de aplicación es indiferente.
--
-- Crecimiento: una fila por (tarjeta, hoyo, carga de la página que anotó ese hoyo): del orden de las filas de
-- hole_scores, con CASCADE al borrar la ronda. No se borra al cerrar la tarjeta: una tarjeta reabierta necesita la
-- marca, y el volumen no lo justifica (mismo criterio que ronda_libre_scores_orden). Rollback: rollback/20261121_orden_guardados_hole_scores_rollback.sql.

CREATE TABLE IF NOT EXISTS public.hole_scores_orden (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  dispositivo uuid NOT NULL,
  seq bigint NOT NULL,
  PRIMARY KEY (round_id, hole_number, dispositivo)
);

-- Sólo la escribe guardar_hole_score (service_role desde /api/game). Nadie la lee desde el cliente.
ALTER TABLE public.hole_scores_orden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hole_scores_orden FROM PUBLIC, anon, authenticated;
-- Explícito: la función es SECURITY INVOKER y corre como service_role. Hoy lo cubren los default privileges de
-- public, pero sin este GRANT una base que difiera respondería 42501 a cada golpe con secuencia.
GRANT SELECT, INSERT, UPDATE ON TABLE public.hole_scores_orden TO service_role;

CREATE OR REPLACE FUNCTION public.guardar_hole_score(p_fila jsonb, p_seq bigint DEFAULT NULL, p_dispositivo uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid := (p_fila->>'round_id')::uuid;
  v_hole integer := (p_fila->>'hole_number')::integer;
  v_id uuid;
BEGIN
  IF v_round_id IS NULL OR v_hole IS NULL THEN
    RAISE EXCEPTION 'HOLE_SCORE_SIN_CLAVE' USING ERRCODE = '22023';
  END IF;

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.hole_scores_orden AS o (round_id, hole_number, dispositivo, seq)
    VALUES (v_round_id, v_hole, p_dispositivo, p_seq)
    ON CONFLICT (round_id, hole_number, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó este hoyo con una secuencia igual o más nueva: este guardado no la pisa.
    IF NOT FOUND THEN
      SELECT hs.id INTO v_id FROM public.hole_scores hs WHERE hs.round_id = v_round_id AND hs.hole_number = v_hole;
      RETURN jsonb_build_object('aplicado', false, 'id', v_id);
    END IF;
  END IF;

  INSERT INTO public.hole_scores AS hs
    (round_id, hole_number, gross_score, source, status, net_score, points, par, putts, fairway_hit, gir)
  VALUES (
    v_round_id,
    v_hole,
    (p_fila->>'gross_score')::integer,
    COALESCE(p_fila->>'source', 'manual_player'),
    COALESCE(p_fila->>'status', 'pending'),
    (p_fila->>'net_score')::integer,
    -- Ausente en un INSERT = el default de la columna, como el upsert de PostgREST.
    CASE WHEN p_fila ? 'points' THEN (p_fila->>'points')::integer ELSE 0 END,
    (p_fila->>'par')::integer,
    (p_fila->>'putts')::integer,
    (p_fila->>'fairway_hit')::boolean,
    (p_fila->>'gir')::boolean
  )
  ON CONFLICT (round_id, hole_number) DO UPDATE SET
    gross_score = CASE WHEN p_fila ? 'gross_score' THEN EXCLUDED.gross_score ELSE hs.gross_score END,
    source      = CASE WHEN p_fila ? 'source'      THEN EXCLUDED.source      ELSE hs.source END,
    status      = CASE WHEN p_fila ? 'status'      THEN EXCLUDED.status      ELSE hs.status END,
    net_score   = CASE WHEN p_fila ? 'net_score'   THEN EXCLUDED.net_score   ELSE hs.net_score END,
    points      = CASE WHEN p_fila ? 'points'      THEN EXCLUDED.points      ELSE hs.points END,
    par         = CASE WHEN p_fila ? 'par'         THEN EXCLUDED.par         ELSE hs.par END,
    putts       = CASE WHEN p_fila ? 'putts'       THEN EXCLUDED.putts       ELSE hs.putts END,
    fairway_hit = CASE WHEN p_fila ? 'fairway_hit' THEN EXCLUDED.fairway_hit ELSE hs.fairway_hit END,
    gir         = CASE WHEN p_fila ? 'gir'         THEN EXCLUDED.gir         ELSE hs.gir END
  RETURNING hs.id INTO v_id;

  RETURN jsonb_build_object('aplicado', true, 'id', v_id);
END;
$function$;

-- SECURITY INVOKER + sólo service_role: un authenticated no tiene INSERT en hole_scores, pero igual se le quita.
REVOKE ALL ON FUNCTION public.guardar_hole_score(jsonb, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_hole_score(jsonb, bigint, uuid) TO service_role;

-- PostgREST lee el esquema nuevo sin esperar al próximo reinicio.
NOTIFY pgrst, 'reload schema';
