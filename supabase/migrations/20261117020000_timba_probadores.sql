-- Timba libre: probadores (decisión de Juanjo, 17-nov-2026). La Timba se abre solo a una lista explícita de
-- cuentas, sin darles el rol admin (que trae el panel de admin y todo lo demás). Hoy: solo Juanjo.
-- Agregar a alguien = una migración nueva con su INSERT.
--
-- Fuente única en la base del permiso de crear una Timba: `usuario_puede_crear_timba()` = admin O probador. Las
-- dos guardas RESTRICTIVE de rondas_libres pasan a llamarla. En la app, el espejo es
-- `puedeCrearJuegoPersonalizado` (src/lib/auth/juego-personalizado.ts), que lee la misma tabla.

-- 1. Lista de probadores (privada: la lee solo el servidor y la función de abajo) -------------------------------
CREATE TABLE IF NOT EXISTS public.timba_probadores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timba_probadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.timba_probadores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timba_probadores TO service_role;

COMMENT ON TABLE public.timba_probadores IS
  'Cuentas que pueden crear una Timba libre (formato personalizado) sin ser admin. Privada; la lee usuario_puede_crear_timba() y el servidor.';

-- Juanjo (juanjoselamarca). Si la cuenta no existe en este entorno (base de pruebas), no inserta nada.
INSERT INTO public.timba_probadores (user_id)
SELECT u.id FROM auth.users u WHERE u.id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
ON CONFLICT (user_id) DO NOTHING;

-- 2. Permiso: admin o probador -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_puede_crear_timba()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (public.usuario_es_admin()
          OR EXISTS (SELECT 1 FROM public.timba_probadores t WHERE t.user_id = auth.uid()));
$function$;

REVOKE ALL ON FUNCTION public.usuario_puede_crear_timba() FROM PUBLIC, anon, authenticated;
-- anon también, por la misma razón que usuario_es_admin(): las guardas son TO public y el EXECUTE se chequea al
-- planificar. Para anon devuelve false sin leer nada (auth.uid() es null).
GRANT EXECUTE ON FUNCTION public.usuario_puede_crear_timba() TO anon, authenticated, service_role;

-- 3. Las guardas de rondas_libres usan el permiso nuevo ----------------------------------------------------------
-- El nombre "…_solo_admin_…" es histórico: se conserva para no romper los canarios que las listan.
DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_puede_crear_timba());

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres
  AS RESTRICTIVE FOR UPDATE TO public
  USING (true)
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_puede_crear_timba());
