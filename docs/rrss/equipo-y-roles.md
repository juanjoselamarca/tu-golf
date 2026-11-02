# El equipo de RRSS: quién hace qué

> Para Juanjo, en claro. Escrito el 29-oct-2026, después de que el sistema quedara andando.
> Si esto y el comando `/rrss` se contradicen, manda el comando: es el que se ejecuta.

## La idea en una frase

No hay un equipo de agentes conversando entre ellos. Hay **un Claude que cumple seis roles en
orden**, **scripts que hacen todo lo que se puede verificar** y **un portón que solo abres tú**.
Esa es la arquitectura completa, y es deliberada.

## Por qué no son varios agentes hablando entre sí

Un "equipo" de agentes que se pasan la pieza suena mejor de lo que funciona. Tres razones concretas
para no hacerlo acá:

1. **Cada traspaso pierde información.** Un agente le cuenta a otro lo que hizo; el segundo trabaja
   sobre el resumen, no sobre la pieza. Los errores que cuestan caro —un número sin fuente, un
   titular que no calza con el video— viven justo en el detalle que se pierde en el resumen.
2. **Cuesta plata real.** Cada agente nuevo relee contexto. El cupo mensual se agota con contextos
   grandes, no con trabajo difícil, y ya nos pasó este mes.
3. **Donde un agente ayuda de verdad es juzgando, no produciendo.** Un segundo modelo que revisa lo
   que escribió el primero encuentra cosas; uno que produce en paralelo solo duplica el gasto.

Así que: un Claude, seis sombreros, y la parte aburrida en scripts.

## Los seis roles, en el orden en que ocurren

| # | Rol | Qué decide | Quién lo ejecuta |
| --- | --- | --- | --- |
| 1 | **Estratega** | Qué pilar toca esta semana y por qué | Claude, leyendo `estrategia-viva.md` y `plan-lanzamiento.md` |
| 2 | **Director creativo** | La idea de la semana, en una frase | Claude |
| 3 | **Productor** | El reel, el carrusel, las stories | Claude escribe el guion; **los scripts los fabrican** |
| 4 | **Revisor** | Si la pieza sale o se corrige | Un agente **que no la produjo** (`revisor-rrss`) |
| 5 | **Portón** | **Si se publica o no** | **Tú. Solo tú.** |
| 6 | **Operador** | Subir a Instagram, pieza por pieza | Claude por el navegador, preguntando antes de cada una |

Y después, callado: el **analista**, que mira qué pasó y solo cambia la estrategia si hay datos
suficientes (no por uno o dos videos).

## La regla que ordena todo: si se puede verificar, lo hace una máquina

Un modelo es bueno para decidir qué contar y pésimo para garantizar que algo se cumple siempre. Por
eso lo que tiene respuesta correcta vive en un script que no se cansa ni se distrae:

- **Los controles de marca** (`validar.mjs`) — si la pieza no los pasa, el render no escribe el
  archivo. No existe la pieza mal hecha esperando que alguien la note.
- **El español de Chile** (`voseo.mjs`) — lo revisa un script, y el CI también.
- **El portón de huellas** (`publicar.mjs`) — compara lo que aprobaste contra lo que hay en disco.
- **La escena del reel** — el guion **falla a propósito** si la app deja de recalcular el
  leaderboard. Si el gesto no cambia al líder, la grabación no sale, en vez de salir mintiendo.
- **La máquina de estados** (`cola.mjs`) — una tanda rechazada no se puede empaquetar. No por
  convención: no hay camino en el código.

Lo que queda para el modelo es lo que no tiene respuesta correcta: qué vale la pena contar.

## Dónde entras tú: una decisión por semana

Recibes la tanda armada —la idea, el reel, el caption completo— y tienes tres botones: **Aprobar ·
Pedir cambios · Rechazar**. Eso es todo lo que el sistema te pide en una semana normal.

Las otras dos cosas que solo decides tú, cuando aparecen: **usar datos o nombres de gente real**, y
**usar el nombre de un club**. Ninguna de las dos la toma Claude.

Y un detalle que importa: **aprobar no es publicar**. Tu "Aprobar" solo deja la carpeta lista. Subir
es un paso aparte, pieza por pieza, y vuelve a preguntarte antes de cada una.

## El revisor independiente: por qué existe

Hasta el 29-oct el que producía la pieza era el que la revisaba. En el código del proyecto hacemos
lo contrario —"el autor nunca se revisa a sí mismo"— porque sabemos que no funciona: el que
escribió algo lee lo que quiso escribir. En RRSS eso significaba que el primer par de ojos frescos
sobre una pieza eras tú, justo lo que el sistema prometía evitarte.

Ahora, antes de que la tanda llegue a tu teléfono, pasa por un agente que **no la produjo**. Recibe
un expediente mecánico —el caption entero, cada lámina, el reel momento a momento con duraciones,
y las imágenes para abrir— y no sabe qué quiso decir el autor. Eso es la ventaja: si una pieza
solo se entiende sabiendo lo que el autor tenía en la cabeza, el revisor lo caza.

Responde una sola cosa: *¿se publica o se corrige?* Y no es una sugerencia: el script que arma la
tanda **exige el veredicto archivado** para mandarte algo, y con un CORREGIR se niega. El veredicto
queda guardado en `out/rrss/expedientes/`, así que puedes leer qué se revisó y con qué criterio.

Lo que sigue llegando a ti es la decisión de publicar. Lo que ya no te llega es la falta de
ortografía.

## Lo que el sistema no hace nunca, por diseño

Seguir cuentas, dar likes, comentar en cuentas ajenas, mandar mensajes directos. Son las acciones
repetidas que Instagram castiga con restricciones, y más en una cuenta nueva. Solo se publica lo
nuestro.

## Si algo se rompe

El sistema está **aislado de la app**: corre en scripts aparte, con su propia base de pruebas, y no
toca la aplicación que usan los torneos. Un fallo acá arruina una publicación, nunca una ronda.
Ese aislamiento fue la primera decisión de arquitectura, antes que cualquier otra.
