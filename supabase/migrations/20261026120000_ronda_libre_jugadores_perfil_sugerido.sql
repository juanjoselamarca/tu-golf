-- Perfil de Golfers+ que el creador eligió para un rival de su ronda libre (plan v3 UX, entrega 1).
-- SOLO schema, aditivo.
--
-- Va en un PR propio, ANTES del código que la escribe: Vercel publica el código al mergear y esta
-- migración se aplica después (workflow migraciones-prod). Si el código llegara primero, el INSERT de
-- jugadores en POST /api/ronda-libre/create fallaría con 42703 y no se podría crear ninguna ronda con un
-- rival elegido de la lista — docs/CONVENCIONES_TECNICAS.md ("Migración antes que el código").
--
-- Por qué NO se usa user_id: el user_id de una tarjeta le da poderes a esa cuenta — anotar la ronda
-- (puede_anotar_ronda), recibir sus avisos push, leer su índice desde el perfil, guardarla en su
-- historial y que cuente para calcular_indice_golfers. #581 (17-oct) dejó en null el user_id de todos
-- los rivales porque el creador podía meter la ronda y sus avisos en la cuenta de cualquier usuario.
-- Esta columna es SOLO una referencia para aprender del uso (p. ej. el último tee de ese jugador en esa
-- cancha): ninguna función, policy ni lector de permisos/push/índice/historial la lee, y lo fija
-- src/__tests__/perfil-sugerido-sin-poderes.test.ts.
--
-- Privada: anon y authenticated tienen SELECT por columna sobre ronda_libre_jugadores (baseline), y esta
-- columna NO se agrega a esa lista (con quién juega alguien no se expone a cualquier visor). El INSERT
-- ya es por tabla, así que el route handler la puede escribir sin grants nuevos.
--
-- Escritura: el INSERT y el UPDATE de ronda_libre_jugadores son por tabla, así que cualquier sesión que
-- pueda escribir una fila (el creador, por RLS) puede poner aquí cualquier uuid de perfil por PATCH. La base
-- solo valida la FK: es un dato que escribe el creador y nunca se usa para nada que vea o afecte al perfil
-- apuntado.
--
-- Borrado de cuenta: ON DELETE SET NULL apaga la referencia cuando eliminar_cuenta borra auth.users →
-- profiles en cascada. Antes, eliminar_cuenta anonimiza el nombre de esas tarjetas (igual que las de
-- user_id en rondas ajenas): se redefine al final, copia EXACTA de la versión vigente (baseline
-- 20261019200001) más ese UPDATE. CREATE OR REPLACE conserva dueño y permisos (solo service_role).
--
-- Rollback: supabase/migrations/rollback/20261026_ronda_libre_jugadores_perfil_sugerido_rollback.sql

ALTER TABLE public.ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS perfil_sugerido_id uuid NULL
  REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ronda_libre_jugadores.perfil_sugerido_id IS
  'Perfil que el creador eligió para este rival. Dato que escribe el creador, sin validación en la base (solo la FK): nunca usarlo para nada que vea o afecte al perfil apuntado. NO da permisos, avisos, índice ni historial; eso es user_id, que para un rival sigue en null (#581).';

-- Declaración explícita de que la falta de GRANT SELECT es a propósito (no-op en Postgres: la columna
-- nace sin SELECT para esos roles). La lee canary-column-select.test.ts, que impide que una migración
-- posterior la abra.
REVOKE SELECT (perfil_sugerido_id) ON public.ronda_libre_jugadores FROM PUBLIC, anon, authenticated;

-- Parcial: casi todas las filas quedan en null. Sirve al ON DELETE SET NULL (borrar un perfil no
-- recorre la tabla) y a "las rondas en que alguien fue elegido como rival".
CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_perfil_sugerido_id
  ON public.ronda_libre_jugadores (perfil_sugerido_id)
  WHERE perfil_sugerido_id IS NOT NULL;

-- eliminar_cuenta: versión del baseline + anonimizar las tarjetas en que lo eligieron como rival.
CREATE OR REPLACE FUNCTION public.eliminar_cuenta(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueos text[] := ARRAY[]::text[];
  c_anonimo  CONSTANT text := 'Jugador eliminado';
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR session_user <> 'authenticator') THEN
    RAISE EXCEPTION 'FORBIDDEN: eliminar_cuenta solo corre con service role' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'eliminar_cuenta: p_user_id es obligatorio' USING ERRCODE = '22004';
  END IF;

  -- Idempotente: un reintento tras un éxito no es un error.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
  END IF;

  -- Candado antes de mirar: quien se inscriba en su torneo o se una a su ronda mientras tanto toma
  -- FOR KEY SHARE sobre la misma fila y espera; al seguir, los EXISTS de abajo ya lo ven.
  PERFORM 1 FROM tournaments WHERE organizer_id = p_user_id FOR UPDATE;
  PERFORM 1 FROM rondas_libres WHERE creador_id = p_user_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM tournaments t
    WHERE t.organizer_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM players pl
        WHERE pl.tournament_id = t.id
          AND pl.user_id IS DISTINCT FROM p_user_id
      )
  ) THEN
    v_bloqueos := v_bloqueos || 'organiza_torneos_con_otros';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rondas_libres r
    WHERE r.creador_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM ronda_libre_jugadores j
        WHERE j.ronda_id = r.id
          AND j.user_id IS NOT NULL
          AND j.user_id <> p_user_id
      )
  ) THEN
    v_bloqueos := v_bloqueos || 'creo_rondas_con_otros';
  END IF;

  IF array_length(v_bloqueos, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'bloqueos', to_jsonb(v_bloqueos));
  END IF;

  -- Sus sesiones del coach apuntan a sus rondas y torneos (NO ACTION).
  DELETE FROM taiger_sessions WHERE user_id = p_user_id;

  -- Sus torneos: sin otros jugadores (verificado arriba). Arrastra grupos, players, rounds y hole_scores.
  DELETE FROM tournaments WHERE organizer_id = p_user_id;

  -- Su tarjeta en rondas ajenas: se desvincula y se anonimiza, no se borra (best ball, match play y el
  -- grupo de un torneo ajeno dependen de esa fila).
  UPDATE ronda_libre_jugadores j
  SET    user_id = NULL, pending_user_id = NULL, nombre = c_anonimo,
         nombre_invitado = NULL, telefono_invitado = NULL
  WHERE  j.user_id = p_user_id
    AND  NOT EXISTS (SELECT 1 FROM rondas_libres r WHERE r.id = j.ronda_id AND r.creador_id = p_user_id);

  -- Su inscripción en torneos ajenos: igual (sus rounds/hole_scores sostienen el leaderboard y los
  -- premios). players exige user_id XOR pending_user_id (CHECK): queda como invitado con un id nuevo
  -- que nadie conoce, así que nadie puede reclamar esa tarjeta.
  UPDATE players
  SET    user_id = NULL, pending_user_id = gen_random_uuid(), player_name = c_anonimo
  WHERE  user_id = p_user_id OR pending_user_id = p_user_id;

  -- Reclamos pendientes a su nombre en rondas libres (sin FK): que no apunten a una cuenta que ya no existe.
  UPDATE ronda_libre_jugadores SET pending_user_id = NULL WHERE pending_user_id = p_user_id;

  -- Tarjetas en que un creador lo eligió como rival (perfil_sugerido_id): el nombre que tipeó el creador
  -- también es suyo y se anonimiza igual que su tarjeta en rondas ajenas. La referencia se apaga sola
  -- con el ON DELETE SET NULL al borrar el perfil.
  UPDATE ronda_libre_jugadores SET nombre = c_anonimo WHERE perfil_sugerido_id = p_user_id;

  -- Rondas ajenas que él administraba (rondas_libres.admin_user_id → auth.users es NO ACTION).
  UPDATE rondas_libres
  SET    admin_user_id = NULL, admin_mode = false
  WHERE  admin_user_id = p_user_id
    AND  creador_id IS DISTINCT FROM p_user_id;

  -- Las rondas libres que creó: sin otros usuarios (verificado arriba). Arrastra sus filas y las de
  -- sus invitados (ronda_libre_jugadores.user_id → profiles es NO ACTION).
  DELETE FROM rondas_libres WHERE creador_id = p_user_id;

  -- Arrastra profiles y todo lo que cuelga de profiles o de auth.users (CASCADE / SET NULL).
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
END;
$function$;

-- Permisos de la función, iguales al baseline (solo service_role la ejecuta): CREATE OR REPLACE los
-- conserva, pero se declaran para que canary-privado-por-defecto lo vea.
revoke all on function public.eliminar_cuenta(uuid) from public, anon, authenticated, service_role, postgres;
grant EXECUTE on function public.eliminar_cuenta(uuid) to postgres;
grant EXECUTE on function public.eliminar_cuenta(uuid) to service_role;
