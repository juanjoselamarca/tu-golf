import { describe, expect, it } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO, type ConfigSkins } from '@/golf/formats/skins'
import type { MarcaPuntito } from '@/golf/formats/personalizado'
import { especialesQueValenEnElSkins, resultadoDelSkins, valorDelHoyoSkins } from './skins-del-scorer'
import {
  armarResultadoDelSkins, armarTablaDelSkins, detalleDeLaFila, lecturaDeLaCelda, quienLlevaElHoyo, textoDeLaCelda, textoDeLaPlata, textoDeSkins, textoDelNeto,
  textoParaCompartirElSkins,
} from './tabla-del-skins'

const IDS = ['a', 'b', 'c']
const NOMBRES = { a: 'Ana Pérez', b: 'Beto Soto', c: 'Coni Díaz' }
const HOYOS = [{ numero: 1, par: 4, si: 1 }, { numero: 2, par: 3, si: 2 }, { numero: 3, par: 5, si: 3 }]
const PUNTITOS: ConfigSkins['puntitos'] = [{ id: 'chip', tipo: 'chipingo' }, { id: 'green', tipo: 'greenie' }, { id: 'sandy', tipo: 'sandy' }]

function config(c: Partial<ConfigSkins> = {}): ConfigSkins {
  return { ...CONFIG_SKINS_POR_DEFECTO, modo: 'gross', puntitos: PUNTITOS, ...c }
}

function tabla(input: {
  scores: Record<string, Record<number, number>>
  fuera?: Record<string, Record<number, true>>
  retiros?: Record<string, number>
  marcas?: MarcaPuntito[]
  c?: Partial<ConfigSkins>
}) {
  const cfg = config(input.c)
  const resultado = resultadoDelSkins({
    reglas: { config: cfg, jugadorIds: IDS },
    contexto: { jugadores: IDS.map(id => ({ nombre: id, courseHandicap: null })), hoyos: HOYOS },
    scores: input.scores,
    fuera: input.fuera ?? {},
    retiros: input.retiros,
    marcas: input.marcas,
  })
  if (!resultado) throw new Error('sin resultado')
  return armarTablaDelSkins(resultado, { config: cfg, retiros: input.retiros ?? {} })
}

// Cada uno gana un hoyo solo; Ana además un chipingo: 4 skins, Ana 2.
const UNO_CADA_UNO = { a: { 1: 3, 2: 3, 3: 5 }, b: { 1: 4, 2: 2, 3: 5 }, c: { 1: 4, 2: 3, 3: 4 } }
const CHIP_DE_ANA: MarcaPuntito[] = [{ jugadorId: 'a', hoyo: 1, puntitoId: 'chip' }]

describe('liquidación del skins', () => {
  it('reparte con resto mayor y la suma da exacto el pozo', () => {
    // 3 × 1.001 = 3.003 entre 2:1:1 → 1.501,5 / 750,75 / 750,75: el resto (2) va a los decimales más grandes.
    const t = tabla({ scores: UNO_CADA_UNO, marcas: CHIP_DE_ANA, c: { pozoPorJugador: 1001 } })
    expect(t.plata).toBe('definitiva')
    expect(t.filas.map(f => [f.jugadorId, f.skins, f.cobra, f.neto])).toEqual([
      ['a', 2, 1501, 500], ['b', 1, 751, -250], ['c', 1, 751, -250],
    ])
    expect(t.filas.reduce((s, f) => s + f.cobra, 0)).toBe(3003)
    const r = armarResultadoDelSkins(t, NOMBRES)
    expect(r.titular).toBe('Ganó Ana')
    expect(r.liquidacion?.map(l => [l.jugadorId, l.cobra, l.neto])).toEqual([['a', 1501, 500], ['b', 751, -250], ['c', 751, -250]])
    expect(textoDelNeto(500)).toBe('Gana $500')
    expect(textoDelNeto(-250)).toBe('Pierde $250')
    expect(textoDelNeto(0)).toBe('Queda igual')
  })

  it('nadie ganó un skin: se devuelve el pozo', () => {
    const todosIguales = { a: { 1: 4, 2: 3, 3: 5 }, b: { 1: 4, 2: 3, 3: 5 }, c: { 1: 4, 2: 3, 3: 5 } }
    const t = tabla({ scores: todosIguales, c: { pozoPorJugador: 5000, empateUltimoHoyo: 'se_pierde' } })
    expect(t.plata).toBe('devolucion')
    expect(t.filas.map(f => [f.cobra, f.neto])).toEqual([[5000, 0], [5000, 0], [5000, 0]])
    const r = armarResultadoDelSkins(t, NOMBRES)
    expect(r.titular).toBe('Nadie ganó un skin')
    expect(r.bajada).toBe('Se devuelve el pozo: cada uno recupera $5.000.')
    expect(textoDeLaPlata(t, 5000)).toBe('$5.000')
    // Con «repartir», el mismo empate se reparte: sí hubo skins y no se devuelve.
    expect(tabla({ scores: todosIguales, c: { pozoPorJugador: 5000 } }).plata).toBe('definitiva')
  })

  it('sin pozo: solo skins, sin plata', () => {
    const t = tabla({ scores: UNO_CADA_UNO })
    expect(t.plata).toBe('sin_pozo')
    expect(t.filas.every(f => f.cobra === 0 && f.neto === 0)).toBe(true)
    expect(textoDeLaPlata(t, 0)).toBeNull()
    const r = armarResultadoDelSkins(t, NOMBRES)
    expect(r.liquidacion).toBeNull()
    expect(r.encabezado).toBe('Skins · Gross · Sin pozo')
  })

  it('el retirado conserva sus skins y no bloquea el cierre', () => {
    const scores = { a: { 1: 4, 2: 2, 3: 5 }, b: { 1: 4, 2: 3, 3: 4 }, c: { 1: 3 } }
    // Sin el retiro, los hoyos 2 y 3 siguen abiertos (falta Coni): no hay liquidación final.
    expect(tabla({ scores, c: { pozoPorJugador: 1000 } }).plata).toBe('estimada')
    const t = tabla({ scores, retiros: { c: 2 }, c: { pozoPorJugador: 1000 } })
    expect(t.plata).toBe('definitiva')
    expect(t.filas.find(f => f.jugadorId === 'c')).toMatchObject({ skins: 1, cobra: 1000, neto: 0, retiradoDesde: 2, hoyosGanados: [1] })
    expect(t.filas.reduce((s, f) => s + f.cobra, 0)).toBe(3000)
  })

  it('estimada durante la ronda («~»), definitiva al cerrar el último hoyo', () => {
    const parcial = { a: { 1: 3, 2: 3 }, b: { 1: 4, 2: 3 }, c: { 1: 4, 2: 3, 3: 4 } }
    const t = tabla({ scores: parcial, c: { pozoPorJugador: 1000 } })
    expect(t.plata).toBe('estimada')
    expect(t.definitivo).toBe(false)
    // Ana tiene el único skin ganado: hoy se llevaría todo el pozo.
    expect(textoDeLaPlata(t, t.filas[0].cobra)).toBe('~$3.000')
    // El 2 empató: el 3 vale 2 y está en disputa con el 4 de Coni como mejor score.
    expect(t.enJuego).toEqual({ hoyo: 3, valor: 2, provisional: false })
    const h3 = t.hoyos.find(h => h.numero === 3)!
    expect(h3).toMatchObject({ estado: 'en_disputa', mejor: 4, lideres: ['c'] })
    expect(textoDeLaCelda(t.hoyos.find(h => h.numero === 2)!, id => id)).toBe('Empate')
    const final = tabla({ scores: { ...parcial, a: { 1: 3, 2: 3, 3: 5 }, b: { 1: 4, 2: 3, 3: 5 } }, c: { pozoPorJugador: 1000 } })
    expect(final.plata).toBe('definitiva')
    expect(textoDeLaPlata(final, 1500)).toBe('$1.500')
    expect(final.enJuego).toBeNull()
  })

  it('con pozo y nadie ganó todavía: no se estima plata', () => {
    const t = tabla({ scores: { a: { 1: 4 }, b: { 1: 4 }, c: { 1: 4 } }, c: { pozoPorJugador: 1000 } })
    expect(t.plata).toBe('sin_skins')
    expect(textoDeLaPlata(t, 0)).toBeNull()
  })

  it('la X no gana el hoyo', () => {
    const t = tabla({ scores: { a: {}, b: { 1: 5 }, c: { 1: 5 } }, fuera: { a: { 1: true } } })
    expect(t.hoyos[0].estado).toBe('arrastre')
  })

  it('reparto del último hoyo: fracciones de skin', () => {
    const t = tabla({ scores: { a: { 1: 4, 2: 3, 3: 4 }, b: { 1: 4, 2: 3, 3: 4 }, c: { 1: 4, 2: 3, 3: 5 } } })
    expect(t.hoyos[2].estado).toBe('repartido')
    expect(t.filas.map(f => f.skins)).toEqual([1.5, 1.5, 0])
    expect(t.filas.map(f => f.puesto)).toEqual([1, 1, 3])
    expect(textoDeSkins(1.5)).toBe('1,5 skins')
    expect(textoDeSkins(1)).toBe('1 skin')
    expect(armarResultadoDelSkins(t, NOMBRES).titular).toBe('Empate entre Ana y Beto')
  })

  it('ronda cerrada con hoyos sin resolver: no anuncia ganador, dice quién iba adelante', () => {
    // Ana ganó el 1; el 2 y el 3 quedaron abiertos (falta Beto): la plata es estimada, no hay ganador.
    const t = tabla({ scores: { a: { 1: 3, 2: 3, 3: 5 }, b: { 1: 4 }, c: { 1: 4, 2: 3, 3: 4 } }, c: { pozoPorJugador: 1000 } })
    expect(t.definitivo).toBe(false)
    expect(t.plata).toBe('estimada')
    const r = armarResultadoDelSkins(t, NOMBRES)
    expect(r.titular).toBe('Quedaron hoyos sin resolver')
    expect(r.bajada).toBe('Iba adelante Ana con 1 skin.')
    expect(r.liquidacion).toBeNull()
    const texto = textoParaCompartirElSkins(r, t, 'Los Leones')
    expect(texto).toContain('Quedaron hoyos sin resolver. Iba adelante Ana con 1 skin.')
    expect(texto).toContain('Sin liquidación: hay hoyos por resolver.')
    expect(texto).not.toContain('Ganó')
    // Empatados adelante y nadie con skins.
    const empate = tabla({ scores: { a: { 1: 3, 2: 4 }, b: { 1: 4, 2: 3 }, c: { 1: 4, 2: 4 } } })
    expect(armarResultadoDelSkins(empate, NOMBRES).bajada).toBe('Iban adelante Ana y Beto con 1 skin cada uno.')
    const nadie = tabla({ scores: { a: { 1: 4 }, b: { 1: 4 }, c: { 1: 4 } }, c: { pozoPorJugador: 1000 } })
    expect(armarResultadoDelSkins(nadie, NOMBRES)).toMatchObject({ titular: 'Quedaron hoyos sin resolver', bajada: 'Nadie había ganado un skin.' })
  })

  it('hoyo en disputa: quién lo lleva o «Emp.», también para el lector de pantalla', () => {
    const t = tabla({ scores: { a: { 1: 3, 2: 3 }, b: { 1: 4, 2: 3 }, c: { 1: 4, 2: 3, 3: 4 } } })
    const h3 = t.hoyos.find(h => h.numero === 3)!
    expect(quienLlevaElHoyo(h3, id => id.toUpperCase())).toBe('C')
    expect(lecturaDeLaCelda(h3, id => NOMBRES[id as 'a'], 'gross')).toContain('Mejor gross hasta ahora: 4, lo lleva Coni Díaz')
    const empatado = { ...h3, lideres: ['a', 'c'] }
    expect(quienLlevaElHoyo(empatado, id => id)).toBe('Emp.')
    expect(lecturaDeLaCelda(empatado, id => NOMBRES[id as 'a'], 'gross')).toContain('empatado entre Ana Pérez y Coni Díaz')
    expect(quienLlevaElHoyo(t.hoyos[0], id => id)).toBeNull()
  })

  it('la fila del reparto explica la fracción', () => {
    const t = tabla({ scores: { a: { 1: 3, 2: 3, 3: 4 }, b: { 1: 4, 2: 3, 3: 4 }, c: { 1: 4, 2: 3, 3: 5 } } })
    expect(t.filas[0]).toMatchObject({ jugadorId: 'a', hoyosGanados: [1], hoyosRepartidos: [3] })
    expect(detalleDeLaFila(t.filas[0])).toBe('Hoyo 1 · reparto del 3')
    expect(detalleDeLaFila(t.filas.find(f => f.jugadorId === 'b')!)).toBe('Reparto del 3')
  })

  it('el texto para compartir lleva la liquidación', () => {
    const t = tabla({ scores: UNO_CADA_UNO, marcas: CHIP_DE_ANA, c: { pozoPorJugador: 1000 } })
    const texto = textoParaCompartirElSkins(armarResultadoDelSkins(t, NOMBRES), t, 'Los Leones')
    expect(texto).toContain('Skins · Gross · Pozo $3.000 · Los Leones')
    expect(texto).toContain('Liquidación (skin a $750)')
    expect(texto).toContain('Ana: cobra $1.500 · gana $500')
  })
})

describe('puntos especiales del skins (regla de la Timba)', () => {
  const tarjetas = { a: { 1: 4, 2: 3, 3: 6 }, b: { 1: 4, 2: 3, 3: 5 }, c: { 1: 4, 2: 4, 3: 5 } }
  const validos = (marcas: MarcaPuntito[], noJuega: Record<string, number[]> = {}) =>
    especialesQueValenEnElSkins({ config: config(), hoyos: HOYOS, tarjetas, noJuega, marcas }).map(e => `${e.jugadorId}:${e.hoyo}:${e.puntitoId}`)

  it('greenie: uno por hoyo, el último entre quienes jugaron, solo en par 3 y con par o mejor', () => {
    expect(validos([{ jugadorId: 'a', hoyo: 2, puntitoId: 'green' }, { jugadorId: 'b', hoyo: 2, puntitoId: 'green' }])).toEqual(['b:2:green'])
    // Marcar a quien no jugó (retirado) no le quita el greenie al que sí lo ganó.
    expect(validos([{ jugadorId: 'a', hoyo: 2, puntitoId: 'green' }, { jugadorId: 'b', hoyo: 2, puntitoId: 'green' }], { b: [2, 3] })).toEqual(['a:2:green'])
    expect(validos([{ jugadorId: 'c', hoyo: 2, puntitoId: 'green' }])).toEqual([])
    expect(validos([{ jugadorId: 'a', hoyo: 1, puntitoId: 'green' }])).toEqual([])
  })

  it('sandy con par o mejor; chipingo siempre que jugó', () => {
    expect(validos([{ jugadorId: 'a', hoyo: 3, puntitoId: 'sandy' }, { jugadorId: 'b', hoyo: 3, puntitoId: 'sandy' }])).toEqual(['b:3:sandy'])
    expect(validos([{ jugadorId: 'a', hoyo: 3, puntitoId: 'chip' }, { jugadorId: 'x', hoyo: 3, puntitoId: 'chip' }])).toEqual(['a:3:chip'])
  })

  it('un especial válido suma un skin', () => {
    const sin = tabla({ scores: UNO_CADA_UNO })
    const con = tabla({ scores: UNO_CADA_UNO, marcas: CHIP_DE_ANA })
    expect(con.skinsCobrados - sin.skinsCobrados).toBe(1)
  })
})

describe('valorDelHoyoSkins sale del mismo resultado', () => {
  it('el hoyo siguiente a un empate vale 2', () => {
    const v = valorDelHoyoSkins({
      reglas: { config: config(), jugadorIds: IDS },
      contexto: { jugadores: IDS.map(id => ({ nombre: id, courseHandicap: null })), hoyos: HOYOS },
      scores: { a: { 1: 4 }, b: { 1: 4 }, c: { 1: 5 } }, fuera: {}, hoyo: 2,
    })
    expect(v).toEqual({ valor: 2, provisional: false })
  })
})

describe('detalleDeLaFila', () => {
  const f = (hoyosGanados: number[], especiales = 0, retiradoDesde: number | null = null) => ({ hoyosGanados, hoyosRepartidos: [], especiales, retiradoDesde })
  it('dice hoyo con la palabra (un «Ganó 4» al lado de «3 skins» se leía como cuatro skins)', () => {
    expect(detalleDeLaFila(f([4]))).toBe('Hoyo 4')
    expect(detalleDeLaFila(f([1, 4]))).toBe('Hoyos 1 y 4')
    expect(detalleDeLaFila(f([1, 4, 9]))).toBe('Hoyos 1, 4 y 9')
  })
  it('cuenta los puntos especiales y el retiro; sin nada, null', () => {
    expect(detalleDeLaFila(f([], 1))).toBe('1 punto especial')
    expect(detalleDeLaFila(f([2], 2))).toBe('Hoyo 2 · 2 puntos especiales')
    expect(detalleDeLaFila(f([3], 0, 7))).toBe('Hoyo 3 · se retiró en el 7')
    expect(detalleDeLaFila(f([], 0, 7))).toBe('Se retiró en el 7')
    expect(detalleDeLaFila(f([]))).toBeNull()
  })
})
