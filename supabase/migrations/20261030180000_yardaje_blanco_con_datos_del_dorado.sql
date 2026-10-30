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
-- GUARDAS DEL UPDATE (las tres se exigen juntas):
--   1. la cancha tiene un tee dorado Y un tee blanco con totales DISTINTOS,
--   2. la suma de `yardaje_blanco` es exactamente el total del dorado,
--   3. la cancha no tiene NINGÚN hoyo auditado.
-- Una cancha cuyo blanco mida lo mismo que su dorado no entra por (1), y una
-- ya auditada no entra por (3).

update course_holes h
set yardaje_blanco = null
where h.course_id in (
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
)
and h.yardaje_blanco is not null;
