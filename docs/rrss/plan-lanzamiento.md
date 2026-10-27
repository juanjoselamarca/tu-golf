# Plan de lanzamiento del Instagram de Golfers+

> v2, 27-oct-2026. Reemplaza la v1 del mismo día, que estaba mal: vendía una analogía
> ("la pantalla del Tour") en vez del producto, y mezclaba los dos pilares en la misma pieza.
> Complementa `docs/rrss/guia-de-marca.md` (cómo se ve) y
> `docs/superpowers/specs/2026-10-26-rrss-sistema-design.md` (cómo corre el sistema).
> Juanjo asesora y decide producto; la estrategia y la ejecución las decide Claude.

## 1. Qué significa "premium" en las marcas de referencia

El encargo es ubicar a Golfers+ al nivel de TaylorMade, Bloomberg, Garmin y PGA Tour. Antes de
copiarles la estética conviene entender de dónde sacan la autoridad, porque no es del diseño:

| Marca | De dónde viene la autoridad |
| --- | --- |
| PGA Tour | El evento real, en vivo, con gráfica de datos sobre imagen real. |
| Bloomberg | El dato propietario, primero y con fuente. Su diseño es austero a propósito. |
| Garmin | El producto en uso en condiciones reales. Precisión demostrada, no declarada. |
| TaylorMade | Quien gana, usándolo. Prueba social de elite. |

**El denominador común: ninguna publica una afirmación sin un objeto real detrás** — producto,
evento o dato propio. Siempre hay algo que existe en cuadro.

De ahí la consecuencia incómoda: **"dato de golf + tipografía linda" es formato de cuenta de
nicho, no de marca.** Estructuralmente es idéntico a un post de un fondo de inversión, y por eso
el primer carrusel se veía igual que uno que apareció en el feed mientras lo revisábamos. Ese
formato baja de prioridad hasta el mes 2, y vuelve solo con dueño (sección 4).

**Regla de copy, sin excepciones: la palabra "premium" no se escribe nunca.** Garmin no se declara
premium. La marca se construye en la ejecución — tipografía, precisión del dato, el código de
color del golf — no en el adjetivo. Decirlo es perderlo.

## 2. Decisión: el lanzamiento es 100 % el pilar "en vivo"

Golfers+ tiene dos productos y no cumplen la misma función comercial:

| | **Pilar 1 — En vivo** (score, torneos, leaderboard compartido) | **Pilar 2 — Tu golf** (historial, patrones, proyecciones, coach tAIger+) |
| --- | --- | --- |
| Para qué sirve | **Adquisición** | **Retención y monetización** |
| Distribución | Incorporada: alguien comparte el leaderboard en el grupo del torneo y lo ven 20 golfistas que no conocían la app | Ninguna: nadie comparte sus propias estadísticas malas |
| Contenido | Se produce solo: cada torneo que corre es una pieza | Hay que inventarlo pieza por pieza |
| A quién le habla | Golfista **y** club/organizador | Solo al golfista |

**El lanzamiento va entero al pilar 1.** El pilar 2 entra en el mes 2 y entra con la cara de un
usuario real contando qué cambió en su juego, nunca como gráfico suelto: un gráfico de estadísticas
sin dueño es un gráfico; con dueño es prueba.

**Regla estructural: una pieza, un trabajo.** Si una pieza explica el leaderboard *y* las
estadísticas, el espectador no entiende qué es la app.

Cuando le toque, el pilar 2 tiene su propia línea: *"Después del torneo, los números."*

## 3. El activo que nadie puede copiar

No tenemos atletas ni derechos de transmisión. Tenemos lo que TaylorMade y Garmin no pueden tener
en Chile: **los torneos reales de clubes chilenos corriendo en nuestra app, con apellidos que el
público objetivo reconoce.**

Un leaderboard final de la copa de un club de Santiago vale más que cien datos de Shot Scope, es
imposible de replicar, y crece gratis con cada torneo que corre. Es exactamente la jugada de
Bloomberg (publicar lo que solo uno tiene) y la del PGA Tour (publicar el leaderboard de su propio
evento).

Resuelve además el problema del "look IA" de raíz: un leaderboard con apellidos reales, club real y
hoyo real **no se puede confundir con contenido generado**.

**Decisión de producto pendiente de Juanjo** (es suya, no técnica): publicar nombres reales.
Recomendación: apellido con inicial — "A. Chadwick" —, que es el estándar de los leaderboards de
golf, y pedir el visto bueno al club antes del primero. En el golf chileno todos se conocen. Hasta
que esté, todas las piezas van con datos demo y nombres ficticios creíbles.

## 4. Los tres formatos, en orden de valor

1. **EL TORNEO** — semanal, pieza central. Un torneo real que corrió en la app: leaderboard final
   con gráfica de transmisión, club, fecha y formato. Inimitable y es lo que convence a un club.
2. **EL PRODUCTO EN LA MANO** — quincenal. La app usada en cancha: con guante, con sol, entre
   hoyos, el leaderboard moviéndose en el teléfono del otro jugador. Estilo Garmin. De paso
   demuestra la directiva de cero fallos: se *ve* que funciona.
3. **EL NÚMERO CON DUEÑO** — mensual, desde el mes 2. El dato de golf, siempre atado a un jugador
   real de la app o a un caso del Tour **con el producto en cuadro**. Nunca el dato solo.

Eliminado: el carrusel tipográfico de datos sueltos.

## 5. Reglas duras de publicación

Una pieza no sale si falla cualquiera de estas:

- Hay un objeto real en cuadro: la app, la tarjeta, la cancha o un jugador. Nunca texto flotando.
- Cumple un solo trabajo, de un solo pilar.
- Todo número tiene fuente y fecha verificables. Cero redondeos "para que suene mejor".
- El primer segundo ya muestra golf y producto. Sin intro y **sin logo al principio**.
- Subtítulos siempre, en español chileno, sin voseo (`scripts/lib/voseo.mjs` lo verifica).
- Cero datos de usuarios reales sin autorización explícita.
- Cero clips, música o fotografía sin licencia.

## 6. La secuencia de lanzamiento

Tres piezas en el perfil **antes** de difundir el link: un perfil con una sola publicación se ve
abandonado, con tres se ve vivo. Las tres son *screen-first* — pantalla real de la app a pantalla
completa, movimiento real, tipografía mínima encima — porque son 100 % producibles sin salir a
filmar y porque lo que muestran existe. Así presentan producto Linear o Arc, y no se lee como IA.

| # | Trabajo | Qué se ve | Línea |
| --- | --- | --- | --- |
| 1 | Qué es | El scorer anotando un hoyo y, en la misma pantalla, el leaderboard de los otros tres moviéndose. 12-15 s, **muda**. | Anota. Todos ven lo mismo. |
| 2 | Por qué sirve | El neto con hándicap: cuatro jugadores con índices distintos, mismo torneo, posiciones que cambian al aplicar el hándicap. | Cada uno con su hándicap. |
| 3 | Para quien organiza | Un torneo armado de cero, en tiempo real, con voz en off. | Tu torneo, listo en dos minutos. |
| 4 | La prueba | El primer torneo real que corra en la app. Requiere el OK de la sección 3. | — |

**Las piezas 1 y 2 van sin voz en off**, contra lo que habíamos acordado. La voz sintética es el
delator número uno de "esto lo hizo una máquina" y no puede ser la primera impresión de la cuenta;
Garmin y TaylorMade publican muchísimo contenido mudo. La voz entra en la pieza 3, recién después
de compararla contra referencias.

Antes de la pieza 1: bio y destacados listos. Bio propuesta:

```
Golfers+
Torneos de golf en vivo. Leaderboard, neto con hándicap, tarjeta digital.
Clubes y grupos de amigos · Chile
→ golfersplus.vercel.app
```

Después de las cuatro arranca el ritmo semanal: la pieza central del formato 1 más un carrusel y
tres o cuatro stories derivados.

## 7. Producción: qué hace Claude y qué no puede hacer

**Claude produce completo:** captura de la app en movimiento (Playwright contra datos demo,
1080×1920), gráficas de transmisión (HTML + `scripts/rrss/`), voz (Gemini TTS es-CL), subtítulos
quemados y montaje (ffmpeg, pendiente de instalar como dependencia del proyecto).

**Claude no puede producir:** los planos de cancha. Una mano con guante sosteniendo el teléfono
entre hoyos, un putt, el carro, el green. Eso lo graba una persona con un celular, y es la
diferencia real entre premium y contenido generado.

El lanzamiento **no se bloquea** por eso: las piezas 1 a 3 son screen-first y salen sin material de
cancha. Pero **3 minutos de vertical grabados cualquier sábado** suben el techo de todo lo que
viene después, y no cuestan nada.

Publicación: por navegador con la extensión de Chrome, con aprobación de Juanjo pieza a pieza
(Instagram web soporta carrusel, 4:5 y programación nativa). Cuando exista la cuenta de Facebook se
migra a la API oficial, que además destraba las métricas automáticas.

## 8. Métrica del período

- **Principal:** de cada 10 visitas al perfil, 3 tocan el link. No seguidores.
- **De producto:** rondas y torneos creados por gente que llegó desde el perfil.

Seguidores no es métrica: una cuenta con 300 seguidores que llena torneos vale más que una con
5.000 que mira datos de golf.

## 9. Comentarios

Herramientas que la cuenta ya tiene (verificadas el 27-oct): **Palabras filtradas** (ocultar
comentarios ofensivos, filtro avanzado y lista propia), **Comentarios** (limitar quién comenta o
cerrarlos por publicación), **Restringido** y **Cuentas bloqueadas**.

La política importa más que el filtro, porque en el golf chileno todos se conocen:

- **Crítica al dato** → se responde en público con la fuente. Es credibilidad gratis.
- **Error real que alguien encuentra** → se corrige y se dice que se corrigió.
- **Insulto o spam** → se restringe. Sin drama, sin bloquear, sin que se entere.
- **Nunca** se borra una crítica legítima. Borrar es lo único que de verdad hace daño.

Antes de la pieza 1 se activan "ocultar comentarios" y el filtro avanzado. No se limitan los
comentarios a seguidores: con cero seguidores eso apaga la única conversación disponible.

## 10. Lo que este plan descarta a propósito

- **"La pantalla del Tour para tu club"** y cualquier frase que venda una analogía en vez del
  producto. La línea del lanzamiento es **"El torneo de tu club, en vivo."**
- El truco de "gráfica de televisión que se encoge dentro del teléfono": a los tres segundos el
  espectador vio televisión, no vio la app.
- El carrusel de los par 4 como primera publicación. Vuelve en el mes 2, con dueño.
- Las otras cuatro direcciones visuales tipográficas, hasta que el lenguaje screen-first esté
  probado con números.
