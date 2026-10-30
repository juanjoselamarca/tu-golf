/**
 * El saneado del texto que se archiva en una tanda.
 *
 * `scripts/rrss/tandas/<slug>.json` se commitea y el repo es PÚBLICO, así que todo texto
 * escrito por una persona o por un agente que entre ahí tiene que pasar por acá antes.
 *
 * Vive en su propio módulo porque tiene DOS escritores: el veredicto del revisor, que
 * archiva `tanda.mjs`, y la nota con que Juanjo pide un cambio, que archiva
 * `aprobacion.mjs`. La función estaba en `tanda.mjs`, y como `tanda.mjs` importa
 * `aprobacion.mjs` para mandar el portón, la nota no podía usarla sin un ciclo: se
 * archivaba cruda, y el canario de las tandas ponía rojo el pre-push sin que hubiera una
 * salida limpia —el texto ya estaba commiteado—. Un concepto, una fuente: los dos
 * escritores importan de acá.
 */

/**
 * Un tramo que es una ruta de la máquina de quien revisó: Windows (`C:\...`, `C:/...`),
 * los home de POSIX y los temporales donde vive el scratchpad de una sesión (`/tmp/`,
 * `/var/folders/` en macOS). Corta en el primer espacio, comilla, backtick, paréntesis o
 * corchete: lo que sigue ya no es la ruta, y de eso se encarga `COLA_DE_RUTA`.
 *
 * Las dos alternativas piden que antes no venga pegado un carácter de nombre, y por el
 * mismo motivo: una URL no es una ruta de disco. En `https://golfersplus.vercel.app` la
 * `s:/` calzaba como letra de unidad y el veredicto se archivaba diciendo "el CTA manda a
 * httpen-vivo"; con `/tmp/` y `/Users/` en la lista, `https://ejemplo.com/tmp/foto.png`
 * quedaba en `https://ejemplo.comfoto.png`. Evidencia corrompida, sin ninguna ruta de
 * disco que lo justificara. `file:///C:/...` sigue cayendo, porque esa `C` viene después
 * de una barra.
 *
 * El punto NO está en el lookbehind de la rama POSIX, a propósito: un revisor abrevia la
 * ruta larga del scratchpad como `.../tmp/claude/...`, y con el punto bloqueado esa cita
 * salía intacta —con el nombre de usuario que la carpeta codifica— y sin que el canario
 * la viera, porque ahí no queda ni letra de unidad ni backslash. `../tmp/x.md` también
 * cae, y archivar `x.md` de una ruta relativa del repo es lo correcto.
 *
 * Los dos puntos tampoco: `file:/home/quiensea/out/a.md` —una sola barra, que es forma
 * válida de escribir un `file:`— salía intacto, igual que un "ruta:/home/...". Ninguna URL
 * se pierde por esto, porque en una el carácter pegado a la barra es el del host
 * (`ejemplo.com/tmp/`) y ese sigue bloqueado.
 *
 * Y la tercera alternativa es el mismo disco de Windows escrito en forma POSIX: `/c/Users/`,
 * `/mnt/c/Users/`. Es como lo muestra un shell POSIX sobre Windows, que es la herramienta
 * con la que un revisor mira el repo, así que aparece citado tal cual —y salía intacto con
 * el nombre de usuario, porque las otras dos no lo ven: no hay letra de unidad con dos
 * puntos, y antes de `/Users/` está pegada la letra del disco, que el lookbehind bloquea.
 * El canario lo cazaba recién en el push y con un mensaje que no explicaba nada.
 */
const RUTA_DE_DISCO =
  /(?:(?<![A-Za-z0-9])[A-Za-z]:[\\/]|(?<![\w-])\/(?:mnt\/)?[A-Za-z]\/(?:home|Users)\/|(?<![\w-])\/(?:home|Users|tmp|var\/folders)\/)[^\s"'`)\]<>]*/g

/**
 * Lo mismo cuando la ruta viene entre backticks, que es como la escribe un revisor al
 * citar un archivo: ahí el espacio no ambigua nada y la ruta se puede tomar entera.
 *
 * Importa porque la ruta real de esta máquina TIENE un espacio
 * (`C:\Users\<quien sea>\OneDrive\Escritorio\Proyectos IA\tu-golf\...`) y la pasada de
 * arriba corta en el primero: se llevaba el nombre de usuario y archivaba
 * `Proyectos IA\tu-golf\out\...`, que sigue siendo cómo tiene ordenado el disco quien
 * revisó, con backslashes de Windows y todo.
 *
 * Acá la ruta arranca pegada al backtick, así que no hace falta el cuidado de las URLs:
 * un revisor no cita un link entre backticks y adentro una ruta absoluta.
 */
const RUTA_ENTRE_BACKTICKS =
  /`((?:[A-Za-z]:[\\/]|\/(?:mnt\/)?[A-Za-z]\/(?:home|Users)\/|\/(?:home|Users|tmp|var\/folders)\/)[^`\n]*)`/g

/**
 * La cola que quedó de una ruta cortada en un espacio, pegada a la marca que acaba de
 * escribir la pasada anterior.
 *
 * Es la fuga que más costó ver, porque el canario no la mira: cuando la ruta no llega a
 * un archivo, la pasada de arriba deja `MARCA_LOCAL` y lo que venía después del espacio
 * —`IA\tu-golf\out\rrss\anota-todos-ven`, la estructura de carpetas entera— se quedaba
 * tal cual. Pasaba cada vez que la cita terminaba en una CARPETA (lo más natural al
 * decir dónde están las tomas), cuando el archivo tenía una extensión fuera de la lista,
 * y cuando el tramo traía un `:347` de número de línea.
 *
 * La adyacencia hace casi todo el trabajo: el tramo viene inmediatamente después de una
 * marca que esta misma función escribió hace un momento, así que es la cola de esa ruta y
 * de nada más.
 *
 * Casi todo, no todo, y acá estaba escrito al revés: decía que un `\n\n` de prosa nunca
 * cumple esa adyacencia, y la cumple. Una ruta que termina en el nombre de usuario deja
 * la marca sola, y lo que el revisor escribió después pasaba a ser "la cola" por pura
 * vecindad:
 *
 *     "el veredicto en C:\Users\juan.perez `\n\n` separa los párrafos"
 *       →  "el veredicto en [ruta local] separa los párrafos"
 *
 * El criterio del revisor corrompido, y el flag `texto_saneado` solo dice que se tocó, no
 * qué se perdió. Así que de la cola se pide que PAREZCA una cola de ruta: lo decide
 * `esColaDeRuta`, y si no la cumple se devuelve el trozo entero sin tocar.
 */
const COLA_DE_RUTA = /\[ruta local\] ?([^\s"'`)\]<>]*[\\/][^\s"'`)\]<>]*)/g

/**
 * Un tramo con un backslash: lo que queda de una ruta de Windows cortada en un espacio.
 *
 * La ruta real de esta máquina tiene uno (`...\Escritorio\Proyectos IA\tu-golf\...`), así
 * que sin backticks la pasada de arriba archivaba `Proyectos IA\tu-golf\out\...`. Cuál de
 * esos tramos es una ruta y cuál es prosa lo decide `finalDeRuta`.
 */
const TRAMO_CON_BACKSLASH = /[^\s"'`)\]<>]*\\[^\s"'`)\]<>]*/g

/**
 * Un nombre de archivo de los que un revisor cita del expediente.
 *
 * Es una lista de extensiones y no "cualquier extensión corta" porque un nombre de
 * usuario también la cumple: `juan.perez`, y el `usuario.DOMINIO` que crea Windows
 * cuando el perfil colisiona (`juanj.DESKTOP-ABC`). Con el predicado laxo,
 * `C:\Users\juan.perez` se archivaba entero —el nombre de usuario, que es lo único que
 * esta función existe para no publicar— y ni el canario lo cazaba, porque ahí ya no queda
 * backslash ni letra de unidad.
 *
 * Y antes del punto tiene que haber un carácter de nombre: así `` `\w+\.md` `` —un
 * revisor hablando de un patrón, no de un archivo— no se archiva como `.md`.
 *
 * Una extensión que no esté en la lista se archiva como `MARCA_LOCAL`: se pierde un dato
 * de la cita, que es el lado seguro de equivocarse. Lo que NO era el lado seguro era la
 * cola: antes de `COLA_DE_RUTA`, un `algo.ps1` al final de una ruta con espacios dejaba
 * publicada la estructura de carpetas completa.
 *
 * Están todas las que produce o consume este pipeline, para que la cita no se pierda en
 * lo más normal: los subtítulos del reel (`.srt`, `.vtt`), su audio (`.mp3`, `.wav`,
 * `.m4a`), las láminas (`.png`, `.avif`) y las fuentes de las piezas (`.ttf`, `.woff2`).
 */
const NOMBRE_DE_ARCHIVO =
  /[^\\/.]\.(?:md|txt|json|png|jpe?g|webp|avif|gif|svg|mp4|mov|webm|mp3|wav|m4a|srt|vtt|html|xml|css|tsx?|jsx|[cm]?[jt]s|sql|csv|log|ya?ml|pdf|sh|ps1|mdx|ttf|woff2?)$/i

/**
 * El tramo que viene justo antes del nombre de usuario en un disco.
 *
 * `C:\Users\<quien sea>`, `/home/<quien sea>`, `/Users/<quien sea>`: lo que sigue a esto
 * es el usuario y no se archiva nunca, aunque parezca un nombre de archivo.
 */
const RAIZ_DE_USUARIOS = /^(?:users|home)$/i

/**
 * La puntuación con que termina la FRASE, no la ruta.
 *
 * Un revisor escribe "la toma está en C:\...\out\01.png." y ese punto entra al match: el
 * último tramo pasa a ser `01.png.`, que no calza como nombre de archivo, y el tramo se
 * archivaba tal cual —con la estructura de carpetas y los backslashes—. Se parte antes de
 * decidir y se vuelve a pegar después, así la frase queda como la escribió él.
 */
const PUNTUACION_FINAL = /[.,;:!?]+$/

/**
 * El número de línea con que un revisor cita un archivo: `tanda.mjs:347`, `:347:12`.
 *
 * Es la forma normal de señalar dónde está algo, y sin partirlo el tramo no calzaba como
 * nombre de archivo: la cita quedaba en `[ruta local]` —se perdían el archivo Y la
 * línea, o sea justo el dato por el que el revisor la escribió— y, cuando la ruta tenía
 * un espacio, la cola con la estructura de carpetas se publicaba igual.
 */
const SUFIJO_DE_LINEA = /:\d+(?::\d+)?$/

/**
 * Lo que se archiva de una ruta que no llega a un archivo.
 *
 * Va entre corchetes y no entre `<>` porque el mensaje a Telegram se manda con
 * `parse_mode: HTML`: un `<ruta local>` ahí lo rompe.
 */
const MARCA_LOCAL = '[ruta local]'

/**
 * Tope de vueltas de la pasada de la cola.
 *
 * Cada vuelta que cambia algo se come un tramo, y la última pasada es la que CONFIRMA que
 * no quedó nada: por eso el techo de lo que se puede sanear son `TOPE - 1` tramos con
 * espacio, y no el tope. Está alto a propósito. El tope no es una optimización —cada
 * vuelta es un `replace` sobre un texto que se va acortando— sino el freno para un bug en
 * la aritmética de `colaDeRuta`, y ponerlo justo convierte una ruta rara en una tanda
 * trabada: con diez, una cita con diez carpetas con espacio levantaba de forma
 * determinista aunque el saneado llegara al resultado correcto, y la tanda quedaba
 * bloqueada hasta que alguien editara el texto del revisor. Treinta y nueve tramos con
 * espacio no los tiene ninguna cita que alguien escriba a mano.
 */
const TOPE_DE_VUELTAS = 40

function tramosDeRuta(ruta) {
  return ruta.split(/[\\/]+/).filter(Boolean)
}

/**
 * El tramo partido en tres: el nombre, el número de línea con que el revisor lo citó y
 * la puntuación con que cerró la frase, en ese orden desde el final (`tanda.mjs:347.`).
 *
 * Van separadas porque se re-pegan distinto. El número de línea pertenece al archivo: si
 * el archivo no se nombra, el `:347` no señala nada y se va con él. La puntuación
 * pertenece a la FRASE y vuelve siempre, también cuando lo único que queda es la marca:
 * sin eso, "la lámina está cortada en C:\...\anota-todos-ven." quedaba en
 * "…en [ruta local]" y la oración se pegaba a la siguiente. Con una interrogación era
 * peor —`¿está en [ruta local]`, con el signo de apertura colgado—.
 */
function partirCola(tramo) {
  const punt = PUNTUACION_FINAL.exec(tramo)
  const sinPuntuacion = punt ? tramo.slice(0, punt.index) : tramo
  const linea = SUFIJO_DE_LINEA.exec(sinPuntuacion)
  const limpio = linea ? sinPuntuacion.slice(0, linea.index) : sinPuntuacion
  return [limpio, linea?.[0] ?? '', punt?.[0] ?? '']
}

/**
 * Lo que queda de una ruta citada: el nombre del archivo.
 *
 * Si el último tramo no es un nombre de archivo de los que se citan, o es el nombre de
 * usuario, no se archiva nada: en `C:\Users\quiensea` el último tramo es el usuario
 * —justo el dato que esto protege, y que se archivaba tal cual— y en el scratchpad de una
 * sesión POSIX es la carpeta que lo codifica. Una carpeta del disco de quien revisó no es
 * evidencia de nada y la cita se entiende igual.
 *
 * `path.basename` no sirve para esto: en Linux no corta por `\` y devolvería la ruta de
 * Windows entera, justo la que se quería sacar.
 */
function tramoArchivable(ruta) {
  const [limpia, linea, punt] = partirCola(ruta)
  const tramos = tramosDeRuta(limpia)
  const ultimo = tramos.at(-1)
  const esNombreDeUsuario = tramos.length >= 2 && RAIZ_DE_USUARIOS.test(tramos.at(-2))
  const archivable = ultimo && !esNombreDeUsuario && NOMBRE_DE_ARCHIVO.test(ultimo)
  return archivable ? ultimo + linea + punt : MARCA_LOCAL + punt
}

/**
 * La cola de una ruta ya marcada: o el nombre del archivo al que llegaba, o nada.
 *
 * Si la cola termina en un archivo, la marca sobra: la cita queda en `01.png` y se
 * entiende mejor que `[ruta local] 01.png`. Si no llegaba a ningún archivo, lo único que
 * aportaba era cómo tiene ordenado el disco quien revisó, así que queda la marca sola.
 *
 * Y si no parece cola de ruta no es cola de nada: es prosa del revisor que arrancó con un
 * separador, y se devuelve el trozo entero sin tocar.
 */
function colaDeRuta(todo, cola) {
  const [limpia, linea, punt] = partirCola(cola)
  const tramos = tramosDeRuta(limpia)
  const ultimo = tramos.at(-1)
  const esNombreDeUsuario = tramos.length >= 2 && RAIZ_DE_USUARIOS.test(tramos.at(-2))
  const archivable = ultimo && !esNombreDeUsuario && NOMBRE_DE_ARCHIVO.test(ultimo)
  if (archivable) return ultimo + linea + punt
  if (!esColaDeRuta(cola, tramos)) return todo
  return MARCA_LOCAL + punt
}

/**
 * Si lo que quedó pegado a una marca es el resto de una ruta o es prosa del revisor.
 *
 * Las dos condiciones están por el mismo motivo, y el motivo es que los dos errores no
 * cuestan lo mismo: tomar una ruta por prosa deja una carpeta, que el canario de las
 * tandas caza antes de que la pieza se publique; tomar la prosa por ruta se come palabras
 * del veredicto, y eso no se recupera —el texto archivado es lo único que queda de lo que
 * dijo el revisor—. Ante la duda, prosa.
 *
 * La primera condición es el backslash: en Windows —las dos máquinas que revisan hoy— una
 * ruta siempre lo tiene, y una barra normal justo después de una marca es prosa tanto como
 * ruta ("está en [ruta local] y/o en la nube", "[ruta local] 9/18 hoyos").
 *
 * La segunda es que algún tramo parezca un nombre de carpeta o de archivo: dos caracteres
 * o más y por lo menos una letra. Lo que un revisor cita CON backslash y no es ruta son
 * escapes de un carácter —`\n\n` deja los tramos `n` y `n`, lo mismo `\t` o `\r`— y
 * números —`9\18`—. Un tramo de ruta real no es de un solo carácter sin letras:
 * `IA\tu-golf\out`.
 *
 * Lo que sigue cayendo del lado equivocado no es un caso, es una clase: cualquier escape
 * de markdown o patrón con backslash escrito justo después de una marca. `\#golf`,
 * `\*negrita\*`, `\w+\.md` —los tres quedan en la marca sola, porque `golf`, `*negrita*` y
 * `w+` pasan de sobra por "dos caracteres con una letra"—. No vale una excepción: para que
 * ocurra hay que escribir uno de esos pegado a una ruta real, y lo que se pierde es un
 * token, no una frase. La condición existe por los `\n\n`, que es lo que un revisor
 * escribe de verdad cuando habla de cómo se separan los párrafos del caption.
 */
const TRAMO_CON_LETRA = /[A-Za-zÁ-ÿ]/

function esColaDeRuta(cola, tramos) {
  if (!cola.includes('\\')) return false
  return tramos.some((tramo) => tramo.length >= 2 && TRAMO_CON_LETRA.test(tramo))
}

/**
 * El final de una ruta de Windows cortada en un espacio… o prosa que lleva un backslash.
 *
 * Un backslash en el texto de un revisor no siempre es una ruta: `` `\n\n` `` hablando de
 * cómo separa los párrafos el caption, `\#golf`, `9\18`. Tomarlos por rutas archivaba
 * `` `n` `` en vez de `` `\n\n` ``, y corromper el criterio del revisor es peor que
 * dejarle una carpeta —el flag `texto_saneado` dice que se tocó, no qué—. Así que se toma
 * como ruta solo lo que tiene dos tramos o más y termina en un nombre de archivo, que es
 * el caso que motiva esta pasada: `IA\tu-golf\out\x.md`, o un UNC
 * `\\servidor\compartido\out\a.md`. La excepción es el nombre de usuario: `Users\juan.perez`
 * no es prosa de nadie, y ahí sí se reemplaza aunque no haya nombre de archivo.
 *
 * Esta pasada es la de los tramos SUELTOS, los que no vienen pegados a una marca: esos
 * los resuelve `COLA_DE_RUTA` antes, donde la adyacencia dice que son ruta sin tener que
 * adivinarlo. Lo que queda afuera a propósito es un tramo suelto que termina en carpeta
 * —indistinguible de prosa—; el canario de las tandas versionadas lo caza, aunque recién
 * cuando ya está commiteado.
 *
 * Y de ahí sale un límite conocido, que es cuando ESE tramo trae el nombre de usuario. Un
 * perfil a la vieja usanza, `C:\Documents and Settings\juan.perez\out`, deja pegado a la
 * marca un `and` sin backslash —que no es cola de nada— y suelto un
 * `Settings\juan.perez\out`: dos tramos, pero el penúltimo no es la raíz de los usuarios y
 * el último es una carpeta, así que vuelve intacto con el usuario adentro. Ensanchar la
 * adyacencia para alcanzarlo es empezar a comerse prosa, que cuesta más; el canario lo caza
 * en el push, por `MARCA_CON_COLA`, y ahí la salida es editar la tanda a mano. Hoy no hay
 * ninguna máquina del proyecto con un perfil así.
 */
function finalDeRuta(tramo) {
  const [limpio, linea, punt] = partirCola(tramo)
  const partes = tramosDeRuta(limpio)
  if (partes.length < 2) return tramo
  if (RAIZ_DE_USUARIOS.test(partes.at(-2))) return MARCA_LOCAL + punt
  if (!NOMBRE_DE_ARCHIVO.test(partes.at(-1))) return tramo
  return partes.at(-1) + linea + punt
}

/**
 * El texto del veredicto sin las rutas del disco de quien revisó.
 *
 * La tanda se guarda en `scripts/rrss/tandas/<slug>.json`, que se commitea, y el repo es
 * PÚBLICO. `rutaArchivable` cuida la ruta del archivo; el texto, en cambio, es la salida
 * cruda de un agente que leyó el expediente con rutas absolutas —el prompt se las da— y
 * las cita al decir dónde vio cada cosa. De una cita así lo que importa es el nombre del
 * archivo: la carpeta de arriba es el nombre de usuario de quien revisó y cómo tiene
 * ordenado el disco.
 *
 * Se reemplaza el tramo de ruta, nunca la línea: el criterio del revisor se archiva
 * entero, que es el punto de guardar su respuesta tal cual. Y se usa solo para la copia
 * archivada: lo que se lee para decidir el veredicto es el archivo como lo escribió él.
 *
 * Son cuatro pasadas porque una ruta con espacios es ambigua en medio de una frase, y
 * comerse palabras del revisor es peor que dejar una carpeta. Primero las que vienen
 * entre backticks, que es como las cita un revisor y donde el espacio no ambigua nada;
 * después las que arrancan con unidad o con un home; después la cola que quedó pegada a
 * la marca, que es ruta por adyacencia y no hay que adivinarlo; y al final lo que quedó
 * suelto con un backslash, con el criterio de `finalDeRuta` para no comerse un `\n` de
 * prosa.
 *
 * Aplicarla dos veces da lo mismo, y no es un lujo: el canario de las tandas versionadas
 * pregunta `sinRutasDeDisco(archivado) === archivado` para saber si un texto se archivó
 * sin pasar por acá, así que el día que la función deje de ser punto fijo el pre-push se
 * pone rojo sobre una tanda limpia y sin salida —el texto ya está commiteado—. Por eso la
 * pasada de la cola corre DOS veces: una antes de `finalDeRuta` y otra después. La de
 * antes tiene que converger sola, porque `finalDeRuta` metido en ese bucle cambia el
 * resultado: con la cola a medio comer, `[ruta local] golf\out\01.png` termina en
 * `[ruta local] 01.png` en vez de `01.png`. Y la de después existe porque `finalDeRuta`
 * escribe marcas nuevas, y esas nunca habían pasado por `COLA_DE_RUTA`: ahí se comía el
 * `\n\n` del revisor en la segunda aplicación. Después de esa segunda vuelta no queda
 * nada por hacer: lo único que `finalDeRuta` deja pegado a una marca es o cola de ruta
 * —que esa vuelta se come— o prosa, que ninguna pasada vuelve a tocar.
 *
 * Lo que se corrompe a propósito, por no valer una excepción: `C:\` solo, hablando del
 * disco y no de una ruta, queda en `[ruta local]`.
 *
 * Lo que queda afuera, y el canario tampoco ve: un nombre de usuario CON ESPACIO
 * (`C:\Users\juan perez` deja `[ruta local] perez`), y una carpeta con espacio en una
 * ruta de POSIX, llegue o no a un archivo (`/home/x/Proyectos IA/mis fotos/01.png` deja
 * `[ruta local] IA/mis fotos/01.png`). Las dos piden distinguir una palabra de la frase de
 * un tramo de ruta, que es adivinar, y comerse una palabra del revisor es el error que
 * esta función no debe cometer: de la cola se exige un backslash justamente porque en
 * Windows lo hay siempre, y en POSIX la barra sola no distingue "y/o" de una carpeta. Los
 * dos perfiles que revisan hoy son de Windows y no tienen espacio. El nombre de usuario sí
 * se va en los dos casos, que es lo que esta función existe para proteger; lo que queda es
 * un nombre de carpeta.
 *
 * Esa cola la caza `MARCA_CON_COLA` en el canario de las tandas antes de que se publique,
 * pero solo mientras le queden DOS separadores o más (`[ruta local] IA/mis fotos/01.png`).
 * Con uno solo (`[ruta local] IA/tu-golf`, que es lo que deja la forma `/c/Users/...` de
 * un shell POSIX) no la ve, y no se puede ampliar: con un separador, esa forma no se
 * distingue de un "y/o" o de un "9/18" escritos en la frase.
 */
export function sinRutasDeDisco(texto) {
  const marcado = sinColasPegadas(
    texto
      .replace(RUTA_ENTRE_BACKTICKS, (_, ruta) => `\`${tramoArchivable(ruta)}\``)
      .replace(RUTA_DE_DISCO, (ruta) => tramoArchivable(ruta)),
  )

  return sinColasPegadas(marcado.replace(TRAMO_CON_BACKSLASH, (tramo) => finalDeRuta(tramo)))
}

/**
 * La pasada de la cola, hasta que no quede nada pegado a ninguna marca.
 *
 * Va en bucle porque una ruta puede tener más de un espacio
 * (`...\Proyectos IA\tu golf\out`): cada vuelta se come un tramo más. Termina siempre:
 * cada vuelta que cambia algo deja el texto estrictamente más corto —el reemplazo es un
 * nombre de archivo o la marca sola, las dos cosas más cortas que la marca más la cola— y
 * la vuelta que no cambia nada corta. El tope existe para que un bug futuro en esa
 * aritmética no cuelgue el proceso, y si se alcanza se levanta: devolver texto a medio
 * sanear es publicar la carpeta, y acá no hay nada en juego que no sea volver a correr el
 * montaje.
 */
function sinColasPegadas(texto) {
  let salida = texto
  for (let vuelta = 0; ; vuelta += 1) {
    if (vuelta >= TOPE_DE_VUELTAS)
      throw new Error(
        `El saneado de rutas no converge en ${TOPE_DE_VUELTAS} vueltas. Es un bug de ` +
          '`colaDeRuta`: cada vuelta que cambia algo tiene que acortar el texto. No se ' +
          'sigue porque el texto quedaría a medio sanear y la tanda se commitea en un repo ' +
          'público. Si llegara a pasar con un texto real, la salida inmediata es acortar ' +
          'en el veredicto la cita que lo provoca —nombrar el archivo sin la ruta— y ' +
          'volver a correr el montaje.',
      )
    const antes = salida
    salida = salida.replace(COLA_DE_RUTA, (todo, cola) => colaDeRuta(todo, cola))
    if (salida === antes) return salida
  }
}
