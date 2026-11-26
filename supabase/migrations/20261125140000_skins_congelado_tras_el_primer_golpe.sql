-- Skins: golpes congelados desde el primer golpe (decisiones de Juanjo 25-nov; spec docs/specs/formato-skins.md,
-- «Golpes congelados»). Va después de 20261125100000_skins_ronda_libre (PR #888) y de #890.
--
-- Regla: en una ronda de formato 'skins', apenas alguien anotó un golpe o una X («Fuera del hoyo»), nada de lo que
-- fija los golpes o los hoyos puede cambiar, para NADIE (authenticated, service_role, funciones SECURITY DEFINER):
--   rondas_libres:          reglas_juego, hcp_pct, modo_juego, tees, course_id, recorridos, holes, hoyo_inicio,
--                           formato_juego
--   ronda_libre_jugadores:  handicap, tees, ronda_id, y el INSERT de jugadores nuevos.
-- Antes del primer golpe se puede corregir (índice o tee mal tipeado, sumar un jugador). La Timba ('personalizado')
-- y el resto de los formatos NO cambian: el trigger sale al tiro si la ronda no es skins.
--
-- Por qué trigger y no REVOKE de columnas (inventario 25-nov en el PR): authenticated tiene UPDATE e INSERT de
-- TABLA en las dos tablas, así que un REVOKE de columna no corta nada sin re-otorgar columna por columna para todos
-- los formatos; el INSERT de jugadores no se puede revocar (la creación lo usa); y un REVOKE no frena a service_role
-- ni a las funciones SECURITY DEFINER. El trigger tampoco depende de current_user: decide por el estado de la ronda.
--
-- Lo congelado (reglas_juego->'congelado': course handicap de cada jugador y SI de los hoyos) lo escribe SOLO el
-- servidor (claim role = service_role, el mismo criterio que upsert_ronda_libre_scores): la API de creación inserta
-- la ronda con el cliente del creador SIN congelado y lo agrega después con service_role. Ni en el INSERT ni en un
-- UPDATE un creador puede darse golpes a escondidas (no se ven en la tarjeta: el índice sí).
--
-- La X: solo la escribe upsert_ronda_libre_scores (borra los golpes del hoyo en la misma sentencia). Se le quita a
-- authenticated el INSERT/UPDATE de fuera_del_hoyo (REVOKE de tabla + GRANT de las demás columnas, como estaban).

-- 1. ¿Ya hubo un golpe? Un score numérico o una X en cualquier tarjeta de la ronda. -----------------------------------
CREATE OR REPLACE FUNCTION public.ronda_libre_tiene_golpes(p_ronda_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ronda_libre_jugadores j
    WHERE j.ronda_id = p_ronda_id
      AND (
        j.fuera_del_hoyo <> '{}'::jsonb
        OR EXISTS (
          SELECT 1
          FROM jsonb_each(CASE WHEN jsonb_typeof(j.scores) = 'object' THEN j.scores ELSE '{}'::jsonb END) e
          WHERE jsonb_typeof(e.value) = 'number'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.ronda_libre_tiene_golpes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ronda_libre_tiene_golpes(uuid) TO service_role;

COMMENT ON FUNCTION public.ronda_libre_tiene_golpes(uuid) IS
  'Skins: true si alguna tarjeta de la ronda tiene un golpe anotado o una X. Desde ahí el skins queda congelado.';

-- 2. rondas_libres ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.skins_congelado_ronda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reglas_juego ? 'congelado' AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'SKINS_CONGELADO: los golpes del Skins los fija el servidor al crear la ronda.'
        USING ERRCODE = 'P0003';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.formato_juego IS DISTINCT FROM 'skins' AND NEW.formato_juego IS DISTINCT FROM 'skins' THEN
    RETURN NEW;
  END IF;

  -- Lo congelado solo lo cambia el servidor (corrección antes del primer golpe, que lo recalcula con la cancha).
  IF (OLD.reglas_juego -> 'congelado') IS DISTINCT FROM (NEW.reglas_juego -> 'congelado')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SKINS_CONGELADO: los golpes del Skins los fija el servidor al crear la ronda.'
      USING ERRCODE = 'P0003';
  END IF;

  IF NEW.reglas_juego IS NOT DISTINCT FROM OLD.reglas_juego
     AND NEW.hcp_pct IS NOT DISTINCT FROM OLD.hcp_pct
     AND NEW.modo_juego IS NOT DISTINCT FROM OLD.modo_juego
     AND NEW.tees IS NOT DISTINCT FROM OLD.tees
     AND NEW.course_id IS NOT DISTINCT FROM OLD.course_id
     AND NEW.recorridos IS NOT DISTINCT FROM OLD.recorridos
     AND NEW.holes IS NOT DISTINCT FROM OLD.holes
     AND NEW.hoyo_inicio IS NOT DISTINCT FROM OLD.hoyo_inicio
     AND NEW.formato_juego IS NOT DISTINCT FROM OLD.formato_juego THEN
    RETURN NEW;
  END IF;

  -- La fila ya está bloqueada (BEFORE UPDATE): un golpe en vuelo (upsert_ronda_libre_scores toma la ronda FOR SHARE)
  -- terminó antes de llegar acá, y esta consulta lo ve.
  IF public.ronda_libre_tiene_golpes(OLD.id) THEN
    RAISE EXCEPTION 'SKINS_CONGELADO: el Skins ya empezó. Desde el primer golpe no se cambian las reglas, la cancha ni los hoyos.'
      USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skins_congelado_ronda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS skins_congelado_tras_el_primer_golpe ON public.rondas_libres;
CREATE TRIGGER skins_congelado_tras_el_primer_golpe
  BEFORE INSERT OR UPDATE OF reglas_juego, hcp_pct, modo_juego, tees, course_id, recorridos, holes, hoyo_inicio, formato_juego
  ON public.rondas_libres
  FOR EACH ROW EXECUTE FUNCTION public.skins_congelado_ronda();

-- 3. ronda_libre_jugadores ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.skins_congelado_jugador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ronda uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.handicap IS NOT DISTINCT FROM OLD.handicap
     AND NEW.tees IS NOT DISTINCT FROM OLD.tees
     AND NEW.ronda_id IS NOT DISTINCT FROM OLD.ronda_id THEN
    RETURN NEW;
  END IF;

  FOREACH v_ronda IN ARRAY ARRAY[NEW.ronda_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.ronda_id END] LOOP
    CONTINUE WHEN v_ronda IS NULL;
    -- Solo el skins. FOR UPDATE espera a un golpe en vuelo (que toma la ronda FOR SHARE) y la consulta siguiente lo ve.
    PERFORM 1 FROM public.rondas_libres rl WHERE rl.id = v_ronda AND rl.formato_juego = 'skins' FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    IF public.ronda_libre_tiene_golpes(v_ronda) THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'SKINS_CONGELADO: el Skins ya empezó. Solo se suman jugadores antes del primer golpe.'
          USING ERRCODE = 'P0003';
      END IF;
      RAISE EXCEPTION 'SKINS_CONGELADO: el Skins ya empezó. Desde el primer golpe no se cambian índices ni tees.'
        USING ERRCODE = 'P0003';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skins_congelado_jugador() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS skins_congelado_tras_el_primer_golpe ON public.ronda_libre_jugadores;
CREATE TRIGGER skins_congelado_tras_el_primer_golpe
  BEFORE INSERT OR UPDATE OF handicap, tees, ronda_id
  ON public.ronda_libre_jugadores
  FOR EACH ROW EXECUTE FUNCTION public.skins_congelado_jugador();

-- 4. La X solo por su RPC ------------------------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.ronda_libre_jugadores FROM authenticated;
GRANT INSERT (
  id, ronda_id, nombre, user_id, scores, created_at, nombre_invitado, telefono_invitado, is_guest, tarjeta_aceptada,
  pending_user_id, handicap, tees, perfil_sugerido_id, handicap_de_inscripcion, updated_at
) ON public.ronda_libre_jugadores TO authenticated;
GRANT UPDATE (
  id, ronda_id, nombre, user_id, scores, created_at, nombre_invitado, telefono_invitado, is_guest, tarjeta_aceptada,
  pending_user_id, handicap, tees, perfil_sugerido_id, handicap_de_inscripcion, updated_at
) ON public.ronda_libre_jugadores TO authenticated;
