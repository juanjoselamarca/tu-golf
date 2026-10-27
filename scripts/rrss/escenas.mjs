// Los datos de cada escena de video, versionados: la toma tiene que salir igual
// hoy y cuando haya que regrabarla con otro encuadre.
//
// `golpes` va hoyo a hoyo en el orden de `hoyos_jugados`. El hoyo del gesto
// queda SIN anotar a propósito: es lo que el jugador hace en cámara.

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
 */
const LOS_LEONES = {
  nombre: 'Club de Golf Los Leones',
  // 18 hoyos, en orden. Par 72 (43 en los primeros 11).
  hoyos: [
    { par: 4, si: 17 }, { par: 4, si: 5 }, { par: 3, si: 14 },
    { par: 5, si: 1 }, { par: 4, si: 11 }, { par: 3, si: 15 },
    { par: 4, si: 4 }, { par: 4, si: 7 }, { par: 5, si: 10 },
    { par: 4, si: 12 }, { par: 3, si: 18 }, { par: 4, si: 13 },
    { par: 4, si: 2 }, { par: 3, si: 16 }, { par: 4, si: 3 },
    { par: 4, si: 6 }, { par: 5, si: 8 }, { par: 5, si: 9 },
  ],
  // El rating y el slope salen del TEE, no de la cancha: la fila de `courses`
  // dice slope 142 (negras) y es la del tee la que manda.
  tees: {
    blanco: { genero: 'M', rating: 71.6, slope: 129, par: 72 },
    rojo: { genero: 'F', rating: 74.8, slope: 131, par: 72 },
  },
}

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
    cancha: LOS_LEONES.nombre,
    catalogo: LOS_LEONES,
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
}

/** El tee con el que juega un jugador de la escena (el suyo, o el de la ronda). */
export function teeDeJugador(escena, jugador) {
  return jugador.tee ?? escena.tee
}
