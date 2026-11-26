-- Skins: el creador corrige los jugadores ANTES del primer golpe (decisiones de Juanjo 26-nov; spec
-- docs/specs/formato-skins.md, «Editar antes del primer golpe»). Va después de 20261125140000 (#892).
--
-- PUT /api/ronda-libre/[codigo]/skins/jugadores valida igual que al crear y recalcula lo congelado; después llama a
-- esta función con service_role. Todo en UNA transacción: o quedan las filas y las reglas nuevas, o nada.
--
-- Orden de locks: la ronda FOR UPDATE primero y después las tarjetas, el mismo orden que el primer golpe
-- (upsert_ronda_libre_scores toma la ronda FOR SHARE y después la tarjeta): sin ciclo. Los dos se serializan y el que
-- llega segundo pierde limpio: si el golpe llegó antes, esta función ve la marca y responde P0003; si llegó después,
-- el golpe espera a que termine la edición y se anota sobre los jugadores nuevos.
--
-- p_jugadores: arreglo, en el orden final, de filas completas {id, nombre, user_id, perfil_sugerido_id, handicap, tees,
-- is_guest, telefono_invitado, nombre_invitado}. La posición 0 es la tarjeta del creador. user_id nunca se escribe:
-- el de la tarjeta del creador queda como estaba y un jugador nuevo entra sin cuenta (#581); perfil_sugerido_id es
-- la misma referencia sin poderes que graba la creación.
--
-- Errores (la ruta los traduce): P0002 la ronda no existe, no es Skins o no está en curso · P0003 el Skins ya empezó
-- · P0001 el pedido no calza (ids, creador, reglas).
CREATE OR REPLACE FUNCTION public.editar_jugadores_skins(p_ronda_id uuid, p_jugadores jsonb, p_reglas_juego jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ronda rondas_libres%ROWTYPE;
  v_ids uuid[];
  v_reglas_ids uuid[];
  v_creador_fila uuid;
  v_j jsonb;
  v_id uuid;
BEGIN
  SELECT * INTO v_ronda FROM rondas_libres WHERE id = p_ronda_id FOR UPDATE;
  IF NOT FOUND OR v_ronda.formato_juego IS DISTINCT FROM 'skins' OR v_ronda.estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'SKINS_NO_EXISTE: la ronda no existe, no es Skins o ya terminó.' USING ERRCODE = 'P0002';
  END IF;

  -- Con la ronda tomada, un primer golpe en vuelo ya terminó (o espera a que esto termine). La marca es permanente:
  -- borrar el único golpe no reabre la edición.
  IF public.ronda_libre_tiene_golpes(p_ronda_id) THEN
    RAISE EXCEPTION 'SKINS_CONGELADO: el Skins ya empezó. Desde el primer golpe no se edita.' USING ERRCODE = 'P0003';
  END IF;

  IF jsonb_typeof(p_jugadores) IS DISTINCT FROM 'array' OR jsonb_array_length(p_jugadores) = 0
     OR jsonb_typeof(p_reglas_juego) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_reglas_juego -> 'jugadorIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: faltan los jugadores o las reglas.' USING ERRCODE = 'P0001';
  END IF;

  -- La config (pozo, variantes, modo, %) no se edita: solo cambian los jugadores y lo congelado.
  IF (p_reglas_juego -> 'config') IS DISTINCT FROM (v_ronda.reglas_juego -> 'config') THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: las reglas del Skins no se editan.' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg((e ->> 'id')::uuid ORDER BY o) INTO v_ids FROM jsonb_array_elements(p_jugadores) WITH ORDINALITY AS x(e, o);
  SELECT array_agg(e::uuid ORDER BY o) INTO v_reglas_ids FROM jsonb_array_elements_text(p_reglas_juego -> 'jugadorIds') WITH ORDINALITY AS x(e, o);
  IF v_ids IS DISTINCT FROM v_reglas_ids OR array_position(v_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT u) FROM unnest(v_ids) u) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: los jugadores no calzan con las reglas.' USING ERRCODE = 'P0001';
  END IF;

  -- Un id de otra ronda no se roba.
  IF EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = ANY (v_ids) AND ronda_id <> p_ronda_id) THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: un jugador es de otra ronda.' USING ERRCODE = 'P0001';
  END IF;

  -- La tarjeta del creador sigue y sigue primera (es la que anota y la del historial).
  SELECT id INTO v_creador_fila FROM ronda_libre_jugadores
  WHERE ronda_id = p_ronda_id AND user_id = v_ronda.creador_id
  ORDER BY created_at LIMIT 1;
  IF v_creador_fila IS NULL OR v_ids[1] IS DISTINCT FROM v_creador_fila THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: el creador no se saca ni cambia de lugar.' USING ERRCODE = 'P0001';
  END IF;

  -- Una tarjeta con cuenta (la del creador o una ya tomada) no se borra.
  IF EXISTS (SELECT 1 FROM ronda_libre_jugadores
             WHERE ronda_id = p_ronda_id AND NOT (id = ANY (v_ids))
               AND (user_id IS NOT NULL OR pending_user_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: no se saca a un jugador con cuenta.' USING ERRCODE = 'P0001';
  END IF;

  -- Un jugador nuevo entra sin cuenta (#581).
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_jugadores) e
             WHERE NOT EXISTS (SELECT 1 FROM ronda_libre_jugadores j WHERE j.id = (e ->> 'id')::uuid)
               AND NULLIF(e ->> 'user_id', '') IS NOT NULL) THEN
    RAISE EXCEPTION 'SKINS_EDICION_INVALIDA: un jugador nuevo no entra con cuenta.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM ronda_libre_jugadores WHERE ronda_id = p_ronda_id AND NOT (id = ANY (v_ids));

  FOR v_j IN SELECT e FROM jsonb_array_elements(p_jugadores) e LOOP
    v_id := (v_j ->> 'id')::uuid;
    UPDATE ronda_libre_jugadores SET
      nombre = v_j ->> 'nombre',
      handicap = (v_j ->> 'handicap')::numeric,
      tees = v_j ->> 'tees',
      perfil_sugerido_id = NULLIF(v_j ->> 'perfil_sugerido_id', '')::uuid,
      is_guest = COALESCE((v_j ->> 'is_guest')::boolean, false),
      telefono_invitado = v_j ->> 'telefono_invitado',
      nombre_invitado = v_j ->> 'nombre_invitado'
    WHERE id = v_id AND ronda_id = p_ronda_id;
    IF NOT FOUND THEN
      INSERT INTO ronda_libre_jugadores (
        id, ronda_id, nombre, user_id, perfil_sugerido_id, scores, handicap, tees, is_guest, telefono_invitado, nombre_invitado
      ) VALUES (
        v_id, p_ronda_id, v_j ->> 'nombre', NULL, NULLIF(v_j ->> 'perfil_sugerido_id', '')::uuid, '{}'::jsonb,
        (v_j ->> 'handicap')::numeric, v_j ->> 'tees', COALESCE((v_j ->> 'is_guest')::boolean, false),
        v_j ->> 'telefono_invitado', v_j ->> 'nombre_invitado'
      );
    END IF;
  END LOOP;

  UPDATE rondas_libres SET reglas_juego = p_reglas_juego WHERE id = p_ronda_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.editar_jugadores_skins(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_jugadores_skins(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.editar_jugadores_skins(uuid, jsonb, jsonb) IS
  'Skins: altas, bajas, índices y tees de los jugadores más reglas_juego (jugadorIds y congelado), en una transacción, solo antes del primer golpe. Solo service_role (PUT /api/ronda-libre/[codigo]/skins/jugadores).';
