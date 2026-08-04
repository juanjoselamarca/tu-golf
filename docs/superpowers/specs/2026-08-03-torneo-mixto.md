# Torneo mixto (damas + varones) — spec

**Fecha:** 3 de agosto de 2026
**Estado:** diseño listo, NO implementado
**Origen:** P0 #3 del tablero de la Máquina de Verdad (16-jul), único P0 vivo junto al #7

---

## El problema

Un torneo no puede tener hombres y mujeres. El organizador abre el desplegable de
tees de una jugadora y el tee rojo de damas no está en la lista: tiene que darle
un tee de varones (rating equivocado) o dejarla sin tee. Un padre-e-hija, o
cualquier categoría damas, no se puede correr bien.

**Causa:** `tournaments.course_id` apunta a UNA fila de `courses`, y
`useTees.ts:31` carga `.from('course_tees').eq('course_id', courseId)`. Como el
catálogo FedeGolf parte cada recorrido en dos filas — `(DAMAS)` y `(VARONES)` —
el `course_id` del torneo fija el género de todo el campo.

---

## Lo que dicen los datos (medido 3-ago-2026, prod)

| | |
|---|---|
| Filas con sufijo `(DAMAS)`/`(VARONES)` | 136 |
| Recorridos partidos en pareja D+V | 68 |
| Canchas YA mixtas (una fila, tees de ambos géneros) | 20 |
| Parejas con `course_holes` en AMBOS lados | 65 |
| Parejas sin `course_holes` en ninguno | 3 |
| Torneos apuntando a una fila con sufijo de género | 5 |
| Rondas libres apuntando a una fila con sufijo | 22 |

### El dato que define el diseño

De las 65 parejas con datos por hoyo:

| | Idénticos | **Difieren** |
|---|---|---|
| **Par** por hoyo | 62 | **3** |
| **Stroke index** por hoyo | 52 | **13** |

**El stroke index difiere por género en 1 de cada 5 recorridos.**

Esto no es suciedad de catálogo: es legítimo. Un hoyo medio-largo es par 4 para
varones y par 5 para damas (umbral USGA distinto), y el orden de dificultad se
recalcula sobre el par de cada género. Ya estaba documentado en la memoria
`feedback_canchas_damas_varones` desde el 3-jul-2026: *"Solo el nº de hoyos y el
layout físico son invariantes; par / SI / yardaje NO."*

---

## Decisión: LINKEAR, no fusionar

La intuición inicial (2-ago) era fusionar los 68 recorridos en una ficha cada
uno. **Los datos la descartan:** una sola fila de `course_holes` por recorrido
borraría el stroke index específico de un género en 13 canchas y el par en 3.
El neto de todas las jugadoras de esas canchas saldría mal — exactamente la
clase de bug silencioso que veníamos matando.

Además, fusionar obliga a repuntar 27 referencias reales (5 torneos + 22 rondas
libres) y a meter `genero` en `course_holes`, o sea schema + migración de datos
sobre el catálogo entero.

**Diseño elegido:** las dos filas se quedan, y se las vincula. Un recorrido pasa
a ser "una cancha física con variantes por género", que es lo que realmente es.

### Forma

1. **Vínculo entre las filas de la pareja.** Columna nueva
   `courses.recorrido_key` (texto normalizado del nombre sin el sufijo), o
   `gender_sibling_id`. `recorrido_key` es preferible: no tiene el problema de
   consistencia bidireccional y agrupa naturalmente si algún día hay una tercera
   variante. Índice por `recorrido_key`.
   - Backfill: derivable del nombre con la misma regex que usa este spec.
   - Las 20 canchas ya mixtas quedan con su `recorrido_key` propio y una sola
     fila: el resto del sistema no distingue el caso.

2. **Fuente única de "los tees jugables de este torneo"**, en `src/golf/courses/`:
   dado el `course_id` del torneo, devuelve los tees de TODAS las filas que
   comparten `recorrido_key`, cada uno con su `course_id` de origen. La consume
   `useTees` y cualquier otra pantalla que ofrezca tees.

3. **El scoring resuelve par y SI por la fila del tee del jugador**, no por la
   del torneo. Es el corazón del fix: hoy `courseHoles` se carga una vez por
   torneo; pasa a resolverse por jugador según su tee. Toca
   `resolveScoringCourseHcp` / el contexto de handicap y el motor de leaderboard,
   que ya recibe `courseHoles` por contexto.

4. **`tournaments.course_id` no se toca.** Sigue apuntando donde apunta; el
   vínculo hace el resto. Cero migración de datos, cero riesgo sobre las 22
   rondas reales.

### Por qué este orden

El paso 3 es el que tiene filo: cambia de "un juego de hoyos por torneo" a "un
juego de hoyos por jugador". Los pasos 1 y 2 son aditivos y no cambian
comportamiento hasta que el 3 los consume, así que se pueden shippear antes y
verificar en frío.

---

## Lo que hay que verificar antes de dar por cerrado

- Un torneo con jugadores de ambos géneros: cada uno recibe golpes según el SI
  de SU género, y el leaderboard suma bien contra el par de cada uno.
- El caso El Alba (par 70 damas / 68 varones): el vs par de cada jugadora se mide
  contra su propio par, y el board los compara sin mezclar escalas.
- Los 13 recorridos con SI distinto: Σ golpes recibidos == course handicap, para
  los dos géneros.
- Las 20 canchas ya mixtas no cambian de comportamiento.
- Las 22 rondas libres existentes siguen dando el mismo índice que hoy.

---

## Dependencia

**Esperar a que mergee el PR #292** (`fix/guardarrail-rating-9h-claude`): toca
`compute-player-course-hcp.ts`, `course-handicap.ts` y la creación de torneos,
que son justo donde cae el paso 3.

---

## Nota sobre el P0 #7 (tee por categoría)

`categories.default_tee_color` NO existe en prod (verificado 30-jul), pero la UI
de creación de torneo (`CategoriasSection.tsx`) la pide y
`TeesAssignmentSection.tsx:89` la lee. Es una promesa vacía. Se resuelve con este
mismo trabajo: o la columna se crea y el paso 2 la usa como default por
categoría, o el campo sale de la UI. Decisión de producto pendiente.
