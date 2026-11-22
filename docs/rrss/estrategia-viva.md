# Estrategia viva de RRSS

> Lo que sabemos **por datos propios** sobre qué funciona en la cuenta de Instagram de Golfers+.
> `/rrss` lee este archivo ANTES que `plan-lanzamiento.md` y lo que diga acá pisa al plan.
>
> Última actualización: 21-nov-2026 · Piezas publicadas: **3** · Datos propios: **pieza 1 a 3 días; piezas 2 y 3 sin leer**.

## Cómo se usa este archivo

El plan de lanzamiento es una hipótesis: está armado con benchmarks de otras cuentas (The Grint,
V-Par, Garmin, TaylorMade) y con criterio de marca, no con resultados nuestros. Este archivo es
donde esa hipótesis se va corrigiendo con lo que de verdad pasa.

Tiene una sola regla de uso: **lo que está acá manda, y lo que no está acá no se sabe**. Si una
decisión no aparece abajo con su dato y su fecha, sigue valiendo el plan.

## Estado hoy (27-oct-2026)

Cero publicaciones. El perfil `@golfers.plus` existe, sin bio ni destacados, y el sistema de
producción (`scripts/rrss/`, el portón de aprobación y el empaquetador) está terminado pero no ha
subido nada.

**Por lo tanto, hoy este archivo no tiene ni una conclusión propia.** Cualquier afirmación sobre
qué funciona sería inventada, y una estrategia inventada que se escribe como si fuera medida es
peor que no tener archivo: la próxima corrida de `/rrss` la leería como un hecho.

Lo único que sí se puede afirmar hoy, porque no depende de métricas:

- **El reel 1 está producido y empaquetado**, mudo, 13,9 s, 1080×1920 (`anota-todos-ven`). La
  captura sale de la base de pruebas con el motor de golf real: el gesto en cámara cambia al líder
  de verdad, no es una animación.
- **No hay material de cancha.** Todo lo producible hoy es *screen-first*. El plan ya lo asume
  (sección 7), y mientras no existan 3 minutos de vertical grabados en cancha, el formato 2 del
  plan ("EL PRODUCTO EN LA MANO") no se puede producir, por mucho que sea el segundo en valor.
- **No hay torneo real autorizado.** El formato 1 ("EL TORNEO") es el de más valor del plan y es el
  que necesita el OK de un club (plan, sección 3). Hasta que exista, va con datos demo y nombres
  ficticios creíbles.

## Decisiones vigentes que NO se discuten todavía

Vienen del plan, están tomadas y no se vuelven a abrir sin un dato que las contradiga. Están acá
para que una corrida futura de `/rrss` no las re-litigue cada semana:

| Decisión | De dónde viene | Qué la cambiaría |
| --- | --- | --- |
| Las piezas 1 y 2 van **mudas** | La voz sintética es el delator de "esto lo hizo una máquina" | Nada en métricas. Solo voz humana o una voz sintética que pase una prueba a ciegas |
| Nunca la palabra "premium" en el copy | Plan, sección 1 (`validarPieza` lo verifica) | Nada |
| Un objeto real en cuadro, siempre | Plan, sección 5 | Nada |
| Todo número con fuente y fecha | Directiva de cero fallos | Nada |
| Español de Chile, sin voseo | `scripts/lib/voseo.mjs` y el canario del CI | Nada |
| Una pieza, un trabajo, un pilar | Plan, sección 5 | Nada |
| El pilar del lanzamiento es 100 % "en vivo" | Plan, sección 6 | Datos (ver el umbral) |
| Ritmo: 1 reel central + 1 carrusel + 3-4 stories por semana | Plan, sección 6 | Datos, o que no se alcance a producir con calidad |

## El umbral para cambiar una decisión

Una cuenta chica tiene métricas con muchísimo ruido: una pieza que la cae bien a un grupo de
WhatsApp duplica los números de la semana sin decir nada sobre el formato. Entonces:

1. **Mínimo 8 publicaciones del mismo formato, con datos de 7 días**, y la diferencia sostenida en
   todas. Es el umbral del diseño del sistema (spec del 26-oct), y vive acá: este es el único lugar
   donde se escribe.
2. **La diferencia tiene que ser grande**, no un 20 %. Con menos datos el número informa, pero no
   recomienda nada.
3. **La métrica que importa es la retención, no los likes**: % que ve el reel hasta el final, y
   guardados. Un like no indica nada sobre si el producto se entendió; un guardado sí.
4. **Una sola pieza nunca cambia la estrategia**, ni la mejor ni la peor. Se anota y se espera.
5. Lo que sí se puede corregir de inmediato, sin umbral, es un **error**: un dato mal calculado, un
   nombre real sin permiso, una falta de ortografía, golf incorrecto. Eso no es estrategia.

Si un dato pasa el umbral, se escribe abajo en la bitácora **con el número, la fecha y de dónde
salió**, y recién entonces pisa al plan.

## Qué se mide y de dónde sale

Las métricas de Instagram **no se leen por API** (la app de Meta sigue bloqueada: la cuenta no
tiene perfil de Facebook, ver `setup-meta-y-bot.md`). Salen de la pantalla de estadísticas de la
publicación, y entran al sistema cuando la tanda se cierra con sus links:

```
node scripts/rrss/publicar.mjs --publicada <tanda> <link-1> <link-2> ...
```

Por pieza se anota: alcance, % de reproducción completa, guardados, compartidos, visitas al perfil
y clics al link. **Cinco de esas seis dependen de que el video retenga**; la excepción es el
alcance, que lo decide la distribución de Instagram y no la pieza. Los likes no se anotan: no
dicen si el producto se entendió.

Lo que de verdad se persigue no es ninguna de las seis: es **un club que escriba**. Un mensaje de
un organizador vale más que diez mil reproducciones, y cuando pase hay que anotar qué pieza vio.

## Resultados por pieza (datos, no conclusiones)

Se anotan todas. Ninguna cambia la estrategia sola (umbral de arriba).

### Pieza 1 — «El drive es para el show, el putt es para la plata» (reel, publicado 16-nov-2026)

Link: https://www.instagram.com/p/Dfz1NrnMAG0/ · Leído el 19-nov-2026 (~3 días) en «Ver insights» de
Instagram web. Formato: estilo verde animado (Remotion), voz sintética, dato de Mark Broadie (CPG Golf).

| Métrica | Valor | Sobre espectadores (7.628) |
| --- | --- | --- |
| Visualizaciones | 9.111 (99,7 % no seguidores) | — |
| Espectadores (cuentas) | 7.628 | — |
| Guardados | 33 | 0,43 % |
| Compartidos | 49 | 0,64 % |
| Seguidores nuevos | 96 | 1,26 % |
| Comentarios | 3 | — |
| Me gusta (no se usa para decidir) | 158 | — |

- **% de reproducción completa: no disponible en la web.** Instagram solo lo muestra en la app del
  teléfono (Estadísticas del reel → Retención). Falta que Juanjo mande la captura.
- Embudo del perfil (Panel para profesionales, últimos 30 días, leído el 19-nov): **30 visitas al
  perfil y 1 toque en el enlace** (3 %; la meta del plan es 30 %). La cuenta solo tiene ese reel,
  así que el embudo es el de esta pieza.
- 96 seguidores nuevos con apenas 30 visitas al perfil: la mayoría siguió desde el reel mismo, sin
  pasar por el perfil. El contenido ganó el seguimiento, pero el perfil no convierte: no tiene bio
  que diga qué es la app, no tiene destacados, y el enlace es `golfersplus.vercel.app`.
- Señales que Instagram usa para repartir a no seguidores (según Adam Mosseri, jefe de Instagram):
  tiempo de visualización, me gusta por alcance y envíos por alcance. Esta pieza dio 2,1 % de me
  gusta por espectador y 0,64 % de compartidos por espectador. El tiempo de visualización no se ve
  en la web.
- **Faltan, y solo salen en la app del teléfono:** retención y tiempo medio, fuentes del alcance
  (Reels, Explorar, perfil) y **país** de quienes lo vieron. Si el alcance fue mayoritariamente
  fuera de Chile, los seguidores nuevos no son público de la app.
- Lectura (no decisión): casi todo el alcance fue a no seguidores, y 96 de los 101 seguidores
  de la cuenta llegaron por esta pieza. Se comparte más de lo que se guarda: el tema se discute, se manda
  a un amigo. Un comentario de un profesor de golf («No creo. Muestren los datos.») pide fuente:
  la próxima pieza tiene que mostrar el dato en cuadro, no solo citarlo.

### Pieza 3 — «Dónde se van los golpes» (reel, publicado 21-nov-2026 ~15:54)

- Link: https://www.instagram.com/golfers.plus/reel/DgA64eYsQWp/
- Juanjo la aprobó en el chat («Sí, sábado 16:00»). Archivo: `Pieza 3 - Dónde se van los golpes (v2) IG.mp4`
  (34,3 s, -13,7 LUFS), con portada propia y caption de 1.427 caracteres. No se subió historia: Juanjo dijo que no.
- Es la primera pieza de la app (mezcla ~2 de datos : 1 de app). Dato: Broadie 2008, tabla 4.
  App mostrada con datos de ejemplo: score en grupo, tarjeta guardada, historial y estadísticas.
- **Variable que cambió:** CTA explícito «Link en la bio» en el video y en el caption, con voz de equipo («Síguenos»).
- **Hipótesis:** una pieza de la app con CTA «Link en la bio» sube los toques en el enlace / visitas al perfil
  por sobre el 3 % de la pieza 1.
- Lecturas pendientes: 72 h (mar 24-nov) y 7 días (sáb 28-nov).

### Pieza 2 — «Green isla» (reel, publicado 20-nov-2026 ~20:55)

- Link: https://www.instagram.com/golfers.plus/reel/Df-5I8dM662/
- La aprobó Juanjo en el chat («Publicar hoy 20:00»). Archivo: `Pieza 2 - Green isla (v8) IG.mp4`
  (33,6 s, -13,8 LUFS), con portada propia y caption de 1.709 caracteres.
- **Variable que cambió respecto de la pieza 1:** voz sintética → texto en pantalla con música, y
  cada dato con su fuente en pantalla (respuesta al comentario «Muestren los datos»).
- **Hipótesis:** mostrar la fuente en cuadro y cerrar con una pregunta de respuesta numérica sube
  guardados y comentarios por espectador sobre la pieza 1 (0,43 % y 0,04 %).
- Lecturas pendientes: 72 h (lun 23-nov) y 7 días (vie 27-nov).

### Pieza 1 contra referencias externas (19-nov-2026)

Fuentes:
- **Socialinsider, Instagram Reels benchmarks.** 67,5 M de publicaciones orgánicas de 579 mil cuentas de empresa, 2024-2025, con resultados por tamaño de cuenta.
- **Dash Social, Instagram Reels benchmarks H2 2025.** 3.300 marcas con 1.000 seguidores o más. Define tasa de interacción como interacciones ÷ visualizaciones.
- **Metricool, Estudio de Instagram 2026.** 24,4 M de publicaciones de 375 mil cuentas, ene-feb 2026 contra ene-feb 2025. Incluye cuentas chicas y es de habla hispana: es la referencia más cercana a nosotros.

Ninguna mide golf ni Chile. Todas miden sobre todo marcas, no cuentas educativas de nicho.

| Métrica | Pieza 1 | Referencia | Lectura |
| --- | --- | --- | --- |
| Visualizaciones por reel | 9.111 | 580 (cuentas de 1-5 mil seguidores) · 16.035 (100 mil a 1 M) — Socialinsider | ~16 veces una cuenta chica |
| Interacciones ÷ cuentas alcanzadas | 3,2 % (243 ÷ 7.628) | 3,54 % Reels, ene-feb 2026, 375 mil cuentas — Metricool (definición por confirmar) | **Normal**, no excepcional |
| Interacciones ÷ visualizaciones | 2,7 % | 0,1 %-0,5 % según industria — Dash Social | Por encima, pero la muestra son marcas grandes: no es comparable |
| Compartidos ÷ visualizaciones | 0,54 % | 0,46 % promedio · 0,51 % medios y entretenimiento — Dash Social (*) | Sobre el promedio |
| Guardados ÷ visualizaciones | 0,36 % | 0,22 % marcas — Dash Social · 0,60 % cuentas de 100 mil a 1 M — Socialinsider (*) | Neutro |
| Comentarios ÷ visualizaciones | 0,03 % | 0,37 % cuentas de 100 mil a 1 M — Socialinsider (60 com. ÷ 16.035 vis.) (*) | **Débil: ~10 veces menos** |

(*) Tasa calculada por nosotros dividiendo dos promedios publicados; el estudio no la publica como tasa.
Es una aproximación de orden de magnitud. La única cifra publicada que se compara directo es la de
visualizaciones por tamaño de cuenta (Socialinsider). Embudo propio: toques en el enlace ÷ visitas
al perfil = 3 % contra una meta de 30 % — **débil**.

Las referencias son promedios de otras cuentas y otros rubros. Sirven para saber en qué orden de
magnitud estamos, no para decidir. La comparación que manda es contra nuestras propias piezas.

### Cuentas de golf de EE. UU. como referencia (medido el 19-nov-2026)

Decisión de Juanjo del 19-nov: las cuentas de golf de EE. UU. son referentes aunque publiquen en
inglés. Medí los últimos 12 reels de cada una en su pestaña de reels (visualizaciones públicas).
Mediana sin los reels fijados, cuando se pudo identificarlos.

| Cuenta | Tipo | Seguidores | Mediana vis./reel | Mediana ÷ seguidores | Mejor reel |
| --- | --- | --- | --- | --- | --- |
| @thegrintgolf | App de score (competidor directo) | 54,7 mil | ~6.800 | ~12 % | 40,9 mil |
| @18birdiesapp | App de score (competidor directo) | 61,6 mil | ~12.800 | ~21 % | 412 mil |
| @arccosgolf | Datos de golf (el más parecido) | 78,7 mil | ~27.000 | ~35 % | 71,6 mil |
| @mygolfspy | Datos y pruebas de equipo | 528 mil | ~87.000 | ~16 % | 1,8 M |
| @golf_com | Medio | 825 mil | ~34.000 | ~4 % | 257 mil |
| @golfdigest | Medio | 2 M | ~138.000 | ~7 % | 400 mil |
| @goodgood | Entretención | 1,1 M | ~291.000 | ~26 % | 24,5 M |
| @pgatour | Liga | 6,2 M | ~494.000 | ~8 % | 1,3 M |
| **@golfers.plus** | Datos + app | ~100 | 9.111 (1 reel) | — | 9.111 |

Interacción de @arccosgolf en 2 reels (al pasar el mouse): 53 me gusta y 2 comentarios sobre 4.308
visualizaciones (1,2 % y 0,05 %), y 119 y 4 sobre 8.746 (1,4 % y 0,05 %). Pieza 1: 1,7 % y 0,03 %.

Lo que se lee:
- **El reel 1 rindió en la liga de los competidores directos** (TheGrint, 18Birdies), que tienen más
  de 50 mil seguidores. Por debajo de Arccos, que es la vara del rubro de datos.
- **La distribución es de golpes de suerte:** el mejor reel de cada cuenta vale entre 3 y 80 veces
  su mediana (18Birdies: mediana ~12.800 y dos reels de 371 y 412 mil). Una pieza sola no dice nada;
  se juzga la mediana.
- **En golf se comenta poco:** Arccos queda en ~0,05 % de comentarios por visualización. Nuestro
  0,03 % está en el rango del rubro, no 10 veces abajo (eso salía de comparar con marcas genéricas).
- **Perfil:** TheGrint tiene destacados por función (App Functions, Courses, Community, FAQ, Games)
  y una bio de 3 líneas que dice qué es la app. MyGolfSpy se posiciona en una línea («Unbiased,
  Data-Backed Reviews»). Es el modelo para nuestro perfil.
- **Formatos de TheGrint que calzan con la app:** formatos de juego entre amigos («How to play
  Vegas», «Match play») y llamadas a mandar («Send this to someone who…»).

### Bio del perfil (revisada el 20-nov-2026, antes de la pieza 2)

- La bio actual se queda como está. Ya dice qué es la app y lo que viene:
  «Datos de golf para jugar mejor. / Lleva el score con tus amigos y guarda tus tarjetas. /
  Torneos en vivo, muy pronto. / Hecho en Chile.» (129/150). No hacía falta cambiarla.
- Enlace: `golfersplus.vercel.app`, sin parámetros de seguimiento. **Instagram web no deja editar
  el enlace** («Solo puedes editar tus enlaces en móviles»). El enlace con seguimiento
  (`?utm_source=instagram&utm_medium=bio&utm_campaign=perfil`) se cambia desde el teléfono.
  Sin ese cambio, los clics del perfil se siguen leyendo en el Panel para profesionales
  (toques en el enlace).

## Cómo se evoluciona pieza a pieza (desde el 19-nov-2026)

El umbral de arriba sigue mandando para **cambiar la estrategia**. Esto es otra cosa: el método
para que cada pieza aprenda de la anterior sin sobre-reaccionar.

1. **Una hipótesis escrita antes de publicar**, con una sola variable cambiada respecto de la
   pieza anterior (el gancho, la duración, el tipo de pregunta, la hora, etc.). Ejemplo: «la
   pregunta con respuesta numérica genera más comentarios que la pregunta abierta».
2. **Lectura a las 72 h y a los 7 días**, siempre en tasas por espectador (no en totales, que
   dependen de cuánto la empujó Instagram).
3. **El tablero de cada pieza**, en este orden de importancia:

   | Etapa | Métrica | Pieza 1 | Por qué importa |
   | --- | --- | --- | --- |
   | Negocio | toques en el enlace / visitas al perfil | 1/30 = 3 % | Es lo único que lleva a la app |
   | Retener | % que la ve completa · tiempo medio | sin dato | 1ª señal de reparto |
   | Mandar | compartidos / espectadores | 0,64 % | Lleva a no seguidores |
   | Guardar | guardados / espectadores | 0,43 % | Contenido de referencia |
   | Seguir | seguidores nuevos / espectadores | 1,26 % | Audiencia futura |
   | Conversar | comentarios / espectadores | 0,04 % | Señal y comunidad |

4. Se compara contra la **mediana de las piezas anteriores** (con menos de 3, contra la pieza 1).
   Una pieza mejor o peor se anota; la estrategia cambia solo con el umbral.
5. **Errores y fricción se corrigen al tiro, sin umbral:** un perfil que no convierte, un
   comentario sin respuesta, una portada que se corta.

## Decisiones de Juanjo que pisan al plan (12 al 16-nov-2026)

No son datos de métricas: son decisiones de producto del dueño, y por eso valen ya.

- Desde la pieza 1, el contenido central es **cómo jugar mejor con datos** (mito → dato → visual
  cenital → consejo), estilo «mundo de golf verde» animado. La app aparece solo como teléfono unos
  segundos o en el cierre. Reglas y hándicap quedan fuera de este formato.
- Distancias **siempre en yardas**.
- Voz sintética: **no** desde la pieza 2. Mientras no haya voz humana, la pieza va con texto en
  pantalla y música.
- Gráficas: nada plano ni infantil. Hoyos con **silueta reconocible de canchas icónicas, sin
  nombres ni logos**. Si se muestra dispersión de pelotas, tiene que corresponder al dato.
- Portada: todo el texto dentro del 3:4 central (la grilla recorta arriba y abajo).

## Decisiones de Juanjo del 19-nov-2026

- **El perfil lo arma Claude con autonomía**: bio, enlace y destacados.
- **Ritmo: 2 publicaciones por semana**, con variedad (reels, carruseles, fotos e historias para los
  destacados), siempre cargado a reels.
- **Mezcla de contenido** (la proporción es un ejemplo de Juanjo, no una regla rígida): de cada 3
  publicaciones, ~2 de datos de golf y tendencias, y ~1 de la app.
  - Lo que se muestra de la app es lo que ya está casi listo: **llevar el score con amigos y guardar
    la tarjeta**, y el historial de tarjetas para ver patrones de juego.
  - **Se anuncia como «próximamente»**: campeonatos en vivo y leaderboards.
  - **El coach IA no se menciona por ahora.** Se planifica para dentro de unos 4 meses (~mar-2027).

## Bitácora

Una entrada por cambio de estrategia, con su dato. Sin entradas todavía.

<!--
Formato de cada entrada:

### AAAA-MM-DD — <qué cambió>
- **Dato:** <el número, de dónde salió, sobre cuántas piezas>
- **Antes:** <lo que decía el plan>
- **Ahora:** <lo que vale desde hoy>
-->
