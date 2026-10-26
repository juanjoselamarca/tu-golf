-- Perfil de Golfers+ que el creador eligió para un rival de su ronda libre (plan v3 UX, entrega 1).
-- SOLO schema, aditivo.
--
-- Va en un PR propio, ANTES del código que la escribe: Vercel publica el código al mergear y esta
-- migración se aplica después (workflow migraciones-prod). Si el código llegara primero, el INSERT de
-- jugadores en POST /api/ronda-libre/create fallaría con 42703 y no se podría crear ninguna ronda con un
-- rival elegido de la lista — docs/CONVENCIONES_TECNICAS.md ("Migración antes que el código").
--
-- Por qué NO se usa user_id: el user_id de una tarjeta le da poderes a esa cuenta — anotar la ronda
-- (puede_anotar_ronda), recibir sus avisos push, leer su índice desde el perfil, guardarla en su
-- historial y que cuente para calcular_indice_golfers. #581 (17-oct) dejó en null el user_id de todos
-- los rivales porque el creador podía meter la ronda y sus avisos en la cuenta de cualquier usuario.
-- Esta columna es SOLO una referencia para aprender del uso (p. ej. el último tee de ese jugador en esa
-- cancha): ninguna función, policy ni lector de permisos/push/índice/historial la lee, y lo fija
-- src/__tests__/perfil-sugerido-sin-poderes.test.ts.
--
-- Privada: anon y authenticated tienen SELECT por columna sobre ronda_libre_jugadores (baseline), y esta
-- columna NO se agrega a esa lista (con quién juega alguien no se expone a cualquier visor). El INSERT
-- ya es por tabla, así que el route handler la puede escribir sin grants nuevos.
--
-- ON DELETE SET NULL: eliminar_cuenta borra auth.users → profiles en cascada y la sugerencia se apaga sola.
--
-- Rollback: supabase/migrations/rollback/20261026_ronda_libre_jugadores_perfil_sugerido_rollback.sql

ALTER TABLE public.ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS perfil_sugerido_id uuid NULL
  REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ronda_libre_jugadores.perfil_sugerido_id IS
  'Perfil que el creador eligió para este rival. Solo referencia (aprender del uso): NO da permisos, avisos, índice ni historial; eso es user_id, que para un rival sigue en null (#581).';

-- Declaración explícita de que la falta de GRANT SELECT es a propósito (no-op en Postgres: la columna
-- nace sin SELECT para esos roles). La lee canary-column-select.test.ts, que impide que una migración
-- posterior la abra.
REVOKE SELECT (perfil_sugerido_id) ON public.ronda_libre_jugadores FROM PUBLIC, anon, authenticated;

-- Parcial: casi todas las filas quedan en null. Sirve al ON DELETE SET NULL (borrar un perfil no
-- recorre la tabla) y a "las rondas en que alguien fue elegido como rival".
CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_perfil_sugerido_id
  ON public.ronda_libre_jugadores (perfil_sugerido_id)
  WHERE perfil_sugerido_id IS NOT NULL;
