-- FedeGolf Fase 1b (plan docs/superpowers/plans/2026-10-19-fedegolf-integracion.md): SOLO schema, aditivo.
--
-- Va en un PR propio, antes del código que lo usa: Vercel publica el código al mergear, pero esta
-- migración se aplica después (workflow migraciones-prod, con aprobación). Si el código llegara
-- primero, sus SELECT de columnas nuevas fallarían en prod en ese intervalo.
--
--   1. notification_preferences.indice_cambios: el usuario decide si recibe un push cuando el cron
--      diario detecta que FedeGolf cambió su índice. Default true (el aviso es el valor del vínculo).
--   2. fedegolf_credentials.sin_indice_desde: desde cuándo FedeGolf responde "sin índice vigente"
--      ({"indice":"100.0"}) para el RUT. Se conserva el último índice conocido, pero la UI deja de
--      rotularlo "Oficial USGA" y el botón Actualizar no dice "Ya está actualizado". NULL = vigente.
--   3. rate_limit_hits + rate_limit_hit(): freno de intentos persistente y atómico entre instancias.
--      El limitador en memoria (src/lib/rate-limit.ts) se reinicia en cada instancia de Vercel: no
--      sirve para frenar intentos de clave en /api/fedegolf/vincular ni reintentos contra fedegolf.cl.
--      Privada: solo service role.
--
-- Rollback: supabase/migrations/rollback/20261019_fedegolf_1b_avisos_y_rate_limit_rollback.sql

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS indice_cambios boolean NOT NULL DEFAULT true;

ALTER TABLE public.fedegolf_credentials
  ADD COLUMN IF NOT EXISTS sin_indice_desde timestamptz;

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key      text        PRIMARY KEY,
  count    integer     NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_reset_at_idx ON public.rate_limit_hits (reset_at);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_hits FROM PUBLIC, anon, authenticated;

-- Cuenta un intento contra `p_key` en una ventana fija de `p_window_ms`. Atómico (un solo
-- INSERT ... ON CONFLICT): dos instancias a la vez nunca ven el mismo conteo.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_ms integer)
 RETURNS TABLE (permitido boolean, restantes integer, reinicia_en timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_max IS NULL OR p_max < 1 OR p_window_ms IS NULL OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'rate_limit_hit: parámetros inválidos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rate_limit_hits AS r (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.count + 1 END,
    reset_at = CASE WHEN r.reset_at <= now() THEN EXCLUDED.reset_at ELSE r.reset_at END
  RETURNING r.count, r.reset_at INTO v_count, v_reset;

  -- Limpieza oportunista de ventanas vencidas hace más de un día (índice por reset_at): la tabla no
  -- crece sin techo y no hace falta un cron aparte. ~1 de cada 100 llamadas.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE reset_at < now() - interval '1 day';
  END IF;

  RETURN QUERY SELECT v_count <= p_max, greatest(0, p_max - v_count), v_reset;
END;
$function$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;
