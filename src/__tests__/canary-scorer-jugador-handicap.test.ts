/**
 * CANARIO — los dos scorers de torneo reparten el MISMO handicap.
 *
 * Golfers+ tiene dos pantallas que escriben el score de un torneo:
 *   · el scorer del ORGANIZADOR  (`organizador/[slug]/scoring`)
 *   · el scorer del JUGADOR      (`torneo/[slug]/score`)
 *
 * Ambas persisten `net_score` y `points` con `POST /api/game`. Hasta el
 * 09-ago-2026 el del organizador repartía golpes con el course handicap del
 * gate (`resolveScoringCourseHcp`) y el del jugador con el ÍNDICE CRUDO. En un
 * torneo `hcp_calc_mode='whs'` sobre cancha con slope ≠ 113 los dos escribían
 * netos distintos para el mismo golpe, y el del jugador dejaba el número malo
 * guardado en la base.
 *
 * El bug era latente mientras todos los torneos eran `raw`. Dejó de serlo el
 * 30-jul-2026, cuando el default de `hcp_calc_mode` pasó a `whs`: hoy cada
 * torneo nuevo nace en el modo que lo dispara.
 *
 * Este canario fija las dos mitades del arreglo:
 *   1. NUMÉRICA  — el puntaje de un hoyo sale de una sola función para ambos.
 *   2. DE FUENTE — el scorer del jugador no puede volver a alimentar las
 *      funciones de scoring con `handicap_at_registration`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/** Todos los .ts/.tsx de un directorio y sus subdirectorios. */
function archivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return archivosDe(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { resolveScoringCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

// ── Contexto REAL de prod: Club de Golf Los Leones, slope 142 / CR 75.1, par 72.
// Los números salen del catálogo vivo (la cancha de `gate-scorer-matchplay-18h`,
// que es un torneo demo y por eso no estaba expuesto él mismo). Lo que importa
// es la cancha: es una de las que se juegan de verdad, y con esos ratings un
// índice 12 recibe 18 golpes — SEIS más que los que repartía el scorer del
// jugador. En un torneo neto eso no es un decimal, es el campeonato. ──
const COURSE_TEES: CourseTeeRow[] = [
  { id: 'tee-azul', nombre: 'azul', slope: 142, rating: 75.1, par_total: 72 } as unknown as CourseTeeRow,
]

const TOURNEY = {
  tees: 'azul',
  courses: { par_total: 72, slope_rating: 142, course_rating: 75.1 },
}

const JUGADOR = { handicap_at_registration: 12, tee_id: 'tee-azul' }

/** Los 6 golpes de diferencia, fijados como número. */
const COURSE_HCP_ESPERADO = 18

const PAR_TOTAL = 72
const HOLE_COUNT = 18

/** Los 18 hoyos de la ronda, ya expandidos (par 4 cada uno = par 72). */
const HOYOS_18 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

describe('canario · el course handicap del gate NO es el índice crudo', () => {
  it('en Los Leones un índice 12 recibe 18 golpes, no 12', () => {
    const courseHcp = resolveScoringCourseHcp('whs', JUGADOR, TOURNEY, COURSE_TEES, PAR_TOTAL, HOLE_COUNT)
    // Si estos dos números fueran iguales, el canario no probaría nada:
    // la divergencia es justamente lo que el bug hacía invisible.
    expect(courseHcp).toBe(COURSE_HCP_ESPERADO)
    expect(courseHcp - JUGADOR.handicap_at_registration).toBe(6)
  })

  it('en modo raw el gate devuelve el índice crudo — el fix es NO-OP para torneos viejos', () => {
    const courseHcp = resolveScoringCourseHcp('raw', JUGADOR, TOURNEY, COURSE_TEES, PAR_TOTAL, HOLE_COUNT)
    expect(courseHcp).toBe(JUGADOR.handicap_at_registration)
  })
})

describe('canario · puntajeDeHoyo es la fuente única del neto y los puntos', () => {
  const courseHcp = resolveScoringCourseHcp('whs', JUGADOR, TOURNEY, COURSE_TEES, PAR_TOTAL, HOLE_COUNT)

  it('el neto sale de gross menos los golpes del COURSE handicap', () => {
    const p = puntajeDeHoyo({
      gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: 'stroke_play',
    })
    expect(p.strokesRecibidos).toBe(strokesRecibidosEnHoyo(courseHcp, 1, HOLE_COUNT))
    expect(p.neto).toBe(5 - p.strokesRecibidos)
  })

  it('fuera de stableford los puntos son 0 — no se persiste un número inventado', () => {
    const p = puntajeDeHoyo({
      gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: 'stroke_play',
    })
    expect(p.puntos).toBe(0)
  })

  it('en stableford los puntos usan el course handicap, no el índice', () => {
    const p = puntajeDeHoyo({
      gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: 'stableford',
    })
    expect(p.puntos).toBe(puntosStablefordHoyo(5, 4, courseHcp, 1, HOLE_COUNT))
  })

  it('resuelve el formato con el predicado canónico, no con una columna suelta', () => {
    // OJO con lo que este caso prueba y lo que NO: `resolveFormatoJuego` es
    // `formato_juego ?? format`, así que el legacy sólo manda si el canónico es
    // null — y en prod `formato_juego` no es null en ninguna de las 29 filas.
    // O sea: hoy esto es equivalente a mirar `formato_juego` a secas. Se fija
    // igual para que el día que llegue una fila sin canónico, las tres pantallas
    // que escriben score respondan lo mismo en vez de tres cosas distintas.
    const conCanonico = puntajeDeHoyo({
      gross: 4, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: { formato_juego: 'stableford', format: 'stroke_play' },
    })
    expect(conCanonico.puntos).toBeGreaterThan(0)

    // El canónico manda sobre el legacy cuando los dos están.
    const canonicoGana = puntajeDeHoyo({
      gross: 4, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: { formato_juego: 'stroke_play', format: 'stableford' },
    })
    expect(canonicoGana.puntos).toBe(0)

    // Y sólo con el canónico en null se lee el legacy.
    const soloLegacy = puntajeDeHoyo({
      gross: 4, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: { formato_juego: null, format: 'stableford' },
    })
    expect(soloLegacy.puntos).toBeGreaterThan(0)
  })
})

describe('canario de conducta · las tres rutas de escritura dan el MISMO neto', () => {
  // El canario de fuente (abajo) protege contra un revert copy-paste, pero se
  // esquiva con una reimplementación: basta una variable intermedia para que el
  // regex no vea nada. Esto fija la CONDUCTA, que es lo que importa.
  //
  // Las tres rutas que escriben `net_score` y `points` componen el handicap con
  // `courseHandicapDeScoring` y el puntaje con `puntajeDeHoyo`. Si alguna vuelve
  // a armar su propia versión con otro par o con el índice, este bloque delata
  // la divergencia sin depender de cómo esté escrita.
  const contexto = {
    mode: 'whs',
    player: JUGADOR,
    tournament: TOURNEY,
    courseTees: COURSE_TEES,
    courseHoles: HOYOS_18,
    holeCount: HOLE_COUNT,
  }

  it('el handicap compuesto es el del gate, con el par de los hoyos jugados', () => {
    expect(courseHandicapDeScoring(contexto)).toBe(COURSE_HCP_ESPERADO)
  })

  it('un torneo de 9 hoyos recibe exactamente 9, ni el de 18 ni negativo', () => {
    // Este es el caso que DISCRIMINA la composición del par. Con el par mal
    // compuesto (el de 18 contra el CR de 9) el resultado sale ≈ −27: el motor
    // trata al jugador como plus y le QUITA golpes.
    //
    // Va fijado al número y no a un rango: con el par a 36 en vez de 35 —el
    // off-by-one real de las canchas de 9— la cuenta da 10 en vez de 9, y un
    // `toBeGreaterThan(0)` lo dejaría pasar.
    const nueve = courseHandicapDeScoring({
      ...contexto,
      courseHoles: HOYOS_18.slice(0, 9),
      holeCount: 9,
    })
    expect(nueve).toBe(9)
  })

  it('en modo raw las tres rutas caen al índice crudo, idéntico', () => {
    expect(courseHandicapDeScoring({ ...contexto, mode: 'raw' })).toBe(
      JUGADOR.handicap_at_registration,
    )
    expect(courseHandicapDeScoring({ ...contexto, mode: null })).toBe(
      JUGADOR.handicap_at_registration,
    )
  })

  it('el neto baja de a un golpe por hoyo, y nunca dos veces en el mismo', () => {
    // La versión anterior de este caso comparaba `puntajeDeHoyo(...).neto`
    // contra `gross - strokesRecibidosEnHoyo(...)` — que es LA IMPLEMENTACIÓN
    // de `puntajeDeHoyo`. Reimplementar la implementación y compararlas pasa
    // con cualquier reparto, incluso roto. Esto mide el reparto en sí.
    const courseHcp = courseHandicapDeScoring(contexto)
    const netos = Array.from({ length: HOLE_COUNT }, (_, i) =>
      puntajeDeHoyo({
        gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: i + 1,
        holeCount: HOLE_COUNT, formato: 'stroke_play',
      }),
    )

    // Con course handicap 18 sobre 18 hoyos: exactamente un golpe en cada uno.
    expect(netos.every((n) => n.strokesRecibidos === 1)).toBe(true)
    expect(netos.every((n) => n.neto === 4)).toBe(true)

    // Y con 9 golpes sobre 18 hoyos, los reciben los 9 hoyos más difíciles —
    // ninguno dos veces, ninguno de los otros nueve.
    const nueveGolpes = Array.from({ length: HOLE_COUNT }, (_, i) =>
      puntajeDeHoyo({
        gross: 5, par: 4, courseHandicap: 9, strokeIndex: i + 1,
        holeCount: HOLE_COUNT, formato: 'stroke_play',
      }).strokesRecibidos,
    )
    expect(nueveGolpes.filter((s) => s === 1)).toHaveLength(9)
    expect(nueveGolpes.filter((s) => s === 0)).toHaveLength(9)
    expect(nueveGolpes.slice(0, 9).every((s) => s === 1)).toBe(true)
  })

  it('reparte EXACTAMENTE el course handicap en la vuelta completa', () => {
    // Σ de golpes repartidos == course handicap. Si esto se rompe, el neto del
    // torneo entero se corre — es el invariante que hace comparable la tabla.
    const courseHcp = courseHandicapDeScoring(contexto)
    let repartidos = 0
    for (let hoyo = 1; hoyo <= HOLE_COUNT; hoyo++) {
      repartidos += strokesRecibidosEnHoyo(courseHcp, hoyo, HOLE_COUNT)
    }
    expect(repartidos).toBe(courseHcp)
  })
})

describe('canario de fuente · el scorer del jugador no vuelve al índice crudo', () => {
  // Se lee la RUTA COMPLETA, no un archivo suelto: "el que toca, ordena" manda
  // extraer lógica a `<ruta>/hooks/`, y el día que `courseHcpDe` se mude ahí un
  // canario atado a `page.tsx` quedaría verde cubriendo nada — pasando, así que
  // nadie se enteraría.
  const DIR = join(process.cwd(), 'src/app/torneo/[slug]/score')
  const fuente = archivosDe(DIR).map((f) => readFileSync(f, 'utf-8')).join('\n')

  it('el índice aparece exactamente 3 veces, y las tres son de display', () => {
    // Presupuesto de ocurrencias, no lista negra de patrones. La versión
    // anterior exigía "no tener `<` en la línea", y `<` aparece en TypeScript
    // idiomático — `Array<number>`, `useState<number>(...)`, `new Map<string,
    // number>(...)`. Un Map id→índice alimentando el cálculo es justo la forma
    // que tomaría el bug al volver en una pantalla con varios jugadores, y
    // pasaba limpio.
    //
    // Contar no depende de adivinar la forma: cualquier aparición nueva —con
    // `<` o sin él— pone esto rojo y obliga a que alguien mire.
    //
    // Son 3 en 2 líneas: la ficha del jugador seleccionado lo usa una vez, y la
    // del listado dos (la guarda `!= null` y el valor). Si este número tiene que
    // cambiar, que sea con alguien mirando por qué.
    const ocurrencias = fuente.match(/handicap_at_registration/g)?.length ?? 0
    expect(ocurrencias).toBe(3)
  })

  it('el índice sólo se MUESTRA — nunca entra a un cálculo', () => {
    // Versión anterior de este canario: exigía que la línea tuviera a la vez
    // `handicap_at_registration` y una palabra de cálculo. Se esquivaba con una
    // variable intermedia —
    //
    //     const hcpJugador = player.handicap_at_registration ?? 0
    //     puntajeDeHoyo({ courseHandicap: hcpJugador, ... })
    //
    // — porque ninguna de las dos líneas tenía ambas cosas. La regresión pasó
    // el canario y llegó a un commit. Ahora la regla no mira palabras de
    // cálculo: el índice SÓLO puede aparecer dentro de JSX de display ("HCP
    // 12"), porque el jugador se identifica por su índice. Cualquier otro uso
    // —asignarlo a una variable, pasarlo a una función— es el bug volviendo.
    const usos = fuente
      .split('\n')
      .map((linea, i) => ({ linea: linea.trim(), n: i + 1 }))
      .filter(({ linea }) => /handicap_at_registration/.test(linea))
      .filter(({ linea }) => !linea.startsWith('//') && !linea.startsWith('*'))
      .filter(({ linea }) => !linea.includes('<'))

    expect(usos).toEqual([])
  })

  it('importa el gate canónico del handicap de scoring', () => {
    expect(fuente).toMatch(/courseHandicapDeScoring/)
  })

  it('deriva el puntaje del hoyo de la fuente única', () => {
    expect(fuente).toMatch(/puntajeDeHoyo/)
  })

  it('no arma sus propias queries de torneo/roster — usa la capa de datos', () => {
    // Las dos pantallas que escriben score comparten `scoring.ts`. Si esta
    // volviera a hacer su propio `.from('tournaments')`, podría dejar de traer
    // `hcp_calc_mode` o los tees y el gate caería en silencio al índice crudo.
    expect(fuente).not.toMatch(/\.from\(['"`]/)
  })
})

describe('canario de fuente · el scorer del organizador sigue cableado a la canónica', () => {
  // El del organizador era el ÚNICO que estaba bien antes de este PR — y por
  // eso mismo era el único sin canario. Al migrarlo a `courseHandicapDeScoring`
  // quedó tan expuesto a un revert como los otros tres: si alguien vuelve a
  // componer el par a mano acá, ningún test lo vería.
  const RUTA = join(
    process.cwd(),
    'src/app/organizador/[slug]/scoring/hooks/useScoreEntry.ts',
  )
  const fuente = readFileSync(RUTA, 'utf-8')

  it('compone el handicap con la canónica, no a mano', () => {
    expect(fuente).toMatch(/courseHandicapDeScoring/)
    // `parDeLosHoyosJugados` suelto acá = la composición volvió a escribirse.
    expect(fuente).not.toMatch(/parDeLosHoyosJugados/)
    expect(fuente).not.toMatch(/resolveScoringCourseHcp/)
  })

  it('el neto y los puntos que PERSISTE salen de puntajeDeHoyo', () => {
    expect(fuente).toMatch(/puntajeDeHoyo/)
  })
})

describe('canario de fuente · el servidor no reescribe el neto con el índice', () => {
  const RUTA = join(process.cwd(), 'src/app/api/game/actions.ts')
  const fuente = readFileSync(RUTA, 'utf-8')

  it('el fallback de neto/puntos usa el gate, no el índice crudo', () => {
    // `upsert_score` recalcula neto y puntos cuando el caller manda sólo el
    // gross — el "deshacer" del scorer y el guardado de putts/fairway/GIR.
    // Con el índice crudo, marcar una estadística REESCRIBÍA el neto correcto
    // que el scorer acababa de persistir.
    expect(fuente).toMatch(/courseHandicapDeScoring/)
    expect(fuente).toMatch(/puntajeDeHoyo/)
  })

  it('no reparte golpes con las funciones crudas de scoring', () => {
    // Si vuelven a aparecer acá, alguien esquivó `puntajeDeHoyo` y con él el gate.
    expect(fuente).not.toMatch(/strokesRecibidosEnHoyo\(|puntosStablefordHoyo\(/)
  })
})

describe('canario de fuente · el GWI del torneo reparte con el gate', () => {
  const RUTA = join(process.cwd(), 'src/app/api/gwi/torneo/[slug]/route.ts')
  const fuente = readFileSync(RUTA, 'utf-8')

  it('reparte los golpes con el course handicap, no con el índice', () => {
    // `hcp` es el índice de skill y el GWI lo necesita para la varianza; lo que
    // no puede volver a pasar es que ESE número reparta golpes.
    const repartos = fuente
      .split('\n')
      .filter((l) => /strokesRecibidosEnHoyo\(|puntosStablefordHoyo\(/.test(l))

    expect(repartos.length).toBeGreaterThan(0)
    for (const linea of repartos) {
      expect(linea).toMatch(/courseHcp/)
    }
  })

  it('toma el contexto del gate de la misma fuente que el board', () => {
    expect(fuente).toMatch(/fetchLegacyHcpContext/)
  })
})
