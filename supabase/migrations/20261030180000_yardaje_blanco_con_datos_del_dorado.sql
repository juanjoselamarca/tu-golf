-- Limpia la columna `yardaje_blanco` en las canchas donde guarda, hoyo por
-- hoyo, las yardas del tee DORADO.
--
-- CAUSA RAÍZ (ya corregida en el código, en el mismo PR): la ingesta
-- `src/scripts/sync-courses-unified.ts` mapeaba 'gold'/'dorado'/'yellow'/
-- 'amarillo' a `yardaje_blanco` porque `course_holes` solo tiene cuatro
-- columnas de yardaje (negras, azul, blanco, rojo) y el catálogo tiene diez
-- colores. El tee dorado pisó al blanco: en 10 canchas activas la suma de
-- `yardaje_blanco` da exactamente el `yardaje_total` del tee dorado y difiere
-- del tee blanco. Hacienda Chicureo (5.397 vs 6.161 del blanco), Marbella
-- Pacífico Sur - Andes Pro (DAMAS y VARONES), Cachagua y las seis
-- combinaciones de Las Brisas de Santo Domingo.
--
-- ALCANCE VERIFICADO (30-oct-2026): se corrió contra prod el canario
-- generalizado "¿alguna columna de yardaje suma exactamente el yardaje_total
-- de un tee de OTRO color?". Devuelve esas mismas 10 canchas (todas
-- dorado → blanco), ningún caso de 'amarillo' pese a que el mapeo viejo lo
-- mandaba al mismo lugar, y C.G. Sport Francés, donde negras y azul miden de
-- verdad lo mismo (6.916): coincidencia real, no entra por las guardas.
--
-- POR QUÉ A NULL Y NO AL VALOR CORRECTO: las yardas reales del blanco no están
-- en ninguna parte — el dorado las sobrescribió al importar. `null` es el dato
-- que tenemos: "no sabemos". Mostrar las del dorado como si fueran del blanco
-- es lo que hay que parar. Cuando se re-ingesten estas canchas con el mapeo ya
-- corregido, la columna se vuelve a llenar con lo que corresponde.
--
-- IMPACTO EN LO QUE VE EL USUARIO: ninguno hoy. El scorer y el snapshot solo
-- exponen yardajes con `yardaje_verificado_at`, y ninguno de estos hoyos está
-- auditado (0 de 180 al 30-oct-2026). Esto cierra la mina antes de que alguien
-- audite esas canchas y el error salga a la cancha.
--
-- POR QUÉ SE RESPALDA PRIMERO: el proyecto está en el plan free y Supabase no
-- hace ningún respaldo (`docs/claude/respaldos.md`). Estos 180 números son el
-- único yardaje hoyo-a-hoyo del dorado de esas 10 canchas que tenemos hoy; la
-- re-ingesta depende de que la API externa siga sirviéndolos. Así que el
-- UPDATE no borra nada que no quede guardado en la misma transacción.
--
-- El respaldo va en el schema `respaldos`, que PostgREST no expone (solo
-- `public`): ni anon ni authenticated pueden alcanzarlo por la API.
--
-- GUARDAS (se escriben UNA vez, en el select del respaldo; el UPDATE después
-- solo toca las filas que quedaron respaldadas, así no pueden divergir):
--   1. la cancha tiene un tee dorado Y un tee blanco con totales DISTINTOS,
--   2. la suma de `yardaje_blanco` es exactamente el total del dorado,
--   3. la cancha no tiene NINGÚN hoyo auditado.
-- Una cancha cuyo blanco mida lo mismo que su dorado no entra por (1), y una
-- ya auditada no entra por (3). Es idempotente: al re-correr, el respaldo ya
-- existe (no se recrea) y el UPDATE deja los mismos nulos.

create schema if not exists respaldos;
revoke all on schema respaldos from anon, authenticated;

create table if not exists respaldos.yardaje_blanco_dorado_20261030 as
select h.id, h.course_id, h.numero, h.recorrido, h.yardaje_blanco
from course_holes h
where h.yardaje_blanco is not null
  and h.course_id in (
    select c.id
    from courses c
    join (
      select course_id,
             sum(yardaje_blanco) as suma_blanco,
             count(*) filter (where yardaje_blanco is not null) as hoyos_blanco,
             count(*) filter (where yardaje_verificado_at is not null) as auditados
      from course_holes
      group by course_id
    ) s on s.course_id = c.id
    join (
      select course_id,
             max(yardaje_total) filter (where lower(nombre) like 'dorado%') as tee_dorado,
             max(yardaje_total) filter (where lower(nombre) like 'blanco%') as tee_blanco
      from course_tees
      group by course_id
    ) t on t.course_id = c.id
    where t.tee_dorado is not null
      and t.tee_blanco is not null
      and t.tee_dorado <> t.tee_blanco
      and s.hoyos_blanco >= 9
      and s.suma_blanco = t.tee_dorado
      and s.auditados = 0
  );

-- La llave primaria no es decorativa: `scripts/respaldo/restaurar.mjs` se niega a
-- restaurar una tabla sin PK ("restaurar a mano"), y `create table as select` no
-- hereda ninguna. `course_holes.id` es único, así que la PK es directa. (En el
-- mismo PR, `restaurar.mjs` además acepta el schema `respaldos`: antes su regex
-- de --tabla solo dejaba pasar `public.*` y `auth.*`, así que la PK sola no
-- alcanzaba para que el respaldo fuera restaurable.)
-- Va guardada porque `add primary key` no es idempotente (al re-correr tiraría
-- "multiple primary keys for table are not allowed" y abortaría la migración).
do $$
begin
  if not exists (
    select 1 from pg_index
    where indrelid = 'respaldos.yardaje_blanco_dorado_20261030'::regclass
      and indisprimary
  ) then
    alter table respaldos.yardaje_blanco_dorado_20261030 add primary key (id);
  end if;
end $$;

alter table respaldos.yardaje_blanco_dorado_20261030 enable row level security;
revoke all on respaldos.yardaje_blanco_dorado_20261030 from anon, authenticated;

comment on table respaldos.yardaje_blanco_dorado_20261030 is
  'Yardas que yardaje_blanco guardaba del tee dorado antes de anularlas (30-oct-2026, PR #697). Único origen de ese dato si la re-ingesta no lo recupera.';

update course_holes h
set yardaje_blanco = null
from respaldos.yardaje_blanco_dorado_20261030 r
where r.id = h.id
  and h.yardaje_blanco is not null;
