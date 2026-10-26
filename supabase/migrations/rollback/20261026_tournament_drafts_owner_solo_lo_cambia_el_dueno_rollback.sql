-- Rollback de 20261026000000_tournament_drafts_owner_solo_lo_cambia_el_dueno.sql.
-- Reabre el hueco: un colaborador vuelve a poder cambiar owner_id de un borrador, y
-- /api/torneos/draft/[id]/transfer-ownership deja de actualizar los roles de los colaboradores.
-- No pierde datos (los roles ya sincronizados quedan como están).

DROP TRIGGER IF EXISTS trg_tournament_drafts_owner_change ON public.tournament_drafts;
DROP FUNCTION IF EXISTS public.guard_tournament_drafts_owner_change();
-- Las filas de dueño que agregó el backfill se dejan: es el estado que las rutas de creación ya buscaban.
