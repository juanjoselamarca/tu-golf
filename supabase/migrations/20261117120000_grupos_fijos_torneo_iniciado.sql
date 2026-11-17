-- Con el torneo iniciado, los grupos quedan fijos también en la base (#810).
--
-- Por qué: desde el inicio (`startTournament`) cada grupo tiene su tarjeta (`tournament_groups.ronda_libre_id`) y
-- cada inscrito está enlazado a su fila (`tournament_group_players.jugador_ronda_id`). El board del torneo, el de
-- equipos, la página en vivo y el cierre llegan a las tarjetas SOLO por `tournament_groups.ronda_libre_id`
-- (`rondas_libres` no tiene columna de torneo). Entonces:
--   · borrar un grupo con tarjeta la deja huérfana: el board pierde a todo el grupo con sus golpes y el cierre
--     nunca la finaliza;
--   · mover a un jugador (DELETE + INSERT en tournament_group_players) lo recrea sin `jugador_ronda_id`: su
--     "Anotar mi score" lleva a la tarjeta de otro grupo, donde no tiene fila.
-- La policy "Organizer manage tournament_group_players" es FOR ALL sin mirar el estado, así que cualquier pestaña
-- del organizador abierta antes del inicio (o una llamada directa con su JWT) podía hacerlo. La UI ya lo bloquea
-- (`gruposFijos`, src/golf/tournament-status.ts); esto lo hace imposible desde el cliente.
--
-- Por qué trigger y no RLS: con una policy, el DELETE de `assignPlayerToGroup` afectaría 0 filas en silencio y el
-- INSERT siguiente metería al jugador en un segundo grupo. El trigger corta con error y no escribe nada.
--
-- A quién bloquea: solo a los roles del cliente (`anon`, `authenticated`). service_role (inicio, rollback del
-- inicio, cancelar torneo, /api/admin) y postgres (migraciones, mantenimiento) quedan exentos.
--
-- "Grupos fijos" = mismo predicado que `gruposFijos` en TypeScript: el torneo ya no está en draft/open, o algún
-- grupo del torneo ya tiene tarjeta. Bloquea:
--   · tournament_group_players: INSERT, UPDATE y DELETE en un torneo con grupos fijos;
--   · tournament_groups: DELETE de un grupo con tarjeta o con jugadores, y cambiar `ronda_libre_id` o
--     `tournament_id` (nombre y horario de salida se siguen editando; un grupo vacío y sin tarjeta se borra);
--   · players: DELETE de un inscrito (en juego se retira con WD por /api/game, que conserva sus golpes).
--
-- Prueba: scripts/ci/pruebas-sql/grupos-fijos-torneo-iniciado.sql.
-- Idempotente. Rollback: supabase/migrations/rollback/20261117_grupos_fijos_torneo_iniciado_rollback.sql

-- ── Predicado ────────────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER para leer el estado sin depender de lo que RLS le muestre al que escribe. Devuelve solo un
-- booleano sobre un torneo; no expone filas.
CREATE OR REPLACE FUNCTION public.torneo_con_grupos_fijos(p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.tournaments t
            WHERE t.id = p_tournament_id
              AND COALESCE(t.status, '') NOT IN ('draft', 'open')
         )
      OR EXISTS (
           SELECT 1 FROM public.tournament_groups g
            WHERE g.tournament_id = p_tournament_id
              AND g.ronda_libre_id IS NOT NULL
         );
$$;

REVOKE ALL ON FUNCTION public.torneo_con_grupos_fijos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.torneo_con_grupos_fijos(uuid) TO authenticated, service_role;

-- ── Guardas (SECURITY INVOKER: miran current_user, el rol de quien escribe) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.grupos_fijos_guard_jugadores_de_grupo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_fijo boolean := false;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT public.torneo_con_grupos_fijos(g.tournament_id) INTO v_fijo
      FROM public.tournament_groups g WHERE g.id = OLD.group_id;
  END IF;
  IF NOT COALESCE(v_fijo, false) AND TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT public.torneo_con_grupos_fijos(g.tournament_id) INTO v_fijo
      FROM public.tournament_groups g WHERE g.id = NEW.group_id;
  END IF;

  IF COALESCE(v_fijo, false) THEN
    RAISE EXCEPTION 'El torneo ya empezó: los grupos quedan fijos'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.grupos_fijos_guard_grupo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT COALESCE(public.torneo_con_grupos_fijos(OLD.tournament_id), false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.ronda_libre_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.tournament_group_players gp WHERE gp.group_id = OLD.id) THEN
      RAISE EXCEPTION 'El torneo ya empezó: los grupos quedan fijos'
        USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.ronda_libre_id IS DISTINCT FROM OLD.ronda_libre_id
     OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id THEN
    RAISE EXCEPTION 'El torneo ya empezó: los grupos quedan fijos'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.grupos_fijos_guard_inscrito()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND COALESCE(public.torneo_con_grupos_fijos(OLD.tournament_id), false) THEN
    RAISE EXCEPTION 'El torneo ya empezó: retira al jugador con WD'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN OLD;
END;
$$;

-- Las funciones de trigger no se llaman directo: sin EXECUTE para nadie del cliente.
REVOKE ALL ON FUNCTION public.grupos_fijos_guard_jugadores_de_grupo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grupos_fijos_guard_grupo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grupos_fijos_guard_inscrito() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS grupos_fijos_jugadores_de_grupo ON public.tournament_group_players;
CREATE TRIGGER grupos_fijos_jugadores_de_grupo
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_group_players
  FOR EACH ROW EXECUTE FUNCTION public.grupos_fijos_guard_jugadores_de_grupo();

DROP TRIGGER IF EXISTS grupos_fijos_grupo ON public.tournament_groups;
CREATE TRIGGER grupos_fijos_grupo
  BEFORE UPDATE OR DELETE ON public.tournament_groups
  FOR EACH ROW EXECUTE FUNCTION public.grupos_fijos_guard_grupo();

DROP TRIGGER IF EXISTS grupos_fijos_inscrito ON public.players;
CREATE TRIGGER grupos_fijos_inscrito
  BEFORE DELETE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.grupos_fijos_guard_inscrito();
