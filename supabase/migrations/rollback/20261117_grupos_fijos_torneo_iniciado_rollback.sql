-- Rollback de 20261117120000_grupos_fijos_torneo_iniciado.sql: la base vuelve a dejar que el cliente del
-- organizador mueva, saque y borre grupos con el torneo en juego. La UI sigue bloqueándolo (`gruposFijos`), pero
-- una pestaña vieja o una llamada directa vuelve a poder dejar tarjetas huérfanas (#810).

DROP TRIGGER IF EXISTS grupos_fijos_jugadores_de_grupo ON public.tournament_group_players;
DROP TRIGGER IF EXISTS grupos_fijos_grupo ON public.tournament_groups;
DROP TRIGGER IF EXISTS grupos_fijos_inscrito ON public.players;

DROP FUNCTION IF EXISTS public.grupos_fijos_guard_jugadores_de_grupo();
DROP FUNCTION IF EXISTS public.grupos_fijos_guard_grupo();
DROP FUNCTION IF EXISTS public.grupos_fijos_guard_inscrito();
DROP FUNCTION IF EXISTS public.torneo_con_grupos_fijos(uuid);
