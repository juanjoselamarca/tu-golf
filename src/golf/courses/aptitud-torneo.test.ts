// src/golf/courses/aptitud-torneo.test.ts
//
// Casos tomados del catálogo REAL de producción (snapshot jul-2026).

import { describe, it, expect } from 'vitest'
import {
  evaluarAptitudTorneo,
  evaluarAptitudRecorridos,
  aptitudPorHoyos,
  bloqueaRondaLibre,
  requiereRatingDeCancha,
  MENSAJE_SIN_RATING_9H,
  MENSAJE_RATING_MAL_CARGADO,
  MENSAJE_SIN_PAR_POR_HOYO,
  MENSAJE_FALTA_ELEGIR_RECORRIDOS,
  MENSAJE_ELEGIR_COMBINACION_ARMADA,
  ADVERTENCIA_TEE_ROTO,
  evaluarParPorHoyo,
  combinarVeredictos,
} from './aptitud-torneo'

// ─── Canchas reales, tal como están en la BD hoy ────────────────────────────

const RIO_BLANCO_VARONES = {
  par_total: 35,
  course_rating: null, // la fila de courses no tiene rating
  tees: [
    { rating: 55, front_course_rating: null },
    { rating: 55, front_course_rating: null },
    { rating: 55, front_course_rating: null },
  ],
}

const RIO_BLANCO_DAMAS = {
  par_total: 35,
  course_rating: null,
  tees: [{ rating: 55, front_course_rating: null }],
}

/** Brisas Este/Norte/Sur, Marbella ×3, Rocas ×3: par 36, CR 72, sin tees. */
const RECORRIDO_9H_CON_RATING_18H = { par_total: 36, course_rating: 72, tees: [] }

const LOS_LEONES = {
  par_total: 72,
  course_rating: 71.6,
  tees: [
    { rating: 73.1, front_course_rating: 37.2 },
    { rating: 71.2, front_course_rating: 36.2 },
    { rating: 74.0, front_course_rating: 37.8 },
  ],
}

/** Rinconada: el front-9 del tee azul (29.3) no cuadra, el resto sí. */
const RINCONADA = {
  par_total: 72,
  course_rating: 70.4,
  tees: [
    { rating: 72.8, front_course_rating: 29.3 },
    { rating: 74.1, front_course_rating: null },
    { rating: 70.6, front_course_rating: 30.9 },
  ],
}

/** C.G. La Serena: el tee dorado es el delta legítimo más grande del catálogo. */
const LA_SERENA = {
  par_total: 72,
  course_rating: 71.2,
  tees: [
    { rating: 64.4, front_course_rating: null },
    { rating: 72.0, front_course_rating: null },
  ],
}

/** Una de las 51 canchas del catálogo sin ningún rating cargado. */
const SIN_RATING = { par_total: 72, course_rating: null, tees: [] }

/** Cómo va a quedar una cancha de 9 hoyos cuando el Frente B cargue su rating. */
const LOS_LEONES_9H_SANO = { par_total: 36, course_rating: 35.8, tees: [] }

/** Los 3 recorridos de Brisas, tal como están en la BD (hijos de la cancha padre). */
const LOOPS_BRISAS = [
  { par_total: 36, course_rating: 72 },
  { par_total: 36, course_rating: 72 },
  { par_total: 36, course_rating: 72 },
]

/** Los mismos 3 recorridos con el rating de 9 hoyos correcto. */
const LOOPS_SANOS = [
  { par_total: 36, course_rating: 35.8 },
  { par_total: 36, course_rating: 36.4 },
  { par_total: 36, course_rating: 35.1 },
]

describe('evaluarAptitudTorneo — las canchas rotas del catálogo', () => {
  it('C.G. Río Blanco (VARONES) no es apta para un torneo de 9 hoyos', () => {
    const r = evaluarAptitudTorneo(RIO_BLANCO_VARONES, 9)
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('C.G. Río Blanco (DAMAS) tampoco', () => {
    expect(evaluarAptitudTorneo(RIO_BLANCO_DAMAS, 9).apta).toBe(false)
  })

  it('los 9 recorridos con rating de 18h SÍ son aptos: ese rating se recupera', () => {
    // 72 contra par 36 no es un dato imposible: es el rating de 18 hoyos de ese
    // loop, y la mitad (36) cierra contra su par. El motor lo parte desde el
    // #293 y produce el handicap correcto (verificado en prod: índice 30 → 16),
    // así que bloquear estos 9 recorridos sería un falso positivo — y dejaría a
    // Brisas, Marbella y Rocas de Santo Domingo sin torneos netos sin motivo.
    expect(evaluarAptitudTorneo(RECORRIDO_9H_CON_RATING_18H, 9).apta).toBe(true)
    expect(evaluarAptitudTorneo(RECORRIDO_9H_CON_RATING_18H, 18).apta).toBe(true)
  })

  it('una cancha de 9 con el rating IMPOSIBLE sigue bloqueada en un torneo de 18', () => {
    // Dos vueltas a un dato que miente sigue siendo un dato que miente. Río
    // Blanco (55 contra par 35) no cierra en ninguna escala: +20 si fuera de 9,
    // −15 si fuera de 18. No hay nada que recuperar y el club tiene que cargarlo.
    const r = evaluarAptitudTorneo(RIO_BLANCO_VARONES, 18)
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
    // El dato que falta es el de 9 hoyos, aunque el torneo sea de 18.
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('una cancha de 9 SANA sí se puede usar en un torneo de 18 (dos vueltas)', () => {
    // Hasta el 1-ago-2026 esto se bloqueaba sin mirar el dato: el motor rellenaba
    // los hoyos 10-18 a par 4 y no sabía repetir la vuelta. Ahora la repite, así
    // que el guardarrail sólo frena canchas con DATOS ROTOS.
    expect(evaluarAptitudTorneo(LOS_LEONES_9H_SANO, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo(LOS_LEONES_9H_SANO, 9).apta).toBe(true)
  })

  it('un tee de 9 hoyos sano no se bloquea a 18, y uno roto sí', () => {
    const sano = { par_total: 35, course_rating: null, tees: [{ rating: 34.8, front_course_rating: null }] }
    const roto = { par_total: 35, course_rating: null, tees: [{ rating: 55, front_course_rating: null }] }
    expect(evaluarAptitudTorneo(sano, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo(roto, 18).apta).toBe(false)
  })

  it('una cancha de 9 se juzga con la tolerancia de 9, aunque el torneo sea de 18', () => {
    // Delta 7: pasa la tolerancia de 18 hoyos (±10) y NO la de 9 (±5). El dato
    // publicado es de 9 hoyos, así que la tolerancia que corresponde es la de 9
    // — dar dos vueltas no vuelve más creíble un rating que ya no lo era.
    const delta7 = { par_total: 35, course_rating: null, tees: [{ rating: 42, front_course_rating: null }] }
    expect(evaluarAptitudTorneo(delta7, 9).apta).toBe(false)
    expect(evaluarAptitudTorneo(delta7, 18).apta).toBe(false)
    // La misma distancia sobre una cancha de 18 hoyos SÍ es legítima
    // (C.G. La Serena, tee dorado: par 72, CR 64.4 → delta 7.6).
    const laSerena = { par_total: 72, course_rating: null, tees: [{ rating: 64.4, front_course_rating: null }] }
    expect(evaluarAptitudTorneo(laSerena, 18).apta).toBe(true)
  })

  it('el mensaje es el copy aprobado, en español chileno', () => {
    expect(MENSAJE_SIN_RATING_9H).toContain('rating oficial de 9 hoyos')
    expect(MENSAJE_SIN_RATING_9H).toContain('elige otra')
    expect(MENSAJE_SIN_RATING_9H).not.toContain('elegí')
  })
})

describe('evaluarAptitudTorneo — canchas que NO se pueden bloquear', () => {
  it('Club de Golf Los Leones es apta a 9 y a 18', () => {
    expect(evaluarAptitudTorneo(LOS_LEONES, 9).apta).toBe(true)
    expect(evaluarAptitudTorneo(LOS_LEONES, 18).apta).toBe(true)
  })

  it('C.G. La Serena es apta pese al tee dorado con delta −7.6', () => {
    expect(evaluarAptitudTorneo(LA_SERENA, 18).apta).toBe(true)
  })

  it('Rinconada es apta: un tee con front-9 roto no bloquea al club, pero avisa', () => {
    const r = evaluarAptitudTorneo(RINCONADA, 9)
    expect(r.apta).toBe(true)
    expect(r.mensaje).toBeNull()
    // No bloquea, pero tampoco pasa en silencio: los jugadores de ese tee van a
    // caer al rating general de la cancha.
    expect(r.advertencia).toContain('mal cargado')
  })

  it('un tee roto SIN rating de cancha debajo sí bloquea: sería handicap mixto', () => {
    // El motor ata a cada jugador a SU tee y sólo tiene un escalón debajo. Sin
    // rating de cancha creíble, los del tee roto reciben su índice y los del
    // tee sano puntúan con WHS: dos handicaps en el mismo torneo neto.
    const mixta = {
      par_total: 72,
      course_rating: null,
      tees: [
        { rating: 71.2, front_course_rating: 35.8 },
        { rating: 72, front_course_rating: null }, // 9h: 36 sano; 18h: sano
        { rating: 107, front_course_rating: null }, // el swap CR↔slope
      ],
    }
    expect(evaluarAptitudTorneo(mixta, 18).apta).toBe(false)
    expect(evaluarAptitudTorneo(mixta, 18).motivo).toBe('rating_incoherente')
  })

  it('el MISMO tee roto no bloquea si la cancha tiene un rating sano debajo', () => {
    // Contraprueba del caso de arriba: acá el eslabón terminal existe y es
    // creíble, así que los jugadores del tee roto caen ahí y siguen con WHS.
    const conRed = {
      par_total: 72,
      course_rating: 71.6,
      tees: [
        { rating: 71.2, front_course_rating: 35.8 },
        { rating: 107, front_course_rating: null },
      ],
    }
    const r = evaluarAptitudTorneo(conRed, 18)
    expect(r.apta).toBe(true)
    expect(r.advertencia).toBe(ADVERTENCIA_TEE_ROTO)
  })

  it('una cancha con TODOS los tees sanos no genera advertencia', () => {
    expect(evaluarAptitudTorneo(LOS_LEONES, 18).advertencia).toBeNull()
    expect(evaluarAptitudTorneo(LOS_LEONES, 9).advertencia).toBeNull()
  })

  it('una cancha de 9 hoyos con su rating real de 9 es apta a 9 hoyos', () => {
    // Es el estado al que llega el Frente B. Si esto se rompiera, cargar el
    // dato bueno dejaría la cancha igual de bloqueada.
    const r = evaluarAptitudTorneo(LOS_LEONES_9H_SANO, 9)
    expect(r.apta).toBe(true)
    expect(r.advertencia).toBeNull()
  })

  it('una cancha SIN rating no se bloquea (degrada sola, hay 51 así)', () => {
    expect(evaluarAptitudTorneo(SIN_RATING, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo(SIN_RATING, 9).apta).toBe(true)
  })

  it('una cancha sin par ni rating tampoco se bloquea', () => {
    expect(evaluarAptitudTorneo({ par_total: null, course_rating: null }, 18).apta).toBe(true)
  })

  it('tees ausentes o null se toleran sin explotar', () => {
    expect(evaluarAptitudTorneo({ par_total: 72, course_rating: 71.2 }, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo({ par_total: 72, course_rating: 71.2, tees: null }, 18).apta).toBe(true)
  })
})

describe('evaluarAptitudTorneo — 18 hoyos con rating que miente', () => {
  it('bloquea el swap CR↔slope (CR=107 sobre par 72) con el mensaje de 18h', () => {
    const r = evaluarAptitudTorneo({ par_total: 72, course_rating: 107, tees: [] }, 18)
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_RATING_MAL_CARGADO)
  })

  it('bloquea un rating de 9h pegado a una cancha de 18', () => {
    expect(evaluarAptitudTorneo({ par_total: 72, course_rating: 35.8, tees: [] }, 18).apta).toBe(false)
  })

  it('un tee creíble NO salva un rating de cancha que miente', () => {
    // No se puede garantizar que el jugador llegue al tee sano:
    // `resolvePlayerTee` exige match EXACTO del nombre, y hoy 15 de 27 torneos
    // con cancha en producción no matchean ninguno. Esos jugadores caminan el
    // eslabón de cancha, que es el que miente.
    const r = evaluarAptitudTorneo(
      { par_total: 72, course_rating: 107, tees: [{ rating: 71.2, front_course_rating: null }] },
      18,
    )
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
  })

  it('un rating de cancha sin slope no es un eslabón: no salva ni condena', () => {
    // Los dos motores exigen `course_rating && slope_rating` juntos. Con el
    // slope en null ese escalón no existe y el jugador cae al camino seguro.
    const sinSlope = {
      par_total: 72,
      course_rating: 71.5,
      slope_rating: null,
      tees: [
        { rating: 71.2, front_course_rating: null },
        { rating: 40, front_course_rating: null },
      ],
    }
    // El rating de cancha parecía sano, pero no se puede usar: queda el tee
    // roto sin red debajo → bloquea, en vez de prometer una advertencia falsa.
    const r = evaluarAptitudTorneo(sinSlope, 18)
    expect(r.apta).toBe(false)
    expect(r.advertencia).toBeNull()

    // Con el slope cargado, el mismo caso pasa a ser advertencia.
    const conSlope = evaluarAptitudTorneo({ ...sinSlope, slope_rating: 130 }, 18)
    expect(conSlope.apta).toBe(true)
    expect(conSlope.advertencia).toBe(ADVERTENCIA_TEE_ROTO)
  })
})

describe('aptitudPorHoyos', () => {
  it('devuelve el veredicto de las dos duraciones del wizard', () => {
    const a = aptitudPorHoyos(RIO_BLANCO_VARONES)
    expect(a[9].apta).toBe(false)
    expect(a[18].apta).toBe(false)

    const b = aptitudPorHoyos(LOS_LEONES)
    expect(b[9].apta).toBe(true)
    expect(b[18].apta).toBe(true)
  })

  it('una cancha de 18 sin front-9 sano queda bloqueada en las dos duraciones', () => {
    // CR 107 se parte a 53.5 contra par 36 → delta +17.5 en 9h; a 18 el swap
    // CR↔slope la bloquea igual.
    const rara = { par_total: 72, course_rating: 107, tees: [{ rating: 107, front_course_rating: null }] }
    const a = aptitudPorHoyos(rara)
    expect(a[18].apta).toBe(false)
    expect(a[9].apta).toBe(false)
  })
})

describe('evaluarAptitudRecorridos — canchas multi-recorrido (Brisas / Marbella / Rocas)', () => {
  it('un recorrido con el rating de 18h es apto: el motor lo parte antes de sumar', () => {
    // 72 sobre par 36 es el rating de 18 hoyos de ese loop, no un dato imposible.
    expect(evaluarAptitudRecorridos([LOOPS_BRISAS[0]]).apta).toBe(true)
  })

  it('los 3 recorridos combinados: el gate suma lo MISMO que el motor', () => {
    // El motor normaliza cada hijo contra su propio par y después suma
    // (`resolverCourseData` paso 0, #293): 3 × 36 = 108 contra par 108. El gate
    // sumaba los ratings CRUDOS — 216 contra 108 — y bloqueaba los tres clubes
    // de 27 por un número que el motor nunca calcula.
    expect(evaluarAptitudRecorridos(LOOPS_BRISAS).apta).toBe(true)
  })

  it('un recorrido cuyo rating no cierra en NINGUNA escala sigue bloqueado', () => {
    // 55 sobre par 36: +19 si ya fuera de 9, −8.5 si fuera de 18. Imposible.
    const r = evaluarAptitudRecorridos([{ par_total: 36, course_rating: 55 }])
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
  })

  it('con los ratings de 9h correctos, 1 y 3 recorridos son aptos', () => {
    expect(evaluarAptitudRecorridos([LOOPS_SANOS[0]]).apta).toBe(true)
    expect(evaluarAptitudRecorridos(LOOPS_SANOS).apta).toBe(true)
  })

  it('tres loops sanos no se bloquean por sumar sus deltas legítimos', () => {
    // El gate juzgaba la suma de 3 loops con la tolerancia de 18 hoyos (±10),
    // pero el motor la juzga con la de los hoyos que se juegan (27 → ±15). Tres
    // loops con el delta legítimo más grande del catálogo (−3.9, Marbella)
    // suman −11.7: pasan la del motor y no la de 18. Un club de 27 entero
    // bloqueado por datos que el motor acepta.
    const loops = [32.1, 32.1, 32.1].map((cr) => ({
      par_total: 36, course_rating: cr, slope_rating: 120,
    }))
    expect(evaluarAptitudRecorridos(loops).apta).toBe(true)
  })

  it('sin recorridos no hay veredicto que dar', () => {
    expect(evaluarAptitudRecorridos([]).apta).toBe(true)
  })

  it('si algún recorrido no tiene rating, el motor no usa esta rama y no se bloquea', () => {
    const r = evaluarAptitudRecorridos([LOOPS_SANOS[0], { par_total: 36, course_rating: null }])
    expect(r.apta).toBe(true)
  })

  it('un recorrido SIN rating propio pero con el tee IMPOSIBLE se bloquea igual', () => {
    // El agujero que tenía este gate: sin `course_rating` el motor no suma, se
    // cae al lookup por tee de ESE hijo. Si sólo se mirara la suma, un tee con
    // el rating roto pasaba y el torneo se armaba sobre el dato roto.
    const r = evaluarAptitudRecorridos([
      { par_total: 36, course_rating: null, tees: [{ rating: 55, front_course_rating: null }] },
    ])
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('la SUMA de los recorridos se juzga aunque cada uno pase por separado', () => {
    // Sin `par_total` no hay nada que desmentir recorrido por recorrido (el par
    // es la señal de escala) y el paso 1 sale con "sin par", sin veredicto. La
    // suma sí es juzgable contra el par por defecto (36 por loop), así que es el
    // único lugar donde este dato se puede frenar.
    //
    // 55 sobre par 36 no cierra en ninguna escala: +19 si ya fuera de 9, −8.5 si
    // fuera de 18. Entra crudo a la suma — 110 contra par 72 — y se bloquea. Si
    // entrara normalizado daría 36 + 36 = 72 contra 72, un delta 0 perfecto que
    // taparía el dato roto.
    const r = evaluarAptitudRecorridos([
      { par_total: null, course_rating: 55, slope_rating: 130 },
      { par_total: null, course_rating: 55, slope_rating: 130 },
    ])
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_RATING_MAL_CARGADO)
  })

  it('sin `par_total`, un rating de 18h por loop se asume de 9 y la suma cierra', () => {
    // 72 sobre el par por defecto (36) es RECUPERABLE: el motor parte cada loop
    // antes de sumar y le queda 36 + 36 = 72 contra par 72. Es exactamente lo
    // que hace `resolverCourseData` paso 0 con `c.par_total ?? 36`.
    expect(
      evaluarAptitudRecorridos([
        { par_total: null, course_rating: 72, slope_rating: 130 },
        { par_total: null, course_rating: 72, slope_rating: 130 },
      ]).apta,
    ).toBe(true)
  })

  it('sin slope el motor no entra por la suma, y este gate tampoco', () => {
    // `resolverCourseData` exige `course_rating && slope_rating` en TODOS los
    // hijos para combinar. Bloquear acá sería bloquear una rama que no corre.
    const r = evaluarAptitudRecorridos([
      { par_total: null, course_rating: 72, slope_rating: null },
      { par_total: null, course_rating: 72, slope_rating: 130 },
    ])
    expect(r.apta).toBe(true)
  })
})

describe('el veredicto APTA no se puede contaminar', () => {
  it('mutar el resultado de una cancha sana no afecta a la siguiente', () => {
    // `APTA` se devuelve por referencia desde varios caminos: sin congelarlo,
    // un caller que le escriba encima envenena todos los veredictos del proceso.
    const primero = evaluarAptitudTorneo(LOS_LEONES, 18)
    expect(() => {
      ;(primero as { apta: boolean }).apta = false
    }).toThrow()
    expect(evaluarAptitudTorneo(LOS_LEONES, 18).apta).toBe(true)
  })
})

describe('bloqueaRondaLibre — qué frena una ronda libre y qué no', () => {
  it('el rating que miente frena el neto', () => {
    expect(bloqueaRondaLibre(evaluarAptitudTorneo(RIO_BLANCO_VARONES, 9))).toBe(true)
  })

  it('una cancha de 9 SANA jugada a 18 no frena — ni debería: se juega en dos vueltas', () => {
    const v = evaluarAptitudTorneo(LOS_LEONES_9H_SANO, 18)
    expect(v.apta).toBe(true)
    expect(bloqueaRondaLibre(v)).toBe(false)
  })

  it('una cancha apta y una cancha que no está en la BD no frenan', () => {
    expect(bloqueaRondaLibre(evaluarAptitudTorneo(LOS_LEONES, 18))).toBe(false)
    expect(bloqueaRondaLibre(null)).toBe(false)
  })
})

describe('requiereRatingDeCancha — un torneo Gross no necesita rating', () => {
  it('neto lo requiere', () => {
    expect(requiereRatingDeCancha({ modo: 'neto', use_handicap: false })).toBe(true)
    expect(requiereRatingDeCancha({ modo: 'neto', use_handicap: true })).toBe(true)
  })

  it('gross con handicap lo requiere igual (hay premios neto por categoría)', () => {
    expect(requiereRatingDeCancha({ modo: 'gross', use_handicap: true })).toBe(true)
  })

  it('gross sin handicap NO lo requiere: bloquearlo sería un falso bloqueo', () => {
    expect(requiereRatingDeCancha({ modo: 'gross', use_handicap: false })).toBe(false)
  })

  it('sin datos no se asume que hace falta', () => {
    expect(requiereRatingDeCancha({})).toBe(false)
  })
})

// ─── Par por hoyo ───────────────────────────────────────────────────────────
//
// Casos del catálogo REAL (snapshot 09-ago-2026): 186 canchas activas, 177 con
// `course_holes` propios, 3 clubes de 27h que dependen de sus hijos, y 6 que no
// tienen par por hoyo por ninguna vía.

describe('evaluarParPorHoyo — sin par por hoyo el motor no puede puntuar', () => {
  /** Lo que devuelve la resolución real cuando encuentra los 18 hoyos. */
  const RESUELVE = {
    hoyosResueltos: 18,
    loopsElegidos: 0,
    recorridosDisponibles: 0,
    puedeElegirRecorridos: true,
    existe: true,
  }

  it('si la resolución real devolvió hoyos, la cancha es apta', () => {
    const v = evaluarParPorHoyo(RESUELVE)
    expect(v.apta).toBe(true)
    expect(v.motivo).toBeNull()
  })

  it('Brisas 27h CON los recorridos elegidos es apta: la resolución los encuentra', () => {
    const v = evaluarParPorHoyo({ ...RESUELVE, loopsElegidos: 2, recorridosDisponibles: 3 })
    expect(v.apta).toBe(true)
  })

  it('Brisas 27h SIN recorridos elegidos no es apta, y el mensaje es accionable', () => {
    // Las 4 rondas rotas de producción (marzo-abril 2026) son exactamente esto:
    // `course_id` = el club padre, `recorridos` = null, resolución = 0 hoyos.
    const v = evaluarParPorHoyo({
      hoyosResueltos: 0,
      loopsElegidos: 0,
      recorridosDisponibles: 3,
      puedeElegirRecorridos: true,
      existe: true,
    })
    expect(v.apta).toBe(false)
    expect(v.motivo).toBe('sin_par_por_hoyo')
    expect(v.mensaje).toBe(MENSAJE_FALTA_ELEGIR_RECORRIDOS)
  })

  it('desde un TORNEO el mensaje manda a la combinación armada, no a elegir loops', () => {
    // `tournaments` no tiene columna `recorridos`: pedirle al organizador que
    // "elija sus recorridos" sería mandarlo a una afordancia que no existe.
    const v = evaluarParPorHoyo({
      hoyosResueltos: 0,
      loopsElegidos: 0,
      recorridosDisponibles: 3,
      puedeElegirRecorridos: false,
      existe: true,
    })
    expect(v.apta).toBe(false)
    expect(v.mensaje).toBe(MENSAJE_ELEGIR_COMBINACION_ARMADA)
  })

  it('ya eligió recorridos y aun así no hay hoyos: no se le pide repetir la acción', () => {
    const v = evaluarParPorHoyo({
      hoyosResueltos: 0,
      loopsElegidos: 2,
      recorridosDisponibles: 3,
      puedeElegirRecorridos: true,
      existe: true,
    })
    expect(v.apta).toBe(false)
    expect(v.mensaje).toBe(MENSAJE_SIN_PAR_POR_HOYO)
  })

  it('Iquique / Barquito / Río Blanco: sin hoyos y sin recorridos que elegir', () => {
    const v = evaluarParPorHoyo({
      hoyosResueltos: 0,
      loopsElegidos: 0,
      recorridosDisponibles: 0,
      puedeElegirRecorridos: true,
      existe: true,
    })
    expect(v.apta).toBe(false)
    expect(v.motivo).toBe('sin_par_por_hoyo')
    // No es culpa del jugador: no hay recorrido que elegir, falta el dato.
    expect(v.mensaje).toBe(MENSAJE_SIN_PAR_POR_HOYO)
  })

  it('frena la ronda libre: sin par por hoyo no hay vs-par ni birdie en el scorer', () => {
    // A diferencia del rating, el par por hoyo hace falta INCLUSO en gross.
    const v = evaluarParPorHoyo({
      hoyosResueltos: 0,
      loopsElegidos: 0,
      recorridosDisponibles: 0,
      puedeElegirRecorridos: true,
      existe: true,
    })
    expect(bloqueaRondaLibre(v)).toBe(true)
  })
})

describe('combinarVeredictos — el primero que bloquea manda', () => {
  it('sin veredictos que bloqueen, devuelve apta', () => {
    expect(combinarVeredictos().apta).toBe(true)
  })

  it('conserva la advertencia de un veredicto que pasa', () => {
    const conAviso = evaluarAptitudTorneo(RINCONADA, 9)
    expect(conAviso.advertencia).toBe(ADVERTENCIA_TEE_ROTO)
    expect(combinarVeredictos(conAviso).advertencia).toBe(ADVERTENCIA_TEE_ROTO)
  })

  it('el par por hoyo faltante gana sobre una cancha de rating sano', () => {
    const sinPar = evaluarParPorHoyo({
      hoyosResueltos: 0,
      loopsElegidos: 0,
      recorridosDisponibles: 0,
      puedeElegirRecorridos: true,
      existe: true,
    })
    const v = combinarVeredictos(evaluarAptitudTorneo(LOS_LEONES, 18), sinPar)
    expect(v.apta).toBe(false)
    expect(v.motivo).toBe('sin_par_por_hoyo')
  })

  it('null y undefined se ignoran', () => {
    expect(combinarVeredictos(null, undefined).apta).toBe(true)
  })
})
