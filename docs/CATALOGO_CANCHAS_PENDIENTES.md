# Catálogo de canchas — pendientes (no 100% cerrados)

## 30-oct-2026 — The Lakes Barceló (Punta Cana) + un hueco en el canario de rating

**Cargada:** `20261030120000_cancha_the_lakes_barcelo.sql`. Primera cancha del
catálogo en República Dominicana (194 canchas). 18 hoyos, par 72, 5 tees, par y
ventaja hoyo por hoyo del scorecard oficial. El resort no publica rating de 9
hoyos y no se inventa (`front_*` / `back_*` quedan NULL), pero la vuelta corta
se juega igual: el motor parte el rating de 18 en dos (`ratingsDe9DelTee`,
slope9 ≈ slope18) y los cinco tees dan un course handicap de 9 calculado.

**Tres huecos conocidos que deja esta carga** (ninguno inventado, los tres anotados
para cerrarlos con dato del club, no con criterio nuestro):

1. **No hay rating de damas.** Los 5 tees van como `genero='M'` porque CR 63.0 para
   4.769 yds es de varones. Sin fila del género, el motor cae al primer candidato, así
   que **una jugadora en el rojo recibe el rating de varones**: con índice 20 son ~10
   golpes de course handicap donde un rating de damas plausible (~68.5/115) le daría
   ~17. Son ~7 golpes de menos y no hay forma honesta de arreglarlo sin el dato: se
   cierra pidiéndole al club la tabla de damas.
2. **El rating de los tees dorado y azul es una corrección nuestra**, apoyada en el
   argumento físico y no en una segunda fuente con autoridad (ver `course_tees.fuente`
   y la cabecera de la migración). Pendiente: pedirle al club la tabla oficial de
   ratings. Si confirma lo publicado, se revierte con otra migración.
3. **El organizador no puede elegir `dorado` como tee global del torneo.**
   `src/app/organizador/[slug]/editar/EditTorneoForm.tsx` tiene la lista de tees
   hardcodeada (`negras`, `azul`, `blanco`, `rojo`) en un archivo que, dos líneas más
   arriba, sí usa la fuente canónica para los formatos. Es pre-existente —ya afectaba
   al dorado de C.G. La Serena— y pide su propio PR: la lista tiene que salir de los
   tees reales de la cancha (`category-tee-options.ts` ya hace eso en otra pantalla).

**Por qué se le cree tan poco a la ficha publicada** (viene al caso del hueco 2): el
pareo cruzado no es su único error. Al auditar las sumas apareció otro, en la misma
ficha — el panel de tees de GolfPass da el rojo en 4.688 yds y su propio hoyo por hoyo
en 4.769. La diferencia son 81 yardas = exactamente el hoyo 14 del rojo (par 3; 176 /
145 / 133 / 118 / 81 por tee), así que el panel suma salteándose un hoyo. Manda el hoyo
por hoyo, que cuadra consigo mismo: las parciales del rojo dan 2.520 + 2.249 = 4.769, y
si el 81 estuviera mal transcrito no darían eso. Dos errores de transcripción
demostrables en la misma ficha es parte de por qué el pareo se corrige en vez de
copiarse.

Verificado y descartado: **La Serena no tiene el mismo bug.** Su dorado ratea 64.4
contra par 72 (delta 7.6, el máximo del catálogo hasta ahora) pero su slope es 103 —
CR y slope bajos los dos, coherentes entre sí: es un tee genuinamente corto, no un par
permutado. También verificado que ningún script de sync puede revertir la corrección:
`sync-courses-unified.ts` salta la cancha por completa (`skip100`) y además sólo llena
nulls (`mergeNullOnly`), y `update-courses-from-api.ts` opera sobre una lista explícita
donde The Lakes no está. El riesgo queda si alguien la agrega a `COURSE_MAPPINGS`.
**Lo que apareció al cargarla — el pareo tee↔rating publicado estaba cruzado.**
Barceló y GolfPass publican dorado (6.200 yds) con CR 68.0 y azul (5.737 yds) con
CR 70.3: el tee más largo ratea más fácil, que es imposible. La migración carga el
pareo corregido (dorado 70.3/126, azul 68.0/119) y explica por qué.

**El hueco:** `catalogo-rating-canary` mide `|CR − par|` **por tee aislado**. Un
cruce entre dos tees de la misma cancha pasa invisible — los dos números son
creíbles por separado. Si se hubiera cargado el pareo publicado, un jugador de
dorado habría recibido ~3 golpes de más con índice 15, en silencio.

**Medición del catálogo (30-oct, 186 canchas activas):** 13 pares de tees donde el
más largo ratea más fácil, en 6 canchas. Se separan en dos clases, y sólo una es un
error:

| Clase | Casos | Exceso | Veredicto |
|---|---|---|---|
| Combinaciones distintas de recorridos (Marbella, Brisas) | 9 | ≤ 0.8 | **Legítimo** — un nueve más corto puede ser más difícil |
| Rojo/azul de damas guardado en la fila de varones (Bahía Coique, La Dehesa, Rinconada) | 4 | 2.2 – 2.4 | **Artefacto de género conocido** (ver `resolve-player-tee.ts`) |

Ninguna es un cruce entre tees de varones del mismo recorrido, que es la clase de
The Lakes. **Pendiente:** un canario que compare los tees de una cancha entre sí,
agrupando por recorrido y resolviendo el género antes de comparar — si no, las 4
filas del artefacto lo dejan rojo de entrada y las 9 legítimas fuerzan una
tolerancia tan alta (>0.8) que el cruce de 2.3 de The Lakes se escaparía igual.

---

> **Reauditado contra la BD el 09-ago-2026.** El estado de julio quedó viejo: de
> las 23 anomalías documentadas abajo, **17 ya están cerradas**. Lo que sigue
> abierto son 6 canchas sin scorecard.
>
> | Categoría | Julio | Hoy |
> |---|---|---|
> | Par declarado ≠ suma de hoyos | 13 | **0** ✅ |
> | Estructura mal etiquetada (Marbella + Olivos) | 5 | **0** ✅ |
> | Duplicado con par en conflicto (Santa Martina) | 1 | **0** ✅ |
> | Sin par hoyo por hoyo (necesitan FedeGolf) | 4 | **6** ⏳ |
>
> **Las 6 que faltan** — Iquique C.C. (D/V), C.G. Barquito Chañaral (D/V),
> C.G. Río Blanco (D/V). Las 6 tienen `fedegolf_cancha_id` cargado y **0 rondas,
> 0 torneos, 0 histórico**. Desde el PR #303 el gate impide empezar una ronda
> ahí, y el canario `catalogo-par-por-hoyo` vigila que la lista no crezca.
> Para cerrarlas hace falta el scorecard hoyo a hoyo de FedeGolf.
>
> **Hallazgo del #303 que este doc no tenía:** los 3 complejos de 27 hoyos
> (Brisas, Rocas, Marbella) guardan sus hoyos en los recorridos HIJOS, no en el
> club padre. El scorer buscaba en el padre y no encontraba nada, así que
> pintaba 18 hoyos par 4 con stroke index inventado. Ya está arreglado.

---

**Estado:** 193 canchas · 187 con hoyos · **23 anomalías** (antes del batch: 34).
**Cerrado hoy:** 11 recorridos DAMAS poblados (par copiado del hermano VARONES) + Bahía Coique DAMAS deduplicado. Fecha: 2026-07-02.

---

## 30-oct-2026 — el tee dorado: listas fijas de 4 colores y una columna con datos ajenos

**Qué se arregló (PR del mismo día).** El dorado está en **48 canchas activas** del catálogo —más que las
negras (34)— y el código lo trataba como si no existiera:

| Dónde | Qué hacía | Ahora |
|---|---|---|
| `editar torneo` | lista fija de 4 colores: el organizador no podía elegir dorado (le pegaba a La Serena y a The Lakes) | ofrece los tees **reales de la cancha** (`opcionesDeTeeDelTorneo`) |
| ronda libre, cancha sin tees | 4 genéricos sin dorado | los 5, desde `tee-colors.ts` |
| `/api/perfil/default-tee` | su propia lista de 4, que podía discrepar del banner | deriva de la fuente única |
| `types/database.ts` | el tipo prometía 4 colores; la columna guarda cualquier nombre | `string` |
| yardaje por tee | **cuatro** copias del mapeo con criterios distintos (caía a azul / a blanco / a null) | una fuente, `tee-yardage-column.ts`: sin columna → `null` |
| `editar torneo`, torneo con tees por jugador | mostraba un botón **"Per_player"** como si fuera un color, y al tocar un color pisaba el modo | muestra "Tees por jugador: cada jugador tiene el suyo" + link al panel de jugadores |

**Dato corrupto encontrado y limpiado** (migración `20261030180000`): la ingesta
`sync-courses-unified.ts` mandaba `gold`/`dorado`/`yellow`/`amarillo` a la columna `yardaje_blanco`, así que
en **10 canchas activas** esa columna guarda las yardas del DORADO: Hacienda Chicureo (5.397 donde el blanco
mide 6.161), Marbella Pacífico Sur - Andes Pro (DAMAS y VARONES), Cachagua y las seis combinaciones de Las
Brisas de Santo Domingo. No lo vio ningún usuario —el scorer solo muestra yardajes con
`yardaje_verificado_at` y ninguno de esos 180 hoyos está auditado—, pero habría salido a la cancha el día que
se auditaran. La migración los deja en `null`: las yardas reales del blanco no están en ninguna parte, el
dorado las sobrescribió al importar. **Respalda antes de anular**, en el schema `respaldos` (que PostgREST no
expone): el proyecto está en plan free y Supabase no hace ningún respaldo, y esos 180 números son el único
yardaje hoyo-a-hoyo del dorado de esas canchas que tenemos hoy.

**Alcance verificado con el canario generalizado** ("¿alguna columna de yardaje suma exactamente el
`yardaje_total` de un tee de OTRO color?", corrido contra prod el 30-oct): son esas 10 canchas y nada más.
Ningún caso de `amarillo` pese a que el mapeo viejo lo mandaba al mismo lugar, y el único falso positivo es
C.G. Sport Francés, donde negras y azul miden de verdad lo mismo (6.916).

**`tournaments.tees` no siempre guarda un tee.** Los torneos creados por el wizard guardan ahí el MODO de
asignación (`per_player` / `manual` / `mixed`) y el tee de cada jugador vive en `players.tee_id`. Al 30-oct en
prod: 18 torneos con un modo (los recientes) y 27 con un color (los viejos). La fuente única del predicado es
`src/golf/tournament-tees-mode.ts` (`esModoDeTees`); quien lea esa columna tiene que preguntar antes de
tratarla como un nombre de tee.

### Lo que queda pendiente

1. **Re-ingestar esas 10 canchas** con el mapeo ya corregido, para recuperar el yardaje real del blanco.
2. **Falta automatizar el canario de catálogo**: ninguna columna de yardaje debería sumar exactamente el
   `yardaje_total` de un tee de OTRO color. Es la consulta que encontró esto y ya se corrió a mano contra prod,
   pero hoy no corre sola. (El único falso positivo conocido: C.G. Sport Francés, cuyos tees negras y azul
   miden ambos 6.916.)
3. **`src/scripts/update-courses-runner.mjs` espeja el mapeo a mano**: es `.mjs` y no puede importar la fuente
   única en TypeScript. Su criterio es el correcto, pero si cambia `tee-yardage-column.ts` hay que seguirlo ahí.
4. **`save-course-snapshot.ts` sigue cayendo al primer tee de la cancha** cuando el nombre de tee no matchea
   ninguno (`allTees[0]`): el mismo patrón de "usar el dato de otro tee". No lo ve nadie porque `course_snapshot`
   no se lee en ninguna parte; si algún día se lee, esto se arregla primero.
5. **`course_holes` tiene 4 columnas de yardaje y el catálogo 10 colores.** Dorado, gris, amarillo, verde,
   plata y naranjo no tienen dónde guardarse hoyo por hoyo. Lo correcto a futuro es una tabla
   `course_hole_tees (course_id, hoyo, tee, yardas)` en vez de columnas por color.


## A. Faltan los hoyos — necesito dato externo FedeGolf (4)

No tienen hermano del otro género con hoyos, así que no se pueden copiar. Tengo el `fedegolf_cancha_id`; falta el par hoyo-a-hoyo.

| Recorrido | fg_id | Qué falta |
|---|---|---|
| C.G. Barquito Chanaral (DAMAS) | — | par por hoyo |
| C.G. Barquito Chanaral (VARONES) | — | par por hoyo |
| Iquique C.C. (DAMAS) | 215 | par por hoyo |
| Iquique C.C. (VARONES) | 25 | par por hoyo |

**Siguiente paso:** traer el scorecard de FedeGolf por `fg_id`.

---

## B. Estructura mal etiquetada — Marbella + Olivos (5)

| Recorrido | BD dice | Verdad (fuente) | Fix |
|---|---|---|---|
| Club de Golf Marbella (padre) | 27h, 18 hoyos cargados | Club padre de 3 nueves | Sacar los 18 hoyos del padre (los hijos tienen los suyos) |
| Marbella – Andes Pro | 9h, 18 hoyos, par 71 | **Nueve, par 36** (Andes) | Reestructurar a 9 hoyos par 36 — **necesita scorecard PDF** para el orden |
| Marbella – Pacífico Norte | 9h, 18 hoyos, par 71 | **Nueve, par 36** (Norte) | idem |
| Marbella – Pacífico Sur | 9h, 18 hoyos, par 71 | **Nueve, par 36** (Sur) | idem |
| Olivos Golf Club | 9h, 18 hoyos, par 72 | Argentina, 27h (Blanca+Colorada+Azul) | Relabel a 18h par 72 (o reestructurar). Prioridad baja (argentina) |

**Confirmado con Juanjo + web.** Marbella necesita el scorecard hoyo-a-hoyo (par 36/nueve, composición 2×P3/5×P4/2×P5).

---

## C. Par declarado ≠ suma real de los hoyos (13) — verificar cuál par es el correcto

El coach usa el par POR HOYO (no el declarado), así que el vs-par sale bien si los hoyos están bien; el mismatch avisa que **o el par_total o algún hoyo está mal**. Hay que cruzar cada una con la tarjeta/FedeGolf.

### Chilenas (prioridad)
| Cancha | Declara | Suma hoyos |
|---|---|---|
| La Serena | 72 | 70 |
| Santa Augusta de Quintay | 72 | 69 |
| Granadilla | 72 | 71 |
| Angostura | 72 | 71 |
| Costa Cachagua | 72 | 73 |
| Los Lirios | 72 | 73 |
| Cancha Internacional (DAMAS) | 72 | 70 |
| Cancha Internacional (VARONES) | 71 | 70 |
| El Alba (VARONES) | 70 | 68 |
| **Rio Blanco (DAMAS + VARONES)** | 62 | 63 | **← SOSPECHOSA: par 62/63 en 18 hoyos es rarísimo (avg 3.5). Probable cancha de 9 mal cargada. Verificar antes que nada.** |

### Argentinas (prioridad baja)
| Cancha | Declara | Suma hoyos |
|---|---|---|
| Hurlingham Club | 70 | 71 |
| Nordelta Golf Club | 72 | 73 |

---

## D. Dedup + par (1)

| Cancha | Problema |
|---|---|
| Hacienda Santa Martina – Cancha Verde (DAMAS) | Filas duplicadas **con par en conflicto** (72 declara, 70 suma). No se puede dedup a ciegas — necesita la tarjeta real para saber el par correcto. |

---

## E. Rondas sin linkear (NO son anomalías de catálogo — son de import #4)

Rondas de usuarios reales sin `course_id`, con nombre de cancha **ambiguo** → no se pueden linkear sin adivinar el recorrido (CERO FALLOS: no adivino).

| Cancha (nombre en la ronda) | Rondas | Por qué ambiguo |
|---|---|---|
| "Club de Golf Chicureo" | 6 | Hay DOS clubes Chicureo (Las Brisas: El Valle/La Montaña; y Hacienda Chicureo). No dice cuál. |
| "Club de Golf Rocas de Santo Domingo" | 4 | Linkeadas al club padre; hay varios recorridos (Nueva, Roja-Azul, Roja-Blanca…). No dice cuál. |

**El fix robusto:** capturar `par_per_hole` en el import (la tarjeta trae el par real, sin depender de adivinar recorrido). Estas rondas viejas no lo tienen → quedan sin par hasta re-importar con tarjeta, o hasta que el jugador confirme el recorrido.

---

## Demo/fantasma (excluir del medidor, no son reales)

El Manzano (37 rondas, no existe en catálogo), Santiago Golf Club (6, no existe), Smoke Course (30, fixture de test). Todas de usuarios demo/test. Acción: separar demo del medidor de cobertura.
