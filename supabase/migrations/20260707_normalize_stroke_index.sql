-- 2026-07-07 — Normaliza el stroke_index del catálogo a permutación válida 1..N por cancha.
--
-- CAUSA RAÍZ (bug de campo "net +12 Don Jorge", inbox e6408e3c, 24-jun-2026):
-- muchas canchas chilenas tenían el stroke_index de course_holes con DUPLICADOS y
-- HUECOS (ej. Los Leones: dups 10/14/15, faltan 3/6/12). `strokesRecibidosEnHoyo`
-- reparte los golpes de hándicap por SI; si el SI no es una permutación 1..N, los
-- hoyos con SI bajo faltantes NO reciben su golpe extra → el net 18h aloca MENOS
-- golpes que el course handicap (Don Jorge: CH 25 pero solo 23 alocados → net +12
-- en vez de +10). Afecta TODOS los caminos de net/stableford porque todos leen
-- course_holes.stroke_index (leaderboard, tarjeta compartir, anotador, formatos por
-- equipo, leaderboards de torneo).
--
-- FIX: rank-normalizar el SI por (SI crudo asc, número de hoyo asc) → permutación
-- válida 1..N. MISMO tie-break que `normalizeStrokeIndexMap` (src/golf/core/stroke-index.ts),
-- que hace la normalización en runtime como defense-in-depth.
-- Preserva el orden de dificultad existente; tie-break determinista por
-- número de hoyo. Idempotente: una cancha ya válida no cambia. Solo toca canchas con
-- 1 fila por hoyo (las de filas duplicadas por numero son otro problema del guard de
-- pares #239, fuera de alcance). El SI verdadero por hoyo (qué hoyo es el más difícil)
-- se refina aparte desde FedeGolf; esta migración garantiza el INVARIANTE de golpes.
--
-- Reversible: guarda el SI anterior en course_holes_si_backup.

begin;

create table if not exists course_holes_si_backup (
  course_id     uuid    not null,
  numero        int     not null,
  old_stroke_index int,
  new_stroke_index int,
  migrated_at   timestamptz not null default now(),
  primary key (course_id, numero, migrated_at)
);

with shape as (
  select course_id, count(*) as n_rows, count(distinct numero) as n_dist
  from course_holes group by course_id
),
valid_shape as ( select course_id from shape where n_rows = n_dist ),
ranked as (
  select ch.course_id, ch.numero, ch.stroke_index as old_si,
         row_number() over (partition by ch.course_id
             order by (ch.stroke_index is null), ch.stroke_index, ch.numero) as new_si
  from course_holes ch
  join valid_shape v on v.course_id = ch.course_id
),
changed as (
  select * from ranked where old_si is distinct from new_si
)
-- 1) Backup de las filas que van a cambiar.
insert into course_holes_si_backup (course_id, numero, old_stroke_index, new_stroke_index)
select course_id, numero, old_si, new_si from changed;

-- 2) Aplicar la normalización.
with shape as (
  select course_id, count(*) as n_rows, count(distinct numero) as n_dist
  from course_holes group by course_id
),
valid_shape as ( select course_id from shape where n_rows = n_dist ),
ranked as (
  select ch.course_id, ch.numero, ch.stroke_index as old_si,
         row_number() over (partition by ch.course_id
             order by (ch.stroke_index is null), ch.stroke_index, ch.numero) as new_si
  from course_holes ch
  join valid_shape v on v.course_id = ch.course_id
)
update course_holes ch
set stroke_index = r.new_si
from ranked r
where ch.course_id = r.course_id
  and ch.numero = r.numero
  and ch.stroke_index is distinct from r.new_si;

commit;
