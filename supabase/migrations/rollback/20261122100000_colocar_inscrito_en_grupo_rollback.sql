-- ROLLBACK de 20261122100000_colocar_inscrito_en_grupo.sql: quita la RPC de gestión en juego (#814) y su helper
-- de anotaciones, y deja el comentario de la guarda de grupos fijos como estaba (sin comentario). No toca datos: lo
-- que la RPC ya movió, agregó o borró queda como está (cada escritura dejó el enlace inscrito-fila-tarjeta íntegro).
--
-- ANTES de correrlo: el código que llama la RPC (PR3, src/lib/data/tournaments/colocarInscrito.ts y sus rutas)
-- tiene que estar fuera de prod, o esas rutas caen con 42883.
--
-- Vive en rollback/ para que el CLI de Supabase NUNCA lo tome como migración.
DROP FUNCTION IF EXISTS public.colocar_inscrito_en_grupo(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.tarjeta_tiene_anotaciones(jsonb);
COMMENT ON FUNCTION public.grupos_fijos_guard_jugadores_de_grupo() IS NULL;
