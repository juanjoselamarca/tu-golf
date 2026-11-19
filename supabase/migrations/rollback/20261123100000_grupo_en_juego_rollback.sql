-- ROLLBACK de 20261123100000_grupo_en_juego.sql: quita las RPC de grupo nuevo y de borrar grupo con el torneo en
-- juego (#814 · PR4). No toca datos: los grupos que ya se crearon quedan con su tarjeta (vacía o con los jugadores
-- que `colocar_inscrito_en_grupo` les puso) y los borrados no vuelven.
--
-- ANTES de correrlo: el código que llama estas RPC (src/lib/data/tournaments/grupoEnJuego.ts y las rutas
-- /api/torneos/[slug]/grupos) tiene que estar fuera de prod, o esas rutas caen con 42883.
--
-- Vive en rollback/ para que el CLI de Supabase NUNCA lo tome como migración.
DROP FUNCTION IF EXISTS public.crear_grupo_en_juego(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.borrar_grupo_en_juego(uuid, uuid);
