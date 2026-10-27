# Plan de lanzamiento del Instagram de Golfers+

> Decidido con Juanjo el 27-oct-2026. Complementa `docs/rrss/guia-de-marca.md` (cómo se ve) y
> `docs/superpowers/specs/2026-10-26-rrss-sistema-design.md` (cómo corre el sistema).
> Este documento es el **relato**: qué estamos contando y en qué orden.

## 1. El relato en una frase

**Golfers+ es la pantalla del Tour para tu club.**

El PGA Tour mide cada golpe desde 2003 con ShotLink, y desde 2011 traduce eso a golpes ganados. Por eso
un profesional sabe *dónde* pierde los golpes, no solo cuántos. Un amateur nunca tuvo eso: anota un 88 en
un papel y no sabe qué pasó. Golfers+ le da lo mismo para el torneo del sábado — leaderboard en vivo,
neto con hándicap, y sus números después.

Todo lo que publiquemos cuelga de ahí. Si una pieza no se puede explicar con esa frase, no es nuestra.

## 2. La meta de los próximos 45 días

**No es alcance.** La cuenta parte sin publicaciones y con pocos seguidores; el tráfico va a llegar de la
red de Juanjo, de WhatsApp y de los clubes. El trabajo de la grilla es que cuando alguien caiga desde un
link entienda en cinco segundos **qué es, que funciona y que es serio**.

Tres personas caen en el perfil:

| Quién | Qué se pregunta | Qué tiene que ver |
| --- | --- | --- |
| El golfista al que invitaron a una ronda | "¿Qué es esto que me mandaron?" | La app anotando y el leaderboard moviéndose. |
| El organizador que evalúa un torneo | "¿Esto aguanta mi torneo?" | Un torneo real armado y corriendo. |
| El curioso del circuito | "¿Es serio o es un invento?" | Datos con fuente y cero promesas infladas. |

Métrica honesta del período: que de cada 10 visitas al perfil, 3 toquen el link. No seguidores.

## 3. La fórmula de contenido

El problema de tirar un dato de golf suelto es que no tiene protagonista. Cada pieza va en tres tiempos:

1. **El caso del Tour** — algo que el golfista ya vio o ya sabe. Da contexto y autoridad prestada.
2. **El espejo amateur** — el mismo fenómeno en su juego, con dato verificado (Shot Scope).
3. **Lo que hace la app** — cómo Golfers+ se lo muestra a él.

Ejemplo, con la pieza que ya está armada:

> **Tour:** Scottie Scheffler lidera el Tour con 2,22 golpes ganados por ronda, casi medio golpe sobre el
> segundo. No es por pegar más lejos. · **Espejo:** tú tampoco pierdes los golpes donde crees: más de la
> mitad se te van en los par 4. · **App:** Golfers+ te dice en cuáles.

Regla: el número del Tour se cita con su fuente y su fecha, porque los líderes de temporada cambian.
Nunca un número redondeado "para que suene mejor".

## 4. El lenguaje visual

El diagnóstico del 27-oct: las primeras piezas eran tipografía pura sobre fondo oscuro, sin producto ni
fotografía. Eso es indistinguible de un post de fondos de inversión — literalmente apareció uno igual en
el feed mientras revisábamos. **Tipografía sola = se nota IA.**

El sistema pasa a ser el de una **transmisión de golf**:

- **Leaderboard inferior** con posición, jugador, hoyo y score al par, con el código universal:
  **rojo bajo par, negro o blanco sobre par**.
- **Trazadora del golpe** sobre el mapa del hoyo.
- **Barras horizontales de golpes ganados**, como la tabla de SG del Tour.
- **Siempre un elemento real en cuadro**: la app, la tarjeta o la cancha. Nunca texto flotando solo.

La paleta y las tipografías de `guia-de-marca.md` siguen valiendo: pasan a ser el marco de la gráfica,
no el contenido de la pieza.

## 5. La secuencia de lanzamiento

Las tres primeras son **reels**, con la app en movimiento. Voz en off es-CL y **subtítulos siempre**
(Instagram se mira en silencio). La voz se va iterando pieza a pieza.

### Reel 1 — "Qué hacemos" (≈18 s)

| Tiempo | Imagen | Subtítulo |
| --- | --- | --- |
| 0-3 s | Gráfica de transmisión sobre la cancha: se ve como el domingo en la tele. | Esto es lo que ven los profesionales. |
| 3-6 s | La misma gráfica se encoge y aparece dentro del teléfono, en Golfers+. | Esto es tu sábado en el club. |
| 6-14 s | La app de verdad: anota un hoyo, el leaderboard se mueve en vivo, aparece el neto con hándicap. | Anotas. Todos ven lo mismo. Con tu hándicap. |
| 14-18 s | Cierre con el logo. | El torneo de tu club, con la pantalla del Tour. |

### Reel 2 — "La prueba"

Un torneo corriendo con varios jugadores y el leaderboard moviéndose solo. Datos demo, cero nombres
reales. Responde "¿esto aguanta mi torneo?".

### Reel 3 — "Para quien organiza"

Un torneo armado de cero en dos minutos, en tiempo real. Para clubes y organizadores.

### Después, la serie semanal

Recién con esas tres arriba parte el ritmo: un reel central por semana más un carrusel y tres o cuatro
stories derivados. Los formatos fijos son el dato con la fórmula de la sección 3, la regla que nadie
conoce y el torneo de la semana.

Antes del reel 1: bio y destacados del perfil listos.

## 6. Comentarios

Herramientas que la cuenta ya tiene (verificadas el 27-oct en Configuración): **Palabras filtradas**
(ocultar comentarios ofensivos, filtro avanzado y lista propia), **Comentarios** (limitar quién comenta o
cerrarlos por publicación), **Restringido** y **Cuentas bloqueadas**.

La política importa más que el filtro, porque en el golf chileno todos se conocen:

- **Crítica al dato** → se responde en público con la fuente. Es credibilidad gratis.
- **Error real que alguien encuentra** → se corrige y se dice que se corrigió.
- **Insulto o spam** → se restringe. Sin drama, sin bloquear, sin que se entere.
- **Nunca** se borra una crítica legítima. Borrar es lo único que de verdad hace daño.

Antes del post 1 se dejan activados "ocultar comentarios" y el filtro avanzado. No se limitan los
comentarios a seguidores: con cero seguidores eso apaga la única conversación disponible.

## 7. Cómo se produce

- **Grabación de la app**: Playwright contra datos demo (`scripts/seed-demo-data.sql`), formato 1080×1920.
- **Gráficas**: HTML + el sistema de `scripts/rrss/`, renderizadas con el mismo motor de las láminas.
- **Voz**: Gemini TTS es-CL (la clave ya está en `.env.local`).
- **Montaje y subtítulos quemados**: ffmpeg (pendiente de instalar como dependencia del proyecto).
- **Publicación**: por ahora por navegador con la extensión de Chrome, con aprobación de Juanjo pieza a
  pieza. Instagram web soporta carrusel, proporción 4:5 y programación nativa. Cuando exista la cuenta de
  Facebook se migra a la API oficial, que además destraba las métricas automáticas.

## 8. Lo que este plan deja fuera a propósito

- Publicar el carrusel de los par 4 como primera publicación. Queda para la serie semanal, con la
  fórmula de la sección 3 encima.
- Las otras cuatro direcciones visuales tipográficas, hasta que el lenguaje de transmisión esté probado.
- Cualquier clip, música o fotografía sin licencia.
