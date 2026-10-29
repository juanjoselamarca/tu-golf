// Los datos de cada escena de video, versionados: la toma tiene que salir igual
// hoy y cuando haya que regrabarla con otro encuadre.
//
// `golpes` va hoyo a hoyo en el orden de `hoyos_jugados`. El hoyo del gesto
// queda SIN anotar a propósito: es lo que el jugador hace en cámara.
import { createHash } from 'node:crypto'

/**
 * La cancha de la escena, DECLARADA acá: par y stroke index de los 18 hoyos y
 * los ratings de cada tee.
 *
 * Está escrita y no leída de la base por dos razones. Una: `escena.mjs` la
 * compara contra `course_holes` y `course_tees` antes de sembrar y aborta si el
 * catálogo cambió, así que no puede quedar desactualizada en silencio. Dos: con
 * los datos acá, `rrss-escenas.test.ts` puede verificar con el motor de golf que
 * la escena cuenta la historia que dice contar —el gesto cambia al líder— sin
 * tocar ninguna base.
 *
 * **El club es ficticio, a propósito.** La primera versión de la escena grabó
 * sobre "Club de Golf Los Leones", que es un club real de Santiago: una pieza
 * publicitaria con su nombre en el header insinúa una relación que no existe, y
 * encima con un torneo y cuatro jugadores inventados. El plan de lanzamiento ya
 * lo tenía decidido (`docs/rrss/plan-lanzamiento.md`, sección 3): hasta que un
 * club dé el OK por escrito, las piezas van con datos demo y nombres ficticios
 * creíbles. "Los Quillayes" no está en el catálogo de 193 canchas ni aparece como
 * club de golf chileno en la web (verificado el 29-oct-2026).
 *
 * `ficticia: true` es lo que autoriza a `escena.mjs` a CREAR la cancha en la base
 * de pruebas. Una escena que declare un club real no la crea: ahí el catálogo es
 * el del club y inventarle ratings sería publicar un dato falso sobre su cancha.
 *
 * Los números (par, stroke index, ratings y slopes de los dos tees) son los que
 * ya tenía verificada la escena con el motor de golf, y por eso no se tocan: de
 * ellos dependen los hándicaps de juego 13/19/23/34 y que el birdie del hoyo 12
 * cambie al líder. Cambiar el nombre del club no cambia una sola cuenta.
 */
const LOS_QUILLAYES = {
  nombre: 'Club de Golf Los Quillayes',
  ficticia: true,
  // Para crearla en la base de pruebas: lo que pide la fila de `courses`.
  ciudad: 'Santiago',
  pais: 'Chile',
  // 18 hoyos, en orden. Par 72 (43 en los primeros 11).
  hoyos: [
    { par: 4, si: 17 }, { par: 4, si: 5 }, { par: 3, si: 14 },
    { par: 5, si: 1 }, { par: 4, si: 11 }, { par: 3, si: 15 },
    { par: 4, si: 4 }, { par: 4, si: 7 }, { par: 5, si: 10 },
    { par: 4, si: 12 }, { par: 3, si: 18 }, { par: 4, si: 13 },
    { par: 4, si: 2 }, { par: 3, si: 16 }, { par: 4, si: 3 },
    { par: 4, si: 6 }, { par: 5, si: 8 }, { par: 5, si: 9 },
  ],
  // El rating y el slope salen del TEE, no de la cancha. La fila de `courses`
  // también los tiene (son el fallback cuando no hay tee) y acá se declaran
  // iguales a los del blanco, que es el tee de la ronda: así ningún camino del
  // motor puede dar un neto distinto del que verifica el test.
  course_rating: 71.6,
  slope_rating: 129,
  tees: {
    blanco: { genero: 'M', rating: 71.6, slope: 129, par: 72 },
    rojo: { genero: 'F', rating: 74.8, slope: 131, par: 72 },
  },
}

/** Los 18 hoyos, para una escena que arranca con la vuelta entera anotada. */
const HOYOS_1_AL_18 = Array.from({ length: 18 }, (_, i) => i + 1)

/** Los 11 hoyos ya anotados cuando arranca la toma. Par 43. */
const HOYOS_1_AL_11 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export const ESCENAS = {
  // Pieza 1 del lanzamiento: "Anota. Todos ven lo mismo."
  //
  // La escena está armada para que el gesto CAMBIE AL LÍDER en cámara, que es lo
  // único que se entiende sin sonido ni texto:
  //
  //   al hoyo 12  →  Diego E (1º) · Juan +1 (2º) · María +2 · Catalina +5
  //   el birdie   →  Juan −1, toma la punta
  //
  // Juan juega con índice 11.8 a propósito: desde el tee blanco (rating 71.6,
  // slope 129) su course handicap queda en 13, y 13 le da golpe en el hoyo 12
  // (SI 13). Así el birdie vale DOS golpes netos y el adelantamiento no depende
  // de cómo se desempate un E–E. Con 8.4 el course handicap daba 9, no recibía
  // golpe ahí y el gesto terminaba en un empate que en pantalla no se ve.
  //
  // Cada jugador tiene SU tee, que es de lo que habla la pieza: las damas desde
  // el rojo (rating y slope de damas) y los varones desde el blanco. Ponerlas a
  // todas en el blanco daba un neto calculado con rating de varones —un golfista
  // chileno lo nota— y dejaba el caption prometiendo un tee que no se veía.
  //
  // Los brutos NO se verifican a ojo: `src/__tests__/unit/rrss-escenas.test.ts`
  // recalcula el leaderboard con el motor de golf y falla si el orden no es ese
  // o si el gesto no cambia al líder.
  'anota-todos-ven': {
    codigo: 'RRSS01',
    cancha: LOS_QUILLAYES.nombre,
    catalogo: LOS_QUILLAYES,
    fecha: '2026-10-27',
    tee: 'blanco', // el de la ronda; cada jugador puede traer el suyo
    // `holes` y `hcp_pct` entran al cálculo del hándicap que puntúa
    // (`resolverHandicapDeJuego(index, courseData, holes, hcpPct)`), así que
    // viven acá y no escritos a mano en la siembra: el test usa los mismos
    // valores que se insertan, y bajarlos a 9 hoyos o al 85 % hace fallar el
    // test en vez de cambiar los netos de la toma en silencio.
    holes: 18,
    hcp_pct: 100,
    // El board que muestra la toma es el NETO de stroke play: en bruto Juan ya
    // va primero por seis golpes y el birdie no adelanta a nadie. Los dos
    // campos se insertan desde acá y el test los afirma, porque cambiarlos
    // deja la grabación sin la única cosa que el reel muestra.
    modo_juego: 'neto',
    formato_juego: 'stroke_play',
    tema: 'dark', // navy + dorado: es la marca, y en el feed el crema se diluye
    hoyos_jugados: HOYOS_1_AL_11,
    hoyo_del_gesto: 12, // par 4, SI 13, 350 yardas
    golpes_del_gesto: 3, // birdie
    // La lámina final: sin ella el reel termina en una tabla y nadie sabe de
    // quién era la app. Se renderiza con `render.mjs` desde la misma guía de
    // marca que el resto de las piezas, no con una plantilla aparte.
    cierre: { pieza: '2026-10-27-anota-todos-ven', lamina: '01.png', ms: 2600 },
    jugadores: [
      // El primero es quien anota: lleva la sesión de Playwright.
      { nombre: 'Juan Pérez', handicap: 11.8, tee: 'blanco', golpes: [5, 5, 3, 6, 4, 4, 5, 5, 6, 4, 4] }, // 51
      { nombre: 'María González', handicap: 14.2, tee: 'rojo', golpes: [5, 5, 4, 7, 5, 4, 6, 6, 6, 5, 4] }, // 57
      { nombre: 'Diego Silva', handicap: 20.6, tee: 'blanco', golpes: [5, 6, 4, 7, 5, 4, 6, 6, 6, 5, 3] }, // 57
      { nombre: 'Catalina Rojas', handicap: 26.8, tee: 'rojo', golpes: [7, 6, 5, 8, 6, 5, 7, 7, 7, 5, 5] }, // 68
    ],
  },
  // Pieza 2 del lanzamiento: «Cada uno con su hándicap.»
  //
  // La misma vuelta entre amigos de la pieza 1, ahora con los 18 hoyos anotados.
  // El board de ronda libre pone en la MISMA fila los tres números del jugador
  // —su course handicap, su neto y su bruto— así que la cuenta se verifica en
  // pantalla: Catalina, 34 de hándicap, −1 neto, +33 bruto.
  //
  //   neto (el oficial)  →  Catalina −1 · Juan +1 · Diego +2 · María +4
  //   bruto (de apoyo)   →  Juan 86 · María 95 · Diego 97 · Catalina 105
  //
  // Catalina anota 105 —el PEOR bruto de los cuatro— y va primera; Juan anota 86
  // —el mejor— y va segundo. Eso es la pieza: el orden se da vuelta entero, no
  // hay un adelantamiento en la punta que haya que explicar. Nadie empata.
  //
  // Por qué esta pantalla y no el board del torneo, que era el plan: ahí la
  // columna HCP muestra el ÍNDICE del jugador y no los golpes que recibe
  // (contrato fijado a propósito en `build-from-legacy-hcp.test.ts`), así que el
  // neto a la vista no se deriva del número a la vista —27 de índice contra 34
  // de golpes—. En una pieza que habla justamente del hándicap, eso es un número
  // que no cuadra, y el público son golfistas que la cuenta la hacen de memoria.
  // Queda anotado para Juanjo como decisión de producto (una columna o dos).
  //
  // Los cuatro jugadores, sus índices y la cancha son los MISMOS que en la pieza
  // 1: dos piezas de la misma cuenta cuentan una historia, no dos.
  //
  // Los brutos no se verifican a ojo: `src/__tests__/unit/rrss-escenas.test.ts`
  // recalcula el board con el motor y falla si el neto y el bruto no quedan
  // invertidos en los extremos.
  'cada-uno-su-handicap': {
    codigo: 'RRSS02',
    cancha: LOS_QUILLAYES.nombre,
    catalogo: LOS_QUILLAYES,
    fecha: '2026-10-25',
    tee: 'blanco', // el de la ronda; cada jugadora juega desde el suyo
    holes: 18,
    hcp_pct: 100,
    modo_juego: 'neto', // el board abre en neto: es como se juega en un club
    formato_juego: 'stroke_play',
    tema: 'dark',
    hoyos_jugados: HOYOS_1_AL_18,
    // La vuelta está jugada y cerrada. Sembrada 'en_curso' —el default— la
    // pantalla mostraba los cuatro jugadores en THRU "F" y arriba el badge
    // "EN VIVO" con el botón "Volver a scorear": la ronda terminó y la app
    // decía que seguía en juego. Es coherente dentro del producto (la ronda se
    // cierra a mano) y una incoherencia a la vista en una pieza muda.
    estado: 'finalizada',
    // El gesto: abrir la tarjeta del primero (105 brutos) y después la del
    // segundo (86). Sin eso el reel es una tabla quieta; con eso se ve de dónde
    // sale cada número. Van por NOMBRE y no por posición: si el orden cambiara,
    // el guion falla al no encontrar la fila en vez de abrir otra tarjeta.
    tarjetas_del_gesto: ['Catalina Rojas', 'Juan Pérez'],
    cierre: { pieza: '2026-10-29-cada-uno-su-handicap', lamina: '01.png', ms: 2600 },
    jugadores: [
      // El primero es quien lleva la sesión de Playwright (es el admin de la ronda).
      { nombre: 'Juan Pérez', handicap: 11.8, tee: 'blanco', golpes: [6, 5, 4, 6, 4, 4, 5, 5, 6, 5, 3, 4, 6, 4, 5, 5, 4, 5] }, // 86 · hcp 13 · neto 73 (+1)
      { nombre: 'María González', handicap: 14.2, tee: 'rojo', golpes: [6, 5, 4, 7, 5, 4, 5, 6, 6, 5, 4, 5, 6, 4, 5, 6, 6, 6] }, // 95 · hcp 19 · neto 76 (+4)
      { nombre: 'Diego Silva', handicap: 20.6, tee: 'blanco', golpes: [6, 6, 4, 7, 5, 4, 6, 5, 7, 6, 4, 5, 6, 4, 5, 5, 6, 6] }, // 97 · hcp 23 · neto 74 (+2)
      { nombre: 'Catalina Rojas', handicap: 26.8, tee: 'rojo', golpes: [7, 5, 4, 8, 6, 3, 6, 6, 8, 6, 3, 6, 7, 4, 6, 6, 8, 6] }, // 105 · hcp 34 · neto 71 (−1)
    ],
  },
  // Pieza 3 del lanzamiento: «Tu torneo, listo en dos minutos.»
  //
  // Las dos primeras piezas muestran lo que ve el JUGADOR. Esta es para el que
  // arma: el capitán de la rama, el que organiza la copa del club. Su trabajo de
  // hoy es una planilla, un grupo de WhatsApp y los hándicaps a mano.
  //
  // La pieza es el flujo completo, sin cortes y sin rótulos: plantilla → nombre
  // → fecha → cancha → "Crear torneo" → el QR de inscripción. El único texto es
  // el de la app, que es exactamente lo que el organizador va a ver cuando lo
  // haga él. Lo que la pieza promete es el reloj, así que la toma no acelera
  // nada: los tiempos del video son los que tardó de verdad.
  //
  // A diferencia de las piezas 1 y 2, acá NO hay ronda que sembrar: el torneo lo
  // crea la toma en cámara. Lo único que la siembra prepara es la cancha del
  // catálogo (ficticia, igual que en las otras dos), el nombre del organizador y
  // que no haya quedado el torneo de una corrida anterior —si quedara, el
  // buscador de cancha abriría con el torneo ya creado y la pieza mostraría otra
  // cosa—.
  'torneo-en-dos-minutos': {
    codigo: 'RRSS03',
    // Sin ronda: la siembra solo deja la cancha y limpia el torneo previo.
    siembra: 'cancha',
    cancha: LOS_QUILLAYES.nombre,
    catalogo: LOS_QUILLAYES,
    tema: 'dark',
    // Quien organiza en cámara: es el nombre que la navbar muestra y el mismo
    // jugador que anota en las piezas 1 y 2. Las tres piezas son la misma gente.
    organizador: 'Juan Pérez',
    torneo: {
      nombre: 'Copa de Primavera',
      // Un sábado: los torneos de club se juegan el fin de semana, y la pieza 2
      // ya tuvo que corregir una fecha que caía en el día equivocado.
      fecha: '2026-11-14',
      // La plantilla que se toca en cámara, tal como la rotula la pantalla
      // (`tournament-templates.ts`). Va por TEXTO: si el nombre cambiara, el
      // guion falla al no encontrarla en vez de tocar otra plantilla.
      plantilla: 'Stroke Play 18 hoyos',
      // Lo que se teclea en el buscador de cancha. Corto a propósito: lo que se
      // ve es que con media palabra el club aparece.
      busqueda: 'Quillayes',
    },
    cierre: { pieza: '2026-10-29-torneo-en-dos-minutos', lamina: '01.png', ms: 2600 },
  },
}

/**
 * Huella de una escena: lo que decide los fotogramas del video.
 *
 * `montar.mjs` la escribe junto al MP4 y `publicar.mjs` la recalcula antes de
 * empaquetar. Es el mismo control que `huellaVisual()` para las láminas, y por
 * la misma razón: se corrige un golpe, un tee o el hoyo del gesto en la revisión,
 * nadie vuelve a capturar, y el reel que se sube es el de antes. Acá eso es un
 * error con nombre y no una sorpresa en el feed.
 *
 * Entra la escena COMPLETA porque todo lo que tiene decide la toma: los golpes,
 * el gesto, los tees, los tiempos y cuál es la lámina de cierre. Un campo que no
 * cambiara nada en los fotogramas no tendría por qué estar en la escena.
 */
export function huellaEscena(clave) {
  const escena = ESCENAS[clave]
  if (!escena)
    throw new Error(`No existe la escena "${clave}". Hay: ${Object.keys(ESCENAS).join(', ')}`)
  return createHash('sha256').update(JSON.stringify(escena)).digest('hex').slice(0, 16)
}

/**
 * Quién es el protagonista de la escena: el que lleva la sesión de la toma.
 *
 * En una escena de ronda es el primer jugador (el que anota); en una de torneo
 * no hay jugadores sembrados y es el organizador. La siembra le escribe ESE
 * nombre a la cuenta de pruebas para que la navbar no muestre las iniciales de
 * una cuenta de test arriba de una tabla que dice otro nombre.
 */
export function nombreDelProtagonista(escena) {
  const nombre = escena.jugadores?.[0]?.nombre ?? escena.organizador
  if (!nombre) throw new Error('la escena no declara jugadores ni organizador')
  return nombre
}

/** El tee con el que juega un jugador de la escena (el suyo, o el de la ronda). */
export function teeDeJugador(escena, jugador) {
  return jugador.tee ?? escena.tee
}
