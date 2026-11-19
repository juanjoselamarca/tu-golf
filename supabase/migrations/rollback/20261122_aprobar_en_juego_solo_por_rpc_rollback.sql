-- Rollback de 20261122110000_aprobar_en_juego_solo_por_rpc.sql: el cliente del organizador vuelve a poder aprobar a
-- un inscrito con el torneo en juego sin pasar por colocar_inscrito_en_grupo (sin cupo ni hándicap de equipo).

DROP TRIGGER IF EXISTS aprobar_en_juego ON public.players;
DROP FUNCTION IF EXISTS public.aprobar_en_juego_guard();
