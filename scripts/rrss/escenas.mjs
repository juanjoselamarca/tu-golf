// Los datos de cada escena de video, versionados: la toma tiene que salir igual
// hoy y cuando haya que regrabarla con otro encuadre.
//
// `golpes` va hoyo a hoyo en el orden de `hoyos_jugados`. El hoyo del gesto
// queda SIN anotar a propósito: es lo que el jugador hace en cámara.

/** Par de los hoyos 1-11 de Los Leones: 4 4 3 5 4 3 4 4 5 4 3 = 43. */
const HOYOS_1_AL_11 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export const ESCENAS = {
  // Pieza 1 del lanzamiento: "Anota. Todos ven lo mismo."
  //
  // La escena está armada para que el gesto CAMBIE AL LÍDER en cámara, que es lo
  // único que se entiende sin sonido ni texto:
  //
  //   al hoyo 12  →  Diego E (1º) · Juan +1 (2º) · María +2 · Catalina atrás
  //   el birdie   →  Juan −1, toma la punta
  //
  // Juan juega con índice 11.8 a propósito: desde el tee blanco (rating 71.6,
  // slope 129) su course handicap queda en 13, y 13 le da golpe en el hoyo 12
  // (SI 13). Así el birdie vale DOS golpes netos y el adelantamiento no depende
  // de cómo se desempate un E–E. Con 8.4 el course handicap daba 9, no recibía
  // golpe ahí y el gesto terminaba en un empate que en pantalla no se ve.
  // El course handicap sale del TEE, no de la cancha: la fila de `courses` dice
  // slope 142 y la del tee blanco 129, y es la del tee la que manda.
  //
  // Los brutos los verifica `escena.test.mjs` contra el motor de golf, no contra
  // esta aritmética: si el orden no es ese, falla el test y no la grabación.
  'anota-todos-ven': {
    codigo: 'RRSS01',
    cancha: 'Club de Golf Los Leones',
    fecha: '2026-10-27',
    tee: 'blanco',
    modo_juego: 'neto',
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
      { nombre: 'Juan Pérez', handicap: 11.8, golpes: [5, 5, 3, 6, 4, 4, 5, 5, 6, 4, 4] }, // 51
      { nombre: 'María González', handicap: 14.2, golpes: [5, 5, 4, 6, 4, 4, 5, 6, 6, 5, 4] }, // 54
      { nombre: 'Diego Silva', handicap: 20.6, golpes: [5, 6, 4, 7, 5, 4, 6, 6, 6, 5, 3] }, // 57
      { nombre: 'Catalina Rojas', handicap: 26.8, golpes: [6, 7, 5, 8, 6, 4, 6, 7, 7, 5, 4] }, // 65
    ],
  },
}
