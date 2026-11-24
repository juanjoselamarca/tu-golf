# Spec Formal — Skins

> Decisiones de producto de Juanjo (PM), 24-nov-2026. Origen: campeonato de skins propuesto por un socio de
> Los Leones (8-12 jugadores, pozo fijo, 75 % del hándicap, el más bajo juega a 0). Este documento es la
> fuente de las reglas; el motor (`src/golf/formats/skins/`) las implementa y sus tests las citan.

## Definición

Cada hoyo vale un **skin**. Lo gana el jugador que hace el **mejor score del hoyo SOLO** (neto o gross según
la variante). Si el mejor score está empatado, nadie lo gana y el skin **se acumula** (arrastre) al hoyo
siguiente: el hoyo siguiente vale 1 + lo acumulado.

Se juega entre **todos los jugadores del torneo o de la ronda**, no por grupo: en un torneo de 3 grupos el
hoyo 7 se compara entre los 12.

## Dónde existe

- **Formato propio de torneo** (`formato_juego = 'skins'`), no combinable con otro formato.
- **Juego de la Timba libre** (una ronda de un solo grupo).
- Acceso: igual que la Timba — visible para todos con la marca «Próximamente», solo lo usan los admins y los
  probadores (`puedeCrearJuegoPersonalizado`, una sola regla para los dos).

## Variantes (las elige el organizador al crear)

| Perilla | Opciones | Default |
|---|---|---|
| Hoyos | 18 o 9 | 18 |
| Modo | neto o gross | neto |
| % de hándicap (solo neto) | `HCP_PCT_OPCIONES` (100…75) | 100 en torneo (como hoy); el organizador elige |
| Empate en el último hoyo | `repartir` entre los empatados / `se_pierde` | `repartir` |
| Validación | sí / no | no |
| Pozo | monto por jugador (CLP, entero ≥ 0) | sin pozo (0 = solo skins, sin plata) |
| Puntos especiales | mismos de la Timba (sandy, chipingo, greenie, propios) | ninguno |

Fijo (no se elige): el arrastre por empate y el reparto del pozo por skins ganados.

## Golpes (modo neto)

1. Hándicap de juego de cada jugador = `handicapDeJuego(courseHandicap, hcpPct)` (WHS 6.2a: % sobre el CH sin
   redondear, un solo redondeo). Fuente: `src/golf/core/playing-handicap.ts`.
2. **El más bajo juega a 0**: cada uno recibe `PH − PH mínimo` (`golpesALaDiferenciaDelMasBajo`). El mínimo es
   el del **campo completo** (todos los jugadores del torneo), no el del grupo.
3. Esos golpes se reparten por índice de dificultad con `strokesRecibidosEnHoyo` (en 9 hoyos, en escala de 9).
4. Gross: todos reciben 0.
5. Los hándicaps se **congelan al empezar** la ronda: si un índice cambiara a mitad de ronda, cambiaría el más
   bajo del campo y un hoyo ya ganado podría cambiar de dueño. Quien se retira o no se presenta sigue contando
   para el mínimo (los golpes se fijaron al empezar).
6. Sin datos confiables **no hay plata** (el motor lo devuelve como bloqueo y la pantalla no deja jugar así): un
   jugador sin hándicap en neto, SI que no es permutación 1..N (p. ej. SI de 18 en una ronda de 9), o una
   diferencia de golpes sobre 3 por hoyo.

Esto NO equivale al neto de stroke play con hándicap completo: cambian los hoyos donde cae el golpe de ventaja
(ej.: PH 20 y PH 5 — con hándicap completo la diferencia cae en SI 1-2 y 6-18; desde el más bajo, en SI 1-15).

## Scores de un hoyo

Cada jugador, en cada hoyo, tiene uno de:
- **golpes** (entero 1..15): compite;
- **X** («fuera del hoyo», levantó la bola): no compite ese hoyo, nunca gana; la X nunca se convierte en número;
- **sin anotar**: el hoyo no se puede cerrar todavía;
- **retirado**: el jugador no juega ese hoyo porque se retiró; no compite y no bloquea el cierre. Se guarda
  como el conjunto de hoyos que no juega (con salida por el 10 o shotgun, «desde el hoyo N» no sirve).

## Estado de cada hoyo

Un hoyo está **completo** cuando todo jugador no retirado tiene golpes o X.

| Estado | Cuándo |
|---|---|
| `por_jugar` | nadie lo ha anotado |
| `en_disputa` | hay anotaciones pero no está completo. Se muestra el **mejor score hasta ahora** y quién lo tiene (o «empatado») — decisión: los grupos de atrás ven el score a superar |
| `ganado` | completo, un único mejor score, y (si aplica) validado |
| `por_validar` | completo, ganado solo, aplica validación y el hoyo siguiente todavía no es definitivo para el ganador |
| `arrastre` | completo y el mejor score empatado (o todos X); su valor pasa al hoyo siguiente. También cuando el ganador no validó |
| `repartido` | último hoyo, empatado, regla `repartir`: el valor se divide en partes iguales entre los empatados |
| `perdido` | último hoyo, empatado (o todos X), regla `se_pierde`; o el valor arrastrado no tiene hoyo siguiente |

**Arrastre en orden:** el valor de un hoyo depende de cómo se cerró el anterior. El orden es el de
**numeración en un torneo** (aunque haya shotgun) y el **orden en que lo juega el grupo en una Timba** (sale por
el 10: 10…18, 1…9, y el último hoyo es el 9). Si el hoyo anterior no está cerrado (en disputa o por validar), el
valor del hoyo es **provisional**: se calcula con lo seguro (solo puede subir) y se marca así. Un hoyo `ganado`
corta la cadena: el siguiente vale 1 seguro.

## Validación (opcional)

Decisión de Juanjo: aplica **solo a los hoyos que traían arrastre** (valor ≥ 2). Para cobrarlo, el ganador
tiene que hacer **par neto o mejor** en el hoyo siguiente (neto con los mismos golpes del skins).
- Si valida: `ganado`.
- Si no (score peor que par neto, X, o se retiró): el valor completo **se arrastra** al hoyo de la
  validación (h+1) y se suma a lo que ese hoyo ya vale: lo cobra quien gane el h+1 (puede ser el mismo
  jugador). Si el h+1 queda empatado, sigue arrastrándose como cualquier empate.
- En el **último hoyo no hay validación** (no existe hoyo siguiente): se cobra directo.
- Mientras el ganador no anote el hoyo siguiente, el hoyo queda `por_validar`.
- Con un hoyo anterior abierto el valor real puede terminar siendo ≥ 2 aunque hoy muestre 1. Por eso, con
  validación activa, un hoyo provisional ganado solo queda `por_validar` (sin acreditar) hasta que el ganador
  valide o el hoyo anterior se cierre: la pantalla nunca muestra un ganador que después se retira.

## Último hoyo empatado

- `repartir` (default): el valor del último hoyo (1 + arrastre) se divide en partes iguales entre quienes
  empataron el **mejor** score. Puede dar fracciones de skin (ej. 3 skins entre 2 = 1,5 c/u).
- `se_pierde`: nadie lo cobra.
- Si en el último hoyo todos hicieron X: se pierde (no hay empatados con score).

## Puntos especiales

Los mismos de la Timba, con la misma regla de elegibilidad (función compartida; sandy y greenie solo con par
o mejor, gross; greenie uno por hoyo y solo en par 3; birdie automático NO existe en skins — el birdie ya
gana skins por sí mismo). **Cada punto especial válido vale 1 skin** y entra al reparto del mismo pozo. No
se arrastra ni se valida. Cada (jugador, hoyo, punto) vale una vez.

## Pozo y liquidación

- `pozoTotal = pozoPorJugador × jugadores inscritos` (los retirados también pusieron).
- `skinsGanados = Σ skins cobrados (hoyos + repartidos + especiales)`.
- `valorSkin = pozoTotal / skinsGanados`.
- Cada jugador **cobra** `skins × valorSkin` y su **neto** es `cobra − pozoPorJugador`.
- Plata en pesos enteros: se reparte con **resto mayor** para que la suma sea exactamente `pozoTotal`
  (desempate del resto: más skins primero, después orden estable de jugadores).
- **Nadie ganó ningún skin** (ronda terminada): se devuelve el pozo — cada uno cobra lo que puso.
- **Durante la ronda** la liquidación es **estimada** (`~`): el valor del skin baja si se ganan más skins
  después. Al cerrar el último hoyo de todos, es definitiva.
- Sin pozo (0): solo se muestran skins.

## Retiros

El retirado conserva los skins que ya cobró. Desde el hoyo en que se retira, no compite ni bloquea el cierre.
Un hoyo por validar cuyo ganador se retira en el hoyo siguiente: no valida → arrastre.

## Datos

- **Ronda libre**: `rondas_libres.formato_juego = 'skins'` y `reglas_juego = { config, jugadorIds }`, con
  `config` = `ConfigSkins` versionada (`src/golf/formats/skins/config.ts`). Mismo permiso que la Timba
  (`usuario_puede_crear_timba()` en las guardas de la base).
- **La X no es un número de golpes.** Más de 20 lugares de la app suman golpes sin filtrar (totales, leaderboard,
  historial, stats) y los torneos guardan los golpes en `hole_scores` con CHECK 1..19: un valor especial
  negativo los corrompería. La X se guarda **aparte** del registro de golpes, en la misma escritura (la misma
  función y la misma secuencia por teléfono): marcar X borra los golpes de ese hoyo y anotar golpes borra la X.
  Para el resto de la app un hoyo con X es «sin golpes», la lectura honesta.

## Fuera del motor (pantallas, fases siguientes)

- Scorer: tecla **X** junto a los números (lectura accesible «Fuera del hoyo»); valor del hoyo («Vale 3
  skins»); puntos de golpe del skins; bloque de puntos especiales compartido con la Timba.
- Leaderboard: tira de hoyos (ganado / arrastre / en disputa con el mejor score en gris / por jugar), lista por
  skins con plata estimada, liquidación final.
- Un torneo con hoyos sin anotar al cierre no se liquida solo: el organizador ve el aviso y resuelve.
- No cuenta para el índice (pendiente verificar WHS sobre hoyos levantados).
- Quien llame a `validarConfigSkins` y al motor pasa el course handicap **en la escala de los hoyos de la ronda**
  (en 9 hoyos, el CH de 9): con el de 18 el tope de 3 golpes por hoyo bloquearía de más y los golpes caerían mal.
- Puntos especiales en el scorer: `puntitosMarcables` de la Timba filtra por `activo`, que la config del skins no
  tiene; el scorer del skins necesita su propia lista o una versión de esa función que acepte las dos formas.
- **Adaptador base → motor** (lo que lee `fuera_del_hoyo` y `scores` y arma la entrada de `calcularSkins`):
  - Ignora golpes y X de hoyos que no son de la ronda: la base valida 1..27 fijo, así que en una ronda de 18
    entra un `{"25":"X"}` y en una de 9 que sale del 10 entra un `{"3":"X"}`. Con test.
  - Un `-1` en `scores` (conceder, de match play) lo acepta la base en cualquier formato: en skins el adaptador
    lo trata como hoyo sin anotar, nunca como golpes. Con test.
  - La X la lee siempre de `fuera_del_hoyo` en todos los selects, el poll y el realtime de jugadores (las listas de
    columnas son explícitas). La RPC devuelve solo `scores`: tras escribir, la X se aplica optimista.
  - Golpes y X en el mismo hoyo no pueden existir (CHECK en la base); el adaptador no decide precedencia.
  - Solo lee `fuera_del_hoyo` en rondas de skins (la RPC solo escribe X ahí; la base no lo impide en un UPDATE
    directo del creador, y fuera de skins un hoyo con X es «sin golpes»).
- **Cierre de una ronda de skins:** `guardarTarjetaEnHistorial` no se llama en skins (el CHECK de
  `historical_rounds` la rechaza y quedaría en «reintentar» para siempre); `tarjetaCompleta` y la rama de
  `finalizar_ronda_libre` para quien no anota cuentan un hoyo con X como anotado.
- **Promover:** la migración `20261125100000` se aprueba en prod ANTES de promover código que seleccione
  `fuera_del_hoyo` (si no, 42703 en todas las rondas libres, no solo en skins). Nunca dentro de una ventana de
  evento en vivo.
