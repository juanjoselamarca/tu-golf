/**
 * Contrato del PR B de Timba libre (docs/specs/formato-personalizado.md, "Contrato para la integración").
 * Cada `describe` lleva el número de la cláusula que cubre.
 */
import { describe, it, expect } from 'vitest'
import {
  armarReglasGuardadas,
  calcularJuegoPersonalizado,
  crearConfigDePlantilla,
  leerReglasGuardadas,
  type ConfigJuego,
} from '@/golf/formats/personalizado'
import { courseHandicapDelJuego } from './handicap-del-juego'
import { armarEntradaDelJuego, vistaDelJuego, type DatosDelJuego, type FilaMarcaPuntito } from './juego-de-la-ronda'
import { prepararJuegoDeRondaNueva } from './juego-de-ronda-nueva'

const JUAN = '00000000-0000-4000-8000-00000000000a'
const PEDRO = '00000000-0000-4000-8000-00000000000b'
const DIEGO = '00000000-0000-4000-8000-00000000000c'
const TOMAS = '00000000-0000-4000-8000-00000000000d'
const IDS = [JUAN, PEDRO, DIEGO, TOMAS]

const PAR: Record<number, number> = Object.fromEntries(Array.from({ length: 27 }, (_, i) => [i + 1, i + 1 === 3 ? 3 : 4]))
const SI: Record<number, number> = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]))

const GREENIE = { id: 'greenie', tipo: 'greenie', valor: 1, destino: 'individual', activo: true } as const
const SANDY = { id: 'sandy', tipo: 'sandy', valor: 1, destino: 'individual', activo: true } as const

function config(extra: Partial<ConfigJuego> = {}): ConfigJuego {
  return { ...crearConfigDePlantilla('dos_cero_dos'), puntitos: [GREENIE, SANDY], ...extra }
}

function datos(over: Partial<DatosDelJuego> & { cfg?: ConfigJuego; ids?: string[] } = {}): DatosDelJuego {
  const { cfg = config(), ids = IDS, ...resto } = over
  return {
    reglasJuego: armarReglasGuardadas(cfg, ids),
    ronda: { holes: 18, hoyo_inicio: 1, estado: 'en_curso' },
    jugadores: ids.map(id => ({ id, scores: {} })),
    mapasHandicap: { courseHcpMap: { [JUAN]: 10, [PEDRO]: 14, [DIEGO]: 6, [TOMAS]: 18 }, sinIndice: [] },
    parMap: PAR,
    siMap: SI,
    marcas: [],
    retiros: [],
    ...resto,
  }
}

const armar = (d: DatosDelJuego) => {
  const r = armarEntradaDelJuego(d)
  if (!r.ok) throw new Error(`no armó: ${r.motivo}`)
  return r
}

const marca = (jugador: string, hoyo: number | string, puntito: string, created_at: string, id: string): FilaMarcaPuntito => ({
  id, jugador_id: jugador, hoyo, puntito_id: puntito, created_at,
})

describe('cláusula 1 — hándicap: un mapeo con nombre y sin default', () => {
  const mapas = { courseHcpMap: { a: 12, b: 0 }, sinIndice: new Set(['b']) }
  it('null si está en sinIndice (Set o array): su CH de índice 0 no es un hándicap', () => {
    expect(courseHandicapDelJuego(mapas, 'b')).toBeNull()
    expect(courseHandicapDelJuego({ ...mapas, sinIndice: ['b'] }, 'b')).toBeNull()
  })
  it('null si no tiene entrada en courseHcpMap (nunca 0)', () => {
    expect(courseHandicapDelJuego(mapas, 'zz')).toBeNull()
  })
  it('el CH del mapa si lo tiene, incluido un 0 real', () => {
    expect(courseHandicapDelJuego(mapas, 'a')).toBe(12)
    expect(courseHandicapDelJuego({ courseHcpMap: { c: 0 }, sinIndice: [] }, 'c')).toBe(0)
  })
  it('el cargador lo usa: un jugador sin índice en una Timba neto sale en sinHandicap (cláusula 11)', () => {
    const r = armar(datos({ cfg: config({ modo: 'neto' }), mapasHandicap: { courseHcpMap: { [JUAN]: 10, [PEDRO]: 0, [DIEGO]: 6, [TOMAS]: 18 }, sinIndice: [PEDRO] } }))
    expect(r.entrada.jugadores.find(j => j.id === PEDRO)?.courseHandicap).toBeNull()
    expect(calcularJuegoPersonalizado(r.entrada).sinHandicap).toEqual([PEDRO])
  })
})

describe('cláusula 2 — orden de los jugadores por jugadorIds', () => {
  const subterranea = (parejas: ConfigJuego['parejas']) => ({ ...crearConfigDePlantilla('subterranea'), parejas })
  const golpes = { [JUAN]: { 1: 3 }, [PEDRO]: { 1: 5 }, [DIEGO]: { 1: 4 }, [TOMAS]: { 1: 4 } }
  const conGolpes = (ids: string[]) => ids.map(id => ({ id, scores: golpes[id as keyof typeof golpes] }))

  it('(a) barajar los jugadores cargados no cambia las parejas ni los puntos', () => {
    const cfg = subterranea([[0, 1], [2, 3]])
    const ordenado = armar(datos({ cfg, jugadores: conGolpes(IDS) }))
    const barajado = armar(datos({ cfg, jugadores: conGolpes([TOMAS, DIEGO, JUAN, PEDRO]) }))
    expect(barajado.entrada.jugadores.map(j => j.id)).toEqual(IDS)
    const a = calcularJuegoPersonalizado(ordenado.entrada)
    const b = calcularJuegoPersonalizado(barajado.entrada)
    expect(b.hoyos[0].puntos).toEqual(a.hoyos[0].puntos)
    // Caso dorado 8: peor bola 5 vs 4 → Diego y Tomás.
    expect(b.hoyos[0].puntos).toEqual({ [JUAN]: 0, [PEDRO]: 0, [DIEGO]: 1, [TOMAS]: 1 })
  })

  it('(b) crear La Subterránea con parejas elegidas y recargar con created_at empatado da las mismas parejas por id', () => {
    let n = 0
    const creada = prepararJuegoDeRondaNueva({
      reglasJuego: subterranea([[0, 2], [1, 3]]),
      modoDeLaRonda: 'gross',
      jugadores: ['Juan', 'Pedro', 'Diego', 'Tomás'].map(nombre => ({ nombre, indice: 10 })),
      holes: 18,
      courseId: 'cancha',
      nuevoId: () => IDS[n++],
    })
    if (!creada.ok) throw new Error(creada.error)
    expect(creada.jugadorIds).toEqual(IDS)
    // La base devuelve las filas con el mismo created_at y en cualquier orden.
    const guardado = JSON.parse(JSON.stringify(creada.reglas))
    for (const orden of [[DIEGO, TOMAS, JUAN, PEDRO], [PEDRO, JUAN, TOMAS, DIEGO]]) {
      const r = armar(datos({ reglasJuego: guardado, jugadores: orden.map(id => ({ id, scores: {} })) }))
      const parejas = calcularJuegoPersonalizado(r.entrada).hoyos[0].parejas!
      expect(parejas.map(p => p.map(i => r.entrada.jugadores[i].id))).toEqual([[JUAN, DIEGO], [PEDRO, TOMAS]])
    }
  })

  it('(c) reemplazar un jugador no calcula con las parejas corridas', () => {
    const nuevo = '00000000-0000-4000-8000-0000000000ff'
    const cfg = subterranea([[0, 1], [2, 3]])
    expect(armarEntradaDelJuego(datos({ cfg, jugadores: [JUAN, PEDRO, nuevo, TOMAS].map(id => ({ id, scores: {} })) })))
      .toEqual({ ok: false, motivo: 'jugadores_cambiaron' })
    expect(armarEntradaDelJuego(datos({ cfg, jugadores: [JUAN, PEDRO, DIEGO].map(id => ({ id, scores: {} })) })))
      .toEqual({ ok: false, motivo: 'jugadores_cambiaron' })
  })

  it('reglas_juego vacío o inválido no calcula', () => {
    expect(armarEntradaDelJuego(datos({ reglasJuego: null }))).toEqual({ ok: false, motivo: 'reglas_invalidas' })
    expect(armarEntradaDelJuego(datos({ reglasJuego: { config: config(), jugadorIds: [JUAN, JUAN, PEDRO] } })))
      .toEqual({ ok: false, motivo: 'reglas_invalidas' })
  })
})

describe('cláusula 3 — marcas ordenadas por (created_at, id)', () => {
  const golpesPar3 = IDS.map(id => ({ id, scores: { 3: 3 } }))
  it('vale el último greenie aunque la base las devuelva desordenadas', () => {
    const r = armar(datos({
      jugadores: golpesPar3,
      marcas: [
        marca(JUAN, 3, 'greenie', '2026-10-27T15:00:02.000Z', 'b'),
        marca(PEDRO, 3, 'greenie', '2026-10-27T15:00:01.000Z', 'a'),
      ],
    }))
    const greenies = calcularJuegoPersonalizado(r.entrada).hoyos.find(h => h.numero === 3)!.especiales.filter(e => e.tipo === 'greenie' && e.cuenta)
    expect(greenies.map(g => g.jugadorId)).toEqual([JUAN])
  })
  it('con created_at empatado desempata el id', () => {
    const t = '2026-10-27T15:00:00.000Z'
    const r = armar(datos({ jugadores: golpesPar3, marcas: [marca(JUAN, 3, 'greenie', t, 'z'), marca(PEDRO, 3, 'greenie', t, 'y')] }))
    expect(r.entrada.marcas.map(m => m.jugadorId)).toEqual([PEDRO, JUAN])
  })
})

describe('cláusula 5 — greenie, uno por hoyo (defensa del motor; la escritura la prueba la RPC en integración)', () => {
  it('Pedro → Juan → Pedro: gana Pedro', () => {
    const r = armar(datos({
      jugadores: IDS.map(id => ({ id, scores: { 3: 3 } })),
      // Lo que dejaría la RPC es solo la última; aun si quedaran las tres, vale la última.
      marcas: [
        marca(PEDRO, 3, 'greenie', '2026-10-27T15:00:01Z', '1'),
        marca(JUAN, 3, 'greenie', '2026-10-27T15:00:02Z', '2'),
        marca(PEDRO, 3, 'greenie', '2026-10-27T15:00:03Z', '3'),
      ],
    }))
    const h3 = calcularJuegoPersonalizado(r.entrada).hoyos.find(h => h.numero === 3)!
    expect(h3.especiales.filter(e => e.tipo === 'greenie' && e.cuenta).map(e => e.jugadorId)).toEqual([PEDRO])
  })
})

describe('cláusula 6 — ids estables de los puntos especiales', () => {
  it('guardar y leer reglas_juego no cambia los ids', () => {
    const reglas = leerReglasGuardadas(JSON.parse(JSON.stringify(armarReglasGuardadas(config(), IDS))))
    expect(reglas?.config.puntitos.map(p => p.id)).toEqual(['greenie', 'sandy'])
  })
  it('una marca de un punto que ya no está en las reglas queda huérfana y no suma', () => {
    const r = armar(datos({ jugadores: IDS.map(id => ({ id, scores: { 3: 3 } })), marcas: [marca(JUAN, 3, 'viejo', '2026-10-27T15:00:00Z', '1')] }))
    expect(calcularJuegoPersonalizado(r.entrada).totales[JUAN]).toBe(calcularJuegoPersonalizado({ ...r.entrada, marcas: [] }).totales[JUAN])
  })
})

describe('cláusula 7 — hoyo numérico', () => {
  it('una marca con el hoyo como string llega como número y cuenta', () => {
    const r = armar(datos({
      jugadores: IDS.map(id => ({ id, scores: { '3': 3 } })),
      marcas: [marca(JUAN, '3', 'greenie', '2026-10-27T15:00:00Z', '1')],
    }))
    expect(r.entrada.marcas[0].hoyo).toBe(3)
    expect(r.entrada.scores[JUAN][3]).toBe(3)
    const h3 = calcularJuegoPersonalizado(r.entrada).hoyos.find(h => h.numero === 3)!
    expect(h3.especiales.some(e => e.tipo === 'greenie' && e.cuenta && e.jugadorId === JUAN)).toBe(true)
  })
})

describe('cláusula 8 — 27 hoyos', () => {
  it('neto en 27 hoyos no se calcula (el core aún da el CH en escala de 18)', () => {
    expect(armarEntradaDelJuego(datos({ cfg: config({ modo: 'neto' }), ronda: { holes: 27, hoyo_inicio: 1, estado: 'en_curso' } })))
      .toEqual({ ok: false, motivo: 'neto_no_disponible' })
  })
  it('la creación no ofrece Timba neto en 27 hoyos', () => {
    const r = prepararJuegoDeRondaNueva({
      reglasJuego: config({ modo: 'neto' }), modoDeLaRonda: 'neto', holes: 27, courseId: 'cancha', nuevoId: () => crypto.randomUUID(),
      jugadores: ['Juan', 'Pedro', 'Diego', 'Tomás'].map(nombre => ({ nombre, indice: 10 })),
    })
    expect(r).toEqual({ ok: false, error: 'Por ahora, el juego neto es para rondas de 9 o 18 hoyos.' })
  })
  it('gross en 27 hoyos recorre 1..27 (no 1..18 y 1..9 otra vez)', () => {
    const r = armar(datos({ ronda: { holes: 27, hoyo_inicio: 1, estado: 'en_curso' } }))
    expect(r.entrada.hoyos.map(h => h.numero)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1))
  })
})

describe('cláusula 9 — retiros', () => {
  it('un retiro persistido cuenta: Tomás retirado pierde los hoyos que no jugó (caso dorado 17)', () => {
    const scores: Record<string, Record<number, number>> = { [JUAN]: { 1: 4 }, [PEDRO]: { 1: 5 }, [DIEGO]: { 1: 6 }, [TOMAS]: {} }
    const r = armar(datos({ jugadores: IDS.map(id => ({ id, scores: scores[id] })), retiros: [{ jugador_id: TOMAS, desde_hoyo: '1' }] }))
    expect(calcularJuegoPersonalizado(r.entrada).hoyos[0].puntos).toEqual({ [JUAN]: 2, [PEDRO]: 0, [DIEGO]: 0, [TOMAS]: -2 })
  })
  it('un retiro desde un hoyo que no está en la ronda se ignora: sus hoyos sin score quedan pendientes', () => {
    const scores: Record<string, Record<number, number>> = { [JUAN]: { 1: 4 }, [PEDRO]: { 1: 5 }, [DIEGO]: { 1: 6 }, [TOMAS]: {} }
    const r = armar(datos({
      ronda: { holes: 9, hoyo_inicio: 1, estado: 'en_curso' },
      jugadores: IDS.map(id => ({ id, scores: scores[id] })),
      retiros: [{ jugador_id: TOMAS, desde_hoyo: 15 }],
    }))
    const res = calcularJuegoPersonalizado(r.entrada)
    expect(res.hoyos[0].estado).toBe('pendiente')
    expect(res.hoyosPendientes).toContain(1)
  })
})

describe('cláusula 10 — ronda cerrada = estado finalizada leído de la base', () => {
  const scores: Record<string, Record<number, number>> = { [JUAN]: { 1: 4 }, [PEDRO]: { 1: 5 }, [DIEGO]: { 1: 6 }, [TOMAS]: {} }
  const jugadores = IDS.map(id => ({ id, scores: scores[id] }))
  it('cerrar con hoyos sin score: cuentan como "no jugó" (no pendientes)', () => {
    const r = armar(datos({ jugadores, ronda: { holes: 18, hoyo_inicio: 1, estado: 'finalizada' } }))
    expect(r.entrada.rondaCerrada).toBe(true)
    const res = calcularJuegoPersonalizado(r.entrada)
    expect(res.hoyosPendientes).toEqual([])
    expect(res.hoyos[0].puntos[TOMAS]).toBe(-2)
  })
  it('en curso, el mismo hoyo queda pendiente', () => {
    const r = armar(datos({ jugadores }))
    expect(r.entrada.rondaCerrada).toBe(false)
    expect(calcularJuegoPersonalizado(r.entrada).hoyos[0].estado).toBe('pendiente')
  })
})

describe('decisión de Juanjo 27-oct — lo que ve el grupo en una Timba neto', () => {
  it('la vista trae puntos y golpes recibidos por hoyo, nunca el CH ni el índice de nadie', () => {
    const r = armar(datos({ cfg: config({ modo: 'neto' }) }))
    const vista = vistaDelJuego(r.entrada, r.jugadorIds, calcularJuegoPersonalizado(r.entrada))
    const json = JSON.stringify(vista)
    expect(json).not.toMatch(/courseHandicap|courseHcp|indice|handicapIndex/i)
    expect(Object.keys(vista).sort()).toEqual(['config', 'golpesRecibidos', 'jugadorIds', 'resultado'])
    // A la diferencia del más bajo: Diego 0, Juan 4, Pedro 8, Tomás 12 en 18 hoyos (caso dorado 5).
    const total = (id: string) => Object.values(vista.golpesRecibidos[id]).reduce((a, b) => a + b, 0)
    expect(IDS.map(total)).toEqual([4, 8, 0, 12])
    // SI 5: reciben Pedro y Tomás.
    expect(IDS.map(id => vista.golpesRecibidos[id][5])).toEqual([0, 1, 0, 1])
  })
})

describe('datos de cancha', () => {
  it('sin par de algún hoyo no se calcula (ni birdie ni greenie tendrían referencia)', () => {
    expect(armarEntradaDelJuego(datos({ parMap: {} }))).toEqual({ ok: false, motivo: 'sin_datos_de_cancha' })
  })
  it('una ronda de 9 desde el 10 usa los hoyos 10..18 con SI normalizado 1..9', () => {
    const r = armar(datos({ ronda: { holes: 9, hoyo_inicio: 10, estado: 'en_curso' } }))
    expect(r.entrada.hoyos.map(h => h.numero)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect([...r.entrada.hoyos.map(h => h.strokeIndex)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
