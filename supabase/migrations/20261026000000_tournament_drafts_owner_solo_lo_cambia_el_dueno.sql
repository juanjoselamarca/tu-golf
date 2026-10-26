-- Solo el dueño de un borrador de torneo puede cambiar tournament_drafts.owner_id, y al hacerlo los
-- roles de tournament_draft_collaborators quedan bien en la misma transacción.
--
-- Hueco que cierra: la policy tournament_drafts_update deja actualizar al dueño O a cualquier
-- colaborador, sin WITH CHECK propio (se reusa el USING sobre la fila nueva) y authenticated tiene
-- UPDATE sobre owner_id. Un colaborador podía, con su JWT y PATCH directo a /rest/v1/tournament_drafts,
-- ponerse como dueño (o poner a cualquier usuario) y quedarse con lo que la API reserva al dueño:
-- crear el torneo, archivar, link para compartir, invitar admins y borrar el borrador.
-- Verificado el 26-oct-2026 leyendo pg_policies y los grants de prod. Hoy no hay colaboradores reales
-- (las 262 filas de tournament_draft_collaborators son role='owner'), así que nadie lo usó.
--
-- De paso arregla /api/torneos/draft/[id]/transfer-ownership: cambiaba los roles con el cliente del
-- usuario, pero tournament_draft_collaborators no tiene policy de UPDATE y esos updates afectaban 0 filas.
-- Ahora los roles los deja este trigger (SECURITY DEFINER) y la ruta solo cambia owner_id.
--
-- Service role y conexiones directas (migraciones, soporte) pasan la guarda, igual que
-- calcular_indice_golfers y eliminar_cuenta; los roles se sincronizan igual.
-- No cambia policies ni grants: cualquier otra edición del borrador por un colaborador sigue igual.
--
-- Rollback: supabase/migrations/rollback/20261026_tournament_drafts_owner_solo_lo_cambia_el_dueno_rollback.sql

CREATE OR REPLACE FUNCTION public.guard_tournament_drafts_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_privilegiado boolean := COALESCE(auth.role(), '') = 'service_role' OR session_user <> 'authenticator';
BEGIN
  IF NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;

  IF NOT v_privilegiado THEN
    IF v_uid IS NULL OR v_uid IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'FORBIDDEN: solo el dueño del borrador puede transferirlo' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_draft_collaborators
      WHERE draft_id = NEW.id AND user_id = NEW.owner_id
    ) THEN
      RAISE EXCEPTION 'el nuevo dueño debe ser colaborador del borrador' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.tournament_draft_collaborators
     SET role = 'collaborator'
   WHERE draft_id = NEW.id AND user_id = OLD.owner_id;

  INSERT INTO public.tournament_draft_collaborators (draft_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', OLD.owner_id)
  ON CONFLICT (draft_id, user_id) DO UPDATE SET role = 'owner';

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_tournament_drafts_owner_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tournament_drafts_owner_change ON public.tournament_drafts;
CREATE TRIGGER trg_tournament_drafts_owner_change
  BEFORE UPDATE OF owner_id ON public.tournament_drafts
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_drafts_owner_change();
