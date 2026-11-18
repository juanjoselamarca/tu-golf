-- Con el torneo en juego, un inscrito solo pasa a 'approved' por la RPC colocar_inscrito_en_grupo (#814 · PR3).
--
-- Por qué: aprobar en juego cambia quién compite en un grupo con tarjeta: el hándicap de equipo de bola compartida,
-- el cupo y las reglas de golpes (D1-D14) dependen de eso. La RPC lo hace bajo lock, valida el cupo (D12) y recalcula
-- el equipo. Pero `authenticated` tiene UPDATE sobre players y la policy "Organizador actualiza jugador" no mira el
-- estado: una pestaña vieja o una llamada directa con el JWT del organizador podía poner status = 'approved' y saltarse
-- todo eso. Este trigger lo corta con error, sin escribir.
--
-- A quién bloquea: anon, authenticated y service_role. Ningún camino de la app aprueba con service_role (las rutas
-- solo ponen WD/DQ); si alguno lo necesitara, debe pasar por la RPC. La RPC es SECURITY DEFINER y corre como su
-- dueño (postgres), así que queda exenta; postgres (migraciones, mantenimiento) también.
-- Qué NO bloquea: WD/DQ (salir de 'approved'), ni nada antes del inicio, ni el INSERT de una inscripción nueva
-- (`enroll_player` inscribe sin grupo; colocarlo en un grupo es la RPC).
--
-- "En juego" = `torneo_con_grupos_fijos()` (20261117120000), el mismo predicado de los otros guardas.
-- Prueba: scripts/ci/pruebas-sql/aprobar-en-juego-solo-por-rpc.sql.
-- Idempotente. Rollback: supabase/migrations/rollback/20261122_aprobar_en_juego_solo_por_rpc_rollback.sql

CREATE OR REPLACE FUNCTION public.aprobar_en_juego_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role')
     AND NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND COALESCE(public.torneo_con_grupos_fijos(NEW.tournament_id), false) THEN
    RAISE EXCEPTION 'El torneo ya empezó: asigna al jugador a un grupo para sumarlo'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN NEW;
END;
$$;

-- Las funciones de trigger no se llaman directo: sin EXECUTE para nadie del cliente.
REVOKE ALL ON FUNCTION public.aprobar_en_juego_guard() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aprobar_en_juego ON public.players;
CREATE TRIGGER aprobar_en_juego
  BEFORE UPDATE OF status ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.aprobar_en_juego_guard();
