-- Rollback de 20261117020000_timba_probadores.sql: la Timba vuelve a ser solo de admins.
-- ⚠️ Va ANTES que el rollback de 20261027180000 (que borra usuario_es_admin(), de la que depende la función de acá
-- sin dependencia registrada). Una Timba en curso de un probador queda sin poder editarse por UPDATE directo
-- (las RPC de marcar y finalizar siguen funcionando: no miran este permiso).

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_es_admin());

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres
  AS RESTRICTIVE FOR UPDATE TO public
  USING (true)
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_es_admin());

DROP FUNCTION IF EXISTS public.usuario_puede_crear_timba();
DROP TABLE IF EXISTS public.timba_probadores;
