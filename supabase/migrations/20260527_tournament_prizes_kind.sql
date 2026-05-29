-- 20260527_tournament_prizes_kind.sql
--
-- Agrega columna `kind` a `tournament_prizes` para distinguir premios
-- gross vs neto en torneos amateurs (típico: 1° y 2° Gross + 1° y 2° Neto).
--
-- Antes: el premio "1° lugar" implícitamente seguía el `modo_juego` del
-- torneo (gross XOR neto). Ahora se permite definir explícitamente la
-- escala del premio, ortogonal al modo del torneo.
--
-- NULL = sin distinción (default para premios existentes y para tipos
-- que no son `category_position` — closest_to_pin, long_drive, special).

ALTER TABLE public.tournament_prizes
  ADD COLUMN IF NOT EXISTS kind TEXT
    CHECK (kind IN ('gross', 'neto'));

COMMENT ON COLUMN public.tournament_prizes.kind IS
  'Escala del premio: gross (strokes brutos), neto (con handicap), o NULL para premios no ranking-based (closest_to_pin, long_drive, special). Independiente de tournaments.modo_juego.';
