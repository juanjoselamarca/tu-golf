/**
 * Resultado final de una Timba libre (maqueta Final): todo sale de la vista del servidor (`GET /juego`).
 */
import { describe, it, expect } from 'vitest'
import { armarReglasGuardadas, calcularJuegoPersonalizado, crearConfigDePlantilla, type ConfigJuego } from '@/golf/formats/personalizado'
import { armarEntradaDelJuego, vistaDelJuego, type VistaDelJuego } from './juego-de-la-ronda'
import { shareableText } from '@/golf/share/whatsapp'
import { armarResultadoDeLaTimba, rangoDeHoyos, textoDePuntos, textoParaCompartirLaTimba, unirNombres } from './resultado-de-la-timba'

const J = '00000000-0000-4000-8000-00000000000a'
const P = '00000000-0000-4000-8000-00000000000b'
const D = '00000000-0000-4000-8000-00000000000c'
const T = '00000000-0000-4000-8000-00000000000d'
const IDS = [J, P, D, T]
const NOMBRES = { [J]: 'Juan Pérez', [P]: 'Pedro Soto', [D]: 'Diego Ruiz', [T]: 'Tomás Lira' }
const PAR = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 4]))
const SI = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]))
const CHIPINGO = { id: 'chip', tipo: 'chipingo', valor: 1, destino: 'individual', activo: true } as const

function vista(
  scores: Record<string, Record<number, number>>,
  cfg: ConfigJuego,
  extra: { hoyoInicio?: number; marcas?: { jugador: string; hoyo: number; puntito: string }[]; retiros?: Record<string, number>; ids?: string[] } = {},
): VistaDelJuego {
  const ids = extra.ids ?? IDS
  const r = armarEntradaDelJuego({
    reglasJuego: armarReglasGuardadas(cfg, ids),
    ronda: { holes: 18, hoyo_inicio: extra.hoyoInicio ?? 1, estado: 'finalizada' },
    jugadores: ids.map(id => ({ id, scores: scores[id] ?? {} })),
    mapasHandicap: { courseHcpMap: {}, sinIndice: [] },
    parMap: PAR, siMap: SI,
    marcas: (extra.marcas ?? []).map((m, i) => ({
      id: `m${i}`, jugador_id: m.jugador, hoyo: m.hoyo, puntito_id: m.puntito, created_at: `2026-11-16T12:00:0${i}Z`,
    })),
    retiros: Object.entries(extra.retiros ?? {}).map(([jugador_id, desde_hoyo]) => ({ jugador_id, desde_hoyo })),
  } as Parameters<typeof armarEntradaDelJuego>[0])
  if (!r.ok) throw new Error(r.motivo)
  return vistaDelJuego(r.entrada, r.jugadorIds, calcularJuegoPersonalizado(r.entrada))
}

/** Todos los hoyos con los mismos golpes por jugador. */
function parejo(golpes: Record<string, number>): Record<string, Record<number, number>> {
  return Object.fromEntries(Object.entries(golpes).map(([id, g]) => [id, Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, g]))]))
}

/** Vista con un ranking dado (para los titulares): el resto del resultado vacío. */
function conRanking(puntos: Record<string, number>, cfg: ConfigJuego = crearConfigDePlantilla('dos_cero_dos')): VistaDelJuego {
  const orden = Object.entries(puntos).sort((a, b) => b[1] - a[1])
  return {
    config: cfg,
    jugadorIds: Object.keys(puntos),
    resultado: {
      // 18 hoyos puntuados (sin puntos por hoyo): solo importa que la ronda se jugó.
      hoyos: Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, estado: 'puntuado', especiales: [], puntos: {}, scoreDeJuego: {} })) as never,
      tramos: [], totales: puntos, hoyosPendientes: [], sinHandicap: [],
      ranking: orden.map(([jugadorId, p]) => ({ jugadorId, puntos: p, puesto: 1 + orden.filter(([, q]) => q > p).length })),
    },
    golpesRecibidos: {}, marcas: [], retiros: {},
  }
}

describe('unirNombres y textoDePuntos', () => {
  it('une con comas y "y"', () => {
    expect(unirNombres(['Pedro'])).toBe('Pedro')
    expect(unirNombres(['Pedro', 'Juan'])).toBe('Pedro y Juan')
    expect(unirNombres(['Pedro', 'Juan', 'Diego'])).toBe('Pedro, Juan y Diego')
  })
  it('singular y plural', () => {
    expect(textoDePuntos(1)).toBe('un punto')
    expect(textoDePuntos(2)).toBe('2 puntos')
  })
})

describe('armarResultadoDeLaTimba — titular', () => {
  it('ganador por un punto (singular)', () => {
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 35, [J]: 34, [D]: 32, [T]: 24 }), NOMBRES)
    expect(r.titular).toBe('Ganó Pedro')
    expect(r.bajada).toBe('Por un punto sobre Juan.')
    expect(r.ranking.map(f => [f.puesto, f.nombre, f.texto])).toEqual([[1, 'Pedro', '+35'], [2, 'Juan', '+34'], [3, 'Diego', '+32'], [4, 'Tomás', '+24']])
  })
  it('ganador por varios puntos (plural), con empate en el segundo puesto', () => {
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 6, [J]: 2, [D]: 2, [T]: -2 }), NOMBRES)
    expect(r.bajada).toBe('Por 4 puntos sobre Juan y Diego.')
  })
  it('empate en el primer puesto: titular de empate con los nombres', () => {
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 0, [J]: 0, [D]: -1, [T]: -3 }, crearConfigDePlantilla('subterror')), NOMBRES)
    expect(r.titular).toBe('Empate entre Pedro y Juan')
    expect(r.bajada).toBe('Con 0 cada uno.')
    expect(r.ranking.filter(f => f.puesto === 1)).toHaveLength(2)
  })
  it('empate de todos (3 o más)', () => {
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 0, [J]: 0, [D]: 0 }, crearConfigDePlantilla('subterror')), NOMBRES)
    expect(r.titular).toBe('Empate entre todos')
  })
  it('juego individual: sin sección Parejas', () => {
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 2, [J]: 0 }), NOMBRES)
    expect(r.tramos).toBeNull()
    expect(r.notaTramos).toBeNull()
  })
  it('sin puntos especiales en el juego: la sección no existe (null)', () => {
    expect(armarResultadoDeLaTimba(conRanking({ [P]: 2, [J]: 0 }), NOMBRES).puntosEspeciales).toBeNull()
  })
})

describe('armarResultadoDeLaTimba — La Colombiana con el motor', () => {
  const colombiana: ConfigJuego = { ...crearConfigDePlantilla('colombiana'), sorteo: [0, 1, 2], puntitos: [CHIPINGO] }
  const golpes = parejo({ [J]: 4, [P]: 3, [D]: 5, [T]: 6 })

  it('encabezado, ranking del motor y ganador', () => {
    const v = vista(golpes, colombiana)
    const r = armarResultadoDeLaTimba(v, NOMBRES)
    expect(r.encabezado).toBe('La Colombiana · 18 hoyos · Gross')
    expect(r.ranking.map(f => f.puntos)).toEqual(v.resultado.ranking.map(x => x.puntos))
    expect(r.titular).toBe('Ganó Pedro')
  })

  it('tres tramos con su marcador, la pareja ganadora y la nota de hoyos', () => {
    const r = armarResultadoDeLaTimba(vista(golpes, colombiana), NOMBRES)
    expect(r.tramos).toHaveLength(3)
    expect(r.tramos!.map(t => t.parejas)).toEqual([
      ['Juan y Pedro', 'Diego y Tomás'], ['Juan y Diego', 'Pedro y Tomás'], ['Juan y Tomás', 'Pedro y Diego'],
    ])
    for (const t of r.tramos!) {
      expect(t.marcador).toBe(`${t.puntos[0]} – ${t.puntos[1]}`)
      expect(t.ganadora).toBe(t.puntos[0] === t.puntos[1] ? null : t.puntos[0] > t.puntos[1] ? 0 : 1)
    }
    expect(r.tramos![0].ganadora).toBe(0)
    expect(r.notaTramos).toBe('Hoyos 1–6, 7–12 y 13–18. Ganador de cada tramo en negrita.')
  })

  it('saliendo del 10, los tramos siguen el orden de juego', () => {
    const r = armarResultadoDeLaTimba(vista(golpes, colombiana, { hoyoInicio: 10 }), NOMBRES)
    expect(r.notaTramos).toBe('Hoyos 10–15 · 16–18 y 1–3 · 4–9. Ganador de cada tramo en negrita.')
  })

  it('puntos especiales: agregados por tipo y jugador, solo los que cuentan', () => {
    const r = armarResultadoDeLaTimba(vista(golpes, colombiana, {
      marcas: [{ jugador: P, hoyo: 3, puntito: 'chip' }, { jugador: P, hoyo: 5, puntito: 'chip' }, { jugador: D, hoyo: 4, puntito: 'chip' }],
    }), NOMBRES)
    expect(r.puntosEspeciales!.map(p => p.texto)).toEqual(['Chipingo · Pedro ×2', 'Chipingo · Diego'])
  })

  it('un punto que no cuenta no aparece (greenie en un par 4)', () => {
    const cfg: ConfigJuego = { ...colombiana, puntitos: [{ id: 'g', tipo: 'greenie', valor: 1, destino: 'individual', activo: true }] }
    const r = armarResultadoDeLaTimba(vista(golpes, cfg, { marcas: [{ jugador: P, hoyo: 3, puntito: 'g' }] }), NOMBRES)
    expect(r.puntosEspeciales).toEqual([])
  })

  it('retirado: lo marca en el ranking y en el texto para compartir', () => {
    const r = armarResultadoDeLaTimba(vista(golpes, colombiana, { retiros: { [T]: 14 } }), NOMBRES)
    expect(r.ranking.find(f => f.jugadorId === T)?.retiradoDesde).toBe(14)
    expect(r.ranking.find(f => f.jugadorId === J)?.retiradoDesde).toBeNull()
    expect(textoParaCompartirLaTimba(r, 'Club X')).toContain('Tomás')
    expect(textoParaCompartirLaTimba(r, 'Club X')).toMatch(/Tomás [^\n]*\(se retiró en el hoyo 14\)/)
  })
})

describe('armarResultadoDeLaTimba — parejas fijas (La Subterránea)', () => {
  const sub: ConfigJuego = { ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [2, 3]] }

  it('manda el marcador de las parejas, no el empate individual de los compañeros', () => {
    // Juan y Pedro (4 y 4) contra Diego y Tomás (5 y 6): los compañeros empatan en el ranking individual.
    const r = armarResultadoDeLaTimba(vista(parejo({ [J]: 4, [P]: 4, [D]: 5, [T]: 6 }), sub), NOMBRES)
    const [a, b] = r.tramos![0].puntos
    expect(a).not.toBe(b)
    const ganan = a > b ? 'Juan y Pedro' : 'Diego y Tomás'
    const pierden = a > b ? 'Diego y Tomás' : 'Juan y Pedro'
    expect(r.titular).toBe(`Ganaron ${ganan}`)
    expect(r.bajada).toBe(`Por ${textoDePuntos(Math.abs(a - b))} sobre ${pierden}.`)
  })

  it('marcador igual: empate entre las parejas', () => {
    const r = armarResultadoDeLaTimba(vista(parejo({ [J]: 4, [P]: 5, [D]: 4, [T]: 5 }), sub), NOMBRES)
    expect(r.tramos![0].puntos[0]).toBe(r.tramos![0].puntos[1])
    expect(r.titular).toBe('Empate entre las parejas')
    expect(r.bajada).toBe(`Con ${textoDePuntos(r.tramos![0].puntos[0])} cada una.`)
  })
})

describe('armarResultadoDeLaTimba — ronda cerrada antes del final', () => {
  it('el encabezado dice cuántos hoyos se jugaron', () => {
    const doce = Object.fromEntries(IDS.map(id => [id, Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 4]))]))
    const r = armarResultadoDeLaTimba(vista(doce, crearConfigDePlantilla('dos_cero_dos')), NOMBRES)
    expect(r.encabezado).toMatch(/ · 12 de 18 hoyos · Gross$/)
  })

  it('Colombiana cerrada en el 12: el tercer tramo dice "No se jugó", sin marcador ni ganadora (ni al compartir)', () => {
    const colombiana: ConfigJuego = { ...crearConfigDePlantilla('colombiana'), sorteo: [0, 1, 2] }
    const doce = Object.fromEntries(IDS.map((id, k) => [id, Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3 + k]))]))
    const r = armarResultadoDeLaTimba(vista(doce, colombiana), NOMBRES)
    expect(r.encabezado).toBe('La Colombiana · 12 de 18 hoyos · Gross')
    expect(r.tramos!.map(t => t.jugado)).toEqual([true, true, false])
    expect(r.tramos![2]).toMatchObject({ marcador: 'No se jugó', ganadora: null })
    expect(r.tramos![0].ganadora).not.toBeNull()
    const texto = textoParaCompartirLaTimba(r, '')
    expect(texto).toContain('Juan y Tomás vs Pedro y Diego: no se jugó')
    expect(texto).not.toContain('0 – 0')
  })

  it('sin un solo hoyo puntuado: "No se jugó ningún hoyo", sin bajada, también en parejas fijas', () => {
    for (const cfg of [
      { ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [2, 3]] } as ConfigJuego,
      { ...crearConfigDePlantilla('colombiana'), sorteo: [0, 1, 2] } as ConfigJuego,
      crearConfigDePlantilla('dos_cero_dos'),
    ]) {
      const r = armarResultadoDeLaTimba(vista({}, cfg), NOMBRES)
      expect(r.titular, cfg.plantilla).toBe('No se jugó ningún hoyo')
      expect(r.bajada, cfg.plantilla).toBe('')
      expect(r.encabezado, cfg.plantilla).toMatch(/ · 0 de 18 hoyos · /)
      expect(r.tramos?.every(t => !t.jugado && t.ganadora === null) ?? true, cfg.plantilla).toBe(true)
      expect(textoParaCompartirLaTimba(r, '').split('\n')[1], cfg.plantilla).toBe('No se jugó ningún hoyo.')
    }
  })
})

describe('armarResultadoDeLaTimba — nombres abreviados', () => {
  it('un nombre que termina en inicial ("Maximiliano U.") no deja punto doble en la bajada ni al compartir', () => {
    const largos = { [J]: 'Maximiliano Undurraga', [P]: 'Bartolomé Echeverría', [D]: 'Maximiliano Larraín', [T]: 'Cristóbal Errázuriz' }
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 9, [J]: 2, [D]: 1, [T]: 0 }), largos)
    expect(r.bajada).toBe('Por 7 puntos sobre Maximiliano U.')
    const ganaMax = armarResultadoDeLaTimba(conRanking({ [J]: 9, [P]: 2, [D]: 1, [T]: 0 }), largos)
    expect(textoParaCompartirLaTimba(ganaMax, '').split('\n')[1]).toBe('Ganó Maximiliano U. Por 7 puntos sobre Bartolomé.')
  })
})

describe('rangoDeHoyos', () => {
  it('consecutivos, uno solo y el que pasa del 18', () => {
    expect(rangoDeHoyos([1, 2, 3, 4, 5, 6])).toBe('1–6')
    expect(rangoDeHoyos([7])).toBe('7')
    expect(rangoDeHoyos([16, 17, 18, 1, 2, 3])).toBe('16–18 y 1–3')
  })
})

describe('textoParaCompartirLaTimba', () => {
  it('juego, ranking de puntos, parejas, puntos especiales y link', () => {
    const colombiana: ConfigJuego = { ...crearConfigDePlantilla('colombiana'), sorteo: [0, 1, 2], puntitos: [CHIPINGO] }
    const r = armarResultadoDeLaTimba(vista(parejo({ [J]: 4, [P]: 3, [D]: 5, [T]: 6 }), colombiana, {
      marcas: [{ jugador: P, hoyo: 3, puntito: 'chip' }],
    }), NOMBRES)
    const url = 'https://golfersplus.vercel.app/ronda-libre/ABC123'
    const texto = textoParaCompartirLaTimba(r, 'Los Leones')
    const lineas = texto.split('\n')
    expect(lineas[0]).toBe('La Colombiana · 18 hoyos · Gross · Los Leones')
    expect(lineas[1]).toMatch(/^Ganó Pedro\. Por \d+ puntos? sobre /)
    expect(lineas).toContain('Parejas')
    expect(lineas.some(l => /^Juan y Pedro \d+ – \d+ Diego y Tomás$/.test(l))).toBe(true)
    expect(texto).toContain('Puntos especiales: Chipingo · Pedro')
    expect(texto).not.toMatch(/Chipingo · Pedro \d/)
    // El link lo agrega la cascada de compartir, una sola vez y en su propia línea.
    const compartido = shareableText({ title: '', text: texto, url })
    expect(compartido.split(url)).toHaveLength(2)
    expect(compartido.split('\n').at(-1)).toBe(url)
    // Puntos de la Timba, nunca golpes ni neto.
    expect(texto).not.toMatch(/neto|golpes|HCP/i)
  })

  it('juego individual: sin parejas', () => {
    const r = armarResultadoDeLaTimba(conRanking({ [P]: 0, [J]: 0, [D]: -1 }, crearConfigDePlantilla('subterror')), NOMBRES)
    const texto = textoParaCompartirLaTimba(r, '')
    expect(texto).not.toContain('Parejas')
    expect(texto.split('\n')[0]).toBe('La Subterror · 18 hoyos · Gross')
  })
})
