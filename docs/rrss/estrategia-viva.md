# Estrategia viva de RRSS

> Lo que sabemos **por datos propios** sobre qué funciona en la cuenta de Instagram de Golfers+.
> `/rrss` lee este archivo ANTES que `plan-lanzamiento.md` y lo que diga acá pisa al plan.
>
> Última actualización: 27-oct-2026 · Piezas publicadas: **0** · Datos propios: **ninguno**.

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

- **El reel 1 está producido y empaquetado**, muda, 16,5 s, 1080×1920 (`anota-todos-ven`). La
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
| Nunca la palabra "premium" en el copy | Guía de marca y plan, sección 1 | Nada |
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
y clics al link. **Cuatro de esas seis dependen de que el video retenga**; alcance y likes son las
dos que menos dicen.

Lo que de verdad se persigue no es ninguna de las seis: es **un club que escriba**. Un mensaje de
un organizador vale más que diez mil reproducciones, y cuando pase hay que anotar qué pieza vio.

## Bitácora

Una entrada por cambio de estrategia, con su dato. Sin entradas todavía.

<!--
Formato de cada entrada:

### AAAA-MM-DD — <qué cambió>
- **Dato:** <el número, de dónde salió, sobre cuántas piezas>
- **Antes:** <lo que decía el plan>
- **Ahora:** <lo que vale desde hoy>
-->
