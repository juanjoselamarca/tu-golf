# Spec Formal — Timba libre (formato `personalizado`)

**Referencia:** ninguna federación. Juegos entre amigos definidos con Juanjo (26-oct-2026).
Prompt fuente: `docs/prompts/juego-personalizado.md` (rama `claude/lucid-planck-42nryf`).

## Definición
Ronda libre de 3 o 4 jugadores donde **cada uno juega su bola y anota sus golpes como siempre**, y la app
calcula, hoyo a hoyo, puntos de un juego armado con piezas. Los puntos **nunca se guardan**: se derivan de los
golpes, de los puntos especiales marcados y de las reglas. Por eso cambiar las reglas recalcula todo.

La ronda cuenta para el índice con las reglas WHS de siempre: los puntos y la diferencia de hándicap del juego
no tocan el índice.

## Piezas (config versionada, `version: 1`)
| Pieza | Valores | Por defecto |
|---|---|---|
| `unidad` | `individual` · `parejas_fijas` · `parejas_rotativas` (exige 4 jugadores) | según plantilla |
| `modo` | `gross` · `neto` | `gross` |
| `handicap` (si neto) | `diferencia_mas_bajo` · `completo` | `diferencia_mas_bajo` |
| `duelos[]` | `por_puesto` (individual, tabla por cantidad de jugadores) · `mejor_bola` · `peor_bola` · `suma` (parejas) | según plantilla |
| `perdedor_resta` (por duelo de parejas) | sí · no | no |
| `reparto_pareja` | `total_a_cada_uno` · `dividir` | `total_a_cada_uno` |
| `puntitos[]` | tipo, valor (1 por defecto), destino (`individual` · `pareja`), activo | ninguno |

## Plantillas v1
| Plantilla | Unidad | Duelos | Jugadores |
|---|---|---|---|
| La Colombiana | `parejas_rotativas` | mejor bola 2 · peor bola 1 · suma 1 | 4 |
| El 2-0-2 | `individual` | por puesto: 3 → `[+2, 0, −2]`; 4 → `[+2, 0, 0, −2]` | 3–4 |
| La Subterránea | `parejas_fijas` | peor bola 1 | 4 |
| La Subterror | `individual` | por puesto: 3 → `[0, 0, −1]`; 4 → `[0, 0, 0, −1]` | 3–4 |

"Personalizado total" combina las mismas piezas.

## Cálculo

### Score que compite en cada hoyo
- **Gross:** los golpes.
- **Neto, diferencia del más bajo:** con el course handicap de cada uno (canónico de `src/golf/core/`), el más
  bajo juega con 0 y los demás reciben `CH − CH_mínimo` golpes, repartidos por stroke index (en 9 hoyos,
  stroke index normalizado). Neto = golpes − golpes recibidos en ese hoyo.
- **Neto, completo:** cada uno recibe su course handicap entero (100 %), repartido igual.
- Neto exige que todos tengan hándicap: si falta, el validador bloquea con un mensaje claro.

### Duelos
- `por_puesto`: se ordena por score del hoyo (menor es mejor) y cada puesto recibe el valor de la tabla.
- `mejor_bola` / `peor_bola` / `suma`: se compara el menor, el mayor o la suma de cada pareja. El mejor gana el
  valor; el perdedor queda en 0 (o resta el valor si `perdedor_resta`).
- Lo que gana una pareja va a su **marcador del tramo** y, con `total_a_cada_uno`, **cada integrante** suma el
  valor completo en su cuenta individual. Con `dividir`, cada uno suma la mitad; para que nunca haya decimales,
  con `dividir` el validador solo acepta valores pares, y si un empate deja a la pareja con un impar, la regla de
  empate manda: esa pareja no se lleva nada en ese duelo (ni al marcador ni a sus integrantes).

### Regla de empate única
> Los empatados se reparten la suma de los puestos que ocupan. Si no se puede dividir en enteros, nadie se lleva
> nada (todos los empatados reciben 0 en ese duelo).

En un duelo de parejas los "puestos" son ganador = valor y perdedor = 0 (o −valor si resta).

### Parejas que rotan (La Colombiana)
- Las 3 combinaciones (AB-CD, AC-BD, AD-BC) se juegan en tramos de `hoyos / 3` (6 en 18, 3 en 9).
- El orden de las 3 combinaciones lo sortea la app al crear la ronda, **se guarda** y no se recalcula.
- La rotación sigue el **orden en que se juegan** los hoyos desde el hoyo de salida, no el número del hoyo.

### Hoyo pendiente y retiro (decisión de Juanjo, 26-oct)
- Mientras la ronda está en curso, si falta el score de alguien que participa en el hoyo, ese hoyo **no se
  puntúa** (ni duelos ni puntos especiales) y se muestra como pendiente.
- Un jugador que **se retira pierde todos los hoyos que no jugó**: en esos hoyos su score cuenta como "no jugó",
  que es peor que cualquier score, y los demás siguen puntuando. Dos "no jugó" empatan entre sí.
  - En duelos por puesto queda último (o empatado en los últimos puestos con otro retirado).
  - En parejas, su bola es la peor: la mejor bola de su pareja es la del compañero; peor bola y suma las pierde
    su pareja (salvo que la otra pareja también tenga un "no jugó", que empata).
  - No gana puntos especiales en esos hoyos.
- Un jugador cuenta como retirado desde un hoyo cuando está **marcado como retirado** (entrada `retiros`) o,
  al **cerrar la ronda**, en cada hoyo que quedó sin score.

### Puntos especiales
| Punto | Cómo se registra | Cuenta si… |
|---|---|---|
| Birdie | Automático desde los golpes (gross) | birdie = 1×, eagle = 2×, albatros o mejor = 3×, hoyo en uno = 3× |
| Sandy | Manual | el jugador hace par o mejor (gross) |
| Chipingo | Manual | siempre (con cualquier score) |
| Greenie | Manual, solo par 3, uno por hoyo | el ganador hace par o mejor (gross) |
| Propio | Manual, nombre y valor del usuario | siempre |

- Destino `individual` (por defecto): suma al jugador y al marcador de su pareja en ese tramo; el compañero no suma.
- Destino `pareja` (el grupo lo elige en "Más reglas"): además suma lo mismo al total individual del compañero.
- Interpretación confirmada por Juanjo con el caso dorado 11/12 (26-oct).
- En juegos individuales el destino no aplica: suma al jugador.
- Las validaciones se aplican al calcular, nunca borran datos: un punto que deja de cumplir su regla queda
  visible como "no cuenta" con la razón.

## Casos dorados

Jugadores: **Juan** (CH 10), **Pedro** (CH 14), **Diego** (CH 6), **Tomás** (CH 18). Gross salvo que se indique.

| # | Juego | Hoyo | Golpes | Resultado |
|---|---|---|---|---|
| 1 | 2-0-2 de 3 | par 4 | Juan 4 · Pedro 5 · Diego 6 | Juan +2 · Pedro 0 · Diego −2 |
| 2 | 2-0-2 de 3 | par 4 | Juan 4 · Pedro 4 · Diego 5 | Juan +1 · Pedro +1 · Diego −2 |
| 3 | 2-0-2 de 4 | par 4 | Juan 4 · Pedro 5 · Diego 5 · Tomás 6 | Juan +2 · Pedro 0 · Diego 0 · Tomás −2 |
| 4 | 2-0-2 de 4 | par 4 | Juan 4 · Pedro 4 · Diego 4 · Tomás 6 | 0 · 0 · 0 · Tomás −2 (ese hoyo no suma cero) |
| 5 | 2-0-2 de 4, **neto a la diferencia** | par 4, SI 5 | Juan 4 · Pedro 5 · Diego 4 · Tomás 4 | Golpes que reciben: Diego 0, Juan 4, Pedro 8, Tomás 12 → en el SI 5 reciben Pedro y Tomás. Netos: Juan 4 · Pedro 4 · Diego 4 · Tomás 3 → Tomás +2; empatan tres en (0+0−2)/3, no es entero → 0 · 0 · 0 |
| 6 | Colombiana, tramo Juan+Pedro vs Diego+Tomás | par 4 | Juan 4 · Pedro 6 · Diego 5 · Tomás 5 | Mejor bola 4 vs 5 → JP 2 · Peor bola 6 vs 5 → DT 1 · Suma 10 vs 10 → empate de 1 pt → 0. Marcador del tramo JP 2 – DT 1. Individual: Juan +2 · Pedro +2 · Diego +1 · Tomás +1 |
| 7 | Colombiana, mismo tramo | par 4 | Juan 4 · Pedro 5 · Diego 4 · Tomás 6 | Mejor bola 4 vs 4 → empate de 2 pts → 1 y 1 · Peor bola 5 vs 6 → JP 1 · Suma 9 vs 10 → JP 1. Marcador JP 3 – DT 1. Individual: Juan +3 · Pedro +3 · Diego +1 · Tomás +1 |
| 8 | Subterránea, Juan+Pedro vs Diego+Tomás | par 4 | Juan 3 · Pedro 5 · Diego 4 · Tomás 4 | Solo peor bola: 5 vs 4 → DT. Diego +1 · Tomás +1 · Juan 0 · Pedro 0 (el birdie de Juan no cuenta en el duelo) |
| 9 | Subterror de 4 | par 4 | Juan 4 · Pedro 5 · Diego 5 · Tomás 7 | 0 · 0 · 0 · Tomás −1 |
| 10 | Subterror de 4 | par 4 | Juan 4 · Pedro 4 · Diego 6 · Tomás 6 | Empatan los dos peores (0−1)/2, no es entero → 0 · 0 · 0 · 0 |
| 11 | Colombiana con puntos especiales (Birdie, Greenie, Sandy, valor 1, destino **individual**) | par 3 | Juan 2 (greenie marcado) · Pedro 4 · Diego 4 (sandy marcado) · Tomás 3 | Duelos: mejor 2 vs 3 → JP 2 · peor 4 vs 4 → 0 · suma 6 vs 7 → JP 1. Puntos especiales: Juan birdie +1 y greenie +1; el sandy de Diego **no cuenta** (hizo bogey). Juan +5 · Pedro +3 · Diego 0 · Tomás 0. Marcador JP 5 – DT 0 |
| 12 | El mismo hoyo, destino **pareja** | par 3 | igual que 11 | Los 2 puntos especiales de Juan también suman a Pedro: Juan +5 · Pedro +5 · Diego 0 · Tomás 0. Marcador JP 5 – DT 0 |
| 13 | Birdie automático | par 5 / par 3 | Juan 3 en el par 5 · Pedro 1 en el par 3 | Juan eagle → 2× = +2 · Pedro hoyo en uno → 3× = +3 |
| 14 | Hoyo pendiente | par 4 | Juan 4 · Pedro 5 · Diego 5 · Tomás sin score | No se puntúa nada; el hoyo queda pendiente hasta que Tomás anote |
| 15 | Rotación, 18 hoyos, salida en el 10, sorteo AC-BD → AB-CD → AD-BC | — | — | Hoyos 10-15: Juan+Diego vs Pedro+Tomás · 16, 17, 18, 1, 2, 3: Juan+Pedro vs Diego+Tomás · 4-9: Juan+Tomás vs Pedro+Diego |
| 16 | Greenie reasignado | par 3 | marcado a Pedro, después a Juan | Solo cuenta el de Juan; el de Pedro desaparece (uno por hoyo) |
| 17 | 2-0-2 de 4, Tomás retirado | par 4 | Juan 4 · Pedro 5 · Diego 6 · Tomás no jugó | Juan +2 · Pedro 0 · Diego 0 · Tomás −2 |
| 18 | Colombiana, Tomás retirado (Juan+Pedro vs Diego+Tomás) | par 4 | Juan 5 · Pedro 6 · Diego 4 · Tomás no jugó | Mejor bola 5 vs 4 → DT 2 · Peor bola 6 vs no jugó → JP 1 · Suma 11 vs no jugó → JP 1. Juan +2 · Pedro +2 · Diego +2 · Tomás +2 |
| 19 | 2-0-2 de 4, Pedro y Tomás retirados | par 4 | Juan 4 · Diego 5 · Pedro y Tomás no jugaron | Juan +2 · Diego 0 · empatan los dos últimos (0−2)/2 → Pedro −1 · Tomás −1 |
| 20 | Colombiana con `dividir`, solo mejor bola 2 | par 4 | Juan 4 · Pedro 6 · Diego 4 · Tomás 5 | Mejor bola 4 vs 4 → cada pareja 1, que no se divide en dos → 0. Marcador 0 – 0 y nadie suma. Derivado de la regla de empate única que Juanjo aprobó en el checkpoint 1, no es una regla nueva |

(En las tablas, A = Juan, B = Pedro, C = Diego, D = Tomás.)

## Casos edge
1. 9, 18 y 27 hoyos (tramos de 3, 6 y 9).
2. Salida en un hoyo distinto del 1: la rotación sigue el orden jugado.
3. Neto con un jugador sin hándicap: lo bloquea el validador.
4. Score corregido después: todo se recalcula (puntos derivados).
5. Greenie en un par 4: imposible por UI y por servidor.
6. Juego del catálogo con menos jugadores de los que pide (Colombiana con 3): lo bloquea el validador.
7. Cambio de reglas con la ronda empezada (solo el creador): recálculo y aviso al grupo.
8. Propiedades: miles de configs y tarjetas válidas al azar → el motor nunca falla, nunca devuelve decimales y los
   totales cuadran con el detalle por hoyo.

## Contrato para la integración (PR B)

Lo que el motor exige a quien lo llama. Cada punto lleva su test en el PR que lo cablea.

1. **Hándicap:** un único mapeo con nombre en `src/golf/ronda-libre/`, construido desde `courseHandicapsDeRonda` y SIN valor por defecto: `null` si el jugador está en `sinIndice` o no tiene entrada en `courseHcpMap`, y `courseHcpMap[id]` si no. No se reutiliza el de `tarjeta-para-historial.ts:77`: su `?? 0` convierte un CH faltante en 0 y apaga el aviso de `sinHandicap`. Ojo con el tipo de `sinIndice`: en `cargarRondaLibreEnVivo` es un array (`.includes`), no un Set. El CH de índice 0 de un jugador sin índice no es un hándicap; con este mapeo el validador avisa "necesita hándicap" y el motor informa `sinHandicap`.
   - **Dónde se puede calcular el neto:** solo con `courseHandicapsDeRonda` llamado con un lector real (`leerIndicesDelCliente` o `indicesDePerfil`). Nunca con `null` ni desde la respuesta pública de la ronda en vivo, que trae `courseHcpMap: {}`: ahí todos caerían en `sinHandicap` y el grupo vería un marcador distinto al del anotador.
   - **Decisión de producto (Juanjo, 27-oct-2026):** en una Timba neto el grupo ve los puntos y la marca de golpe recibido por hoyo de cada jugador; hoy el grupo no ve el índice ni el hándicap de juego de otro (`VistaDelJuego` no los trae). Palabras de Juanjo (27-oct): «el handicap se oculta sólo por espacio y diseño, no hay problema en mostrar los golpes y si el diseño lo justifica mostrar el handicap no sería problema». El servidor entrega `VistaDelJuego` (`config`, `jugadorIds`, `resultado`, `golpesRecibidos`), que hoy no los trae. Tests: `src/golf/ronda-libre/juego-de-la-ronda.test.ts` ("decisión de Juanjo 27-oct") y `src/app/api/ronda-libre/[codigo]/juego/route.test.ts`.
   - **Hándicap del torneo:** si algún día una Timba corre en un grupo con `hcp_pct` distinto de 100, "completo (100 %)" choca con un `courseHcpMap` que ya trae el porcentaje. Hoy la ronda libre no fija `hcp_pct`.
2. **Orden de los jugadores, por id:** las parejas y el sorteo se guardan como índices sobre una lista `jugadorIds` (orden A, B, C, D), que también se guarda en `reglas_juego`. Hay un solo camino, igual que `ronda_equipo_jugadores`. No se usa ORDER BY `created_at`: los insertados en lote empatan y el desempate por UUID es al azar.
   - La ruta de crear traduce los índices de la pantalla a ids con las filas insertadas.
   - El cargador ordena `jugadores` según `jugadorIds`.
   - Si los jugadores de la ronda ya no coinciden con `jugadorIds`, la Timba no se calcula hasta que el creador vuelva a confirmar las parejas.
   - Tests:
     - (a) barajar los jugadores cargados no cambia las parejas;
     - (b) crear La Subterránea con parejas elegidas y recargar con `created_at` empatado da las mismas parejas por id;
     - (c) reemplazar un jugador no calcula con las parejas corridas.
3. **Marcas ordenadas:** van por una clave única y creciente (`created_at, id`), porque "vale el último greenie" depende del orden.
4. **Unicidad en la base:** una marca por (ronda, jugador, hoyo, punto).
5. **Greenie, uno por hoyo en la escritura:** asignarlo reemplaza; en una sola operación (RPC) se borran las otras marcas de greenie del hoyo. Quitarlo las borra todas. "Vale el último" en el motor es solo defensa.
   - Test: Pedro→Juan→Pedro gana Pedro.
   - Test: Pedro→Juan→quitar no gana nadie (la marca anterior no revive).
6. **Ids estables:** `puntito.id` no cambia al editar las reglas. Si cambia, las marcas quedan huérfanas y el motor las descarta.
7. **Hoyo numérico:** `MarcaPuntito.hoyo` llega como número, no como string, porque el motor compara con `===`.
8. **27 hoyos:** `normalizedStrokeIndexByHole` entrega una permutación 1..N de los hoyos de la ronda.
   - **Valor esperado del CH:** la suma de los CH WHS de 9 hoyos de cada vuelta. Hoy `courseHandicapDeLaCancha` con 27 da la escala de 18 hoyos, y eso es incorrecto (índice 10 vs 14: Pedro recibiría 4 golpes en vez de 6).
   - Si el PR B no lo implementa en `src/golf/core`, la creación no ofrece Timba neto con 27 hoyos, con su test.
   - El 27-oct no había rondas libres de 27 hoyos en prod.
9. **Retiros:** se persisten. Un retiro desde un hoyo que no está en la ronda se ignora, y sus hoyos sin score quedan pendientes.
10. **Ronda cerrada:** `rondaCerrada` = `ronda.estado === 'finalizada'` leído de la base. No se usa `isFinished` de `ronda-libre/[codigo]/page.tsx`, que también acepta `?finished` en la URL.
    - Si alguien se va sin marcar retiro, al cerrar sus hoyos sin score cuentan como "no jugó".
    - Test: cerrar con hoyos sin score.
11. **Aviso de neto sin hándicap:** la UI lo muestra con `sinHandicap` del resultado, sin copiar el predicado.

### Cómo quedó en el PR B (27-oct-2026)
- **Datos:** migración `20261027180000_timba_libre_datos.sql`. `rondas_libres.reglas_juego` = `{config, jugadorIds}`. Marcas en `ronda_libre_puntitos` y retiros en `ronda_libre_retiros`: tablas privadas (sin permisos para anon ni authenticated), se escriben solo por las RPC `marcar_puntito_ronda_libre` / `marcar_retiro_ronda_libre` y las lee solo el servidor.
- **Solo admins:** la ruta de crear exige `puedeCrearJuegoPersonalizado()`; la base lo repite con guardas RESTRICTIVE de INSERT/UPDATE (`usuario_es_admin()`).
- **Ids de jugadores:** los genera la ruta de crear antes del INSERT, así `jugadorIds[i]` es la fila de la posición i por construcción.
- **Lectura:** `GET /api/ronda-libre/[codigo]/juego` (requiere sesión) devuelve `VistaDelJuego`, calculada con `courseHandicapsDeRonda` y el lector real de índices.
- **Para el PR C:** las RPC no tienen grant a anon, así que un invitado sin sesión no marca puntos especiales; la Timba requiere cancha del catálogo (`course_id`); las marcas no disparan aviso push; neto con 27 hoyos queda bloqueado hasta el fix del core; **cerrar la ronda queda bloqueado mientras haya marcas de puntos especiales pendientes de enviar** (`puntitos-pendientes.ts`), igual que con golpes sin enviar: si no, el resultado final se calcula sin esas marcas; **las marcas que el reenvío devuelve en `rechazadas`** (`reenviarPuntitosPendientes`, rechazo definitivo del servidor) **se le avisan al grupo**: salieron de la cola y no cuentan.
- **Para el PR C — ninguna vista genérica de ronda libre se monta para `personalizado`.** En una Timba, `/hcp` y `/live` ya no entregan el índice ni el hándicap de otros (PR B), y las vistas genéricas no lo saben: `PlayerSelectorScreen` y `PlayerScoreCard` muestran el HCP, y `useRondaLibreLive`, `IndividualLeaderboard`, `TeamLeaderboards`, `src/lib/ronda/leaderboard.ts`, `team-ranking.ts` y `share.ts` caen a `Math.round(j.handicap ?? 0)` cuando falta el course handicap, lo que da un **neto falso** (hándicap 0) en vez de un error. La Timba necesita sus propias vistas (que leen solo `GET /juego`), o un guard explícito por `esFormatoPersonalizado` en cada una de esas entradas, con test. La regla existe para que no aparezca un neto ni un ranking falso: las vistas de la Timba leen solo `GET /juego`. El hándicap no es dato privado; se oculta por espacio y diseño: si el PR C muestra el HCP, se agrega a `VistaDelJuego` (los golpes recibidos por hoyo ya viajan), sin reabrir `/hcp` ni `/live`.

## Vistas
Definidas tras el segundo punto de control (variante del scorer elegida por Juanjo).
