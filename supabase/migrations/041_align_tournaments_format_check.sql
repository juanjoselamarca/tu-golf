-- supabase/migrations/041_align_tournaments_format_check.sql
-- Alinea la check constraint vieja tournaments_format_check con tournaments_formato_juego_check.
-- Hasta ahora `format` solo aceptaba stroke_play | stableford | match_play, mientras que
-- `formato_juego` (más nueva) aceptaba los 6 formatos. El nuevo flow "Organizar Campeonato"
-- inserta el mismo valor en ambas columnas para mantener retrocompatibilidad — sin este fix,
-- crear un torneo de best_ball/scramble/foursome explota con violación de check constraint.

alter table public.tournaments
  drop constraint if exists tournaments_format_check;

alter table public.tournaments
  add constraint tournaments_format_check
  check (format = any (array[
    'stroke_play'::text,
    'stableford'::text,
    'match_play'::text,
    'best_ball'::text,
    'scramble'::text,
    'foursome'::text
  ]));
