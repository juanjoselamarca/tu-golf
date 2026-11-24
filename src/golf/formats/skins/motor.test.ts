import { describe, it, expect } from 'vitest'
import {
  calcularSkins,
  golpesDelSkins,
  repartirPorRestoMayor,
  FUERA_DEL_HOYO as X,
  type EntradaSkins,
  type OpcionesSkins,
  type ScoreSkins,
} from './index'

/** 18 hoyos par 4, SI = número de hoyo (hoyo 1 el más difícil). */
const HOYOS_18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
const BASE: OpcionesSkins = { modo: 'gross', empateUltimoHoyo: 'repartir', validacion: false, pozoPorJugador: 0 }

/** scores por jugador como lista por hoyo (índice 0 = hoyo 1); `undefined` = sin anotar. */
function entrada(
  filas: Record<string, (ScoreSkins | undefined)[]>,
  opciones: Partial<OpcionesSkins> = {},
  extra: Partial<EntradaSkins> = {},
): EntradaSkins {
  const hoyos = extra.hoyos ?? HOYOS_18
  const jugadores = extra.jugadores ?? Object.keys(filas).map(id => ({ id, handicapDeJuego: 0 }))
  const scores: Record<string, Record<number, ScoreSkins | undefined>> = {}
  for (const [id, fila] of Object.entries(filas)) {
    const porHoyo: Record<number, ScoreSkins | undefined> = {}
    fila.forEach((s, i) => { if (s !== undefined) porHoyo[hoyos[i].numero] = s })
    scores[id] = porHoyo
  }
  return { opciones: { ...BASE, ...opciones }, jugadores, hoyos, scores, ...extra, }
}

const llenar = (n: number, v: ScoreSkins): ScoreSkins[] => Array.from({ length: n }, () => v)

describe('golpes: el más bajo juega a 0 (spec «Golpes»)', () => {
  it('PH 20 y PH 5: el de 20 recibe 15 golpes, en SI 1-15 (no en SI 1-2 y 6-18)', () => {
    const { golpes } = golpesDelSkins({
      opciones: { ...BASE, modo: 'neto' },
      jugadores: [{ id: 'a', handicapDeJuego: 20 }, { id: 'b', handicapDeJuego: 5 }],
      hoyos: HOYOS_18,
    })
    expect(Object.values(golpes.b).every(g => g === 0)).toBe(true)
    expect(HOYOS_18.map(h => golpes.a[h.numero])).toEqual([...llenar(15, 1), 0, 0, 0])
  })

  it('el mínimo es el del campo completo y se reparten dos vueltas si la diferencia pasa de 18', () => {
    const { golpes } = golpesDelSkins({
      opciones: { ...BASE, modo: 'neto' },
      jugadores: [{ id: 'a', handicapDeJuego: 22 }, { id: 'b', handicapDeJuego: 2 }, { id: 'c', handicapDeJuego: 10 }],
      hoyos: HOYOS_18,
    })
    expect(golpes.a[1]).toBe(2)
    expect(golpes.a[2]).toBe(2)
    expect(golpes.a[3]).toBe(1)
    expect(golpes.c[8]).toBe(1)
    expect(golpes.c[9]).toBe(0)
  })

  it('jugador plus como el más bajo: los demás reciben la diferencia completa', () => {
    const { golpes } = golpesDelSkins({
      opciones: { ...BASE, modo: 'neto' },
      jugadores: [{ id: 'plus', handicapDeJuego: -2 }, { id: 'b', handicapDeJuego: 3 }],
      hoyos: HOYOS_18,
    })
    expect(HOYOS_18.filter(h => golpes.b[h.numero] === 1).length).toBe(5)
    expect(Object.values(golpes.plus).every(g => g === 0)).toBe(true)
  })

  it('9 hoyos: reparte en escala de 9', () => {
    const hoyos9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
    const { golpes } = golpesDelSkins({
      opciones: { ...BASE, modo: 'neto' },
      jugadores: [{ id: 'a', handicapDeJuego: 11 }, { id: 'b', handicapDeJuego: 0 }],
      hoyos: hoyos9,
    })
    expect(golpes.a[1]).toBe(2)
    expect(golpes.a[2]).toBe(2)
    expect(golpes.a[3]).toBe(1)
  })

  it('neto con un hándicap desconocido: nadie recibe golpes y se informa para bloquear', () => {
    const r = golpesDelSkins({
      opciones: { ...BASE, modo: 'neto' },
      jugadores: [{ id: 'a', handicapDeJuego: 10 }, { id: 'b', handicapDeJuego: null }],
      hoyos: HOYOS_18,
    })
    expect(r.handicapsIncompletos).toEqual(['b'])
    expect(Object.values(r.golpes.a).every(g => g === 0)).toBe(true)
  })

  it('gross: nadie recibe golpes aunque tenga hándicap', () => {
    const { golpes } = golpesDelSkins({
      opciones: BASE,
      jugadores: [{ id: 'a', handicapDeJuego: 30 }, { id: 'b', handicapDeJuego: 0 }],
      hoyos: HOYOS_18,
    })
    expect(Object.values(golpes.a).every(g => g === 0)).toBe(true)
  })
})

describe('ganar, empatar y arrastrar', () => {
  it('gana solo el mejor score único; el empate arrastra y el hoyo siguiente vale 1 + arrastre', () => {
    const r = calcularSkins(entrada({
      a: [4, 4, 3, ...llenar(15, 5)],
      b: [4, 4, 5, ...llenar(15, 5)],
      c: [5, 4, 5, ...llenar(15, 5)],
    }))
    expect(r.hoyos[0]).toMatchObject({ estado: 'arrastre', valor: 1, lideres: ['a', 'b'] })
    expect(r.hoyos[1]).toMatchObject({ estado: 'arrastre', valor: 2 })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', valor: 3, ganador: 'a' })
    expect(r.hoyos[3]).toMatchObject({ estado: 'arrastre', valor: 1 })
    expect(r.jugadores.find(j => j.id === 'a')!.skins).toBe(8) // hoyo 3 (3) + reparto del 18: 15 entre 3
  })

  it('neto: el golpe de ventaja cambia el ganador', () => {
    const r = calcularSkins(entrada(
      { alto: [5, ...llenar(17, X)], bajo: [4, ...llenar(17, X)] },
      { modo: 'neto' },
      { jugadores: [{ id: 'alto', handicapDeJuego: 10 }, { id: 'bajo', handicapDeJuego: 2 }] },
    ))
    // hoyo 1 = SI 1: alto recibe 1 → neto 4 = empate con bajo
    expect(r.hoyos[0]).toMatchObject({ estado: 'arrastre', mejorNeto: 4, lideres: ['alto', 'bajo'] })
  })

  it('X nunca gana; con todos X el hoyo arrastra', () => {
    const r = calcularSkins(entrada({ a: [X, X, 4, ...llenar(15, 4)], b: [X, 6, 5, ...llenar(15, 4)] }))
    expect(r.hoyos[0]).toMatchObject({ estado: 'arrastre', lideres: [] })
    expect(r.hoyos[1]).toMatchObject({ estado: 'ganado', ganador: 'b', valor: 2 })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 1 })
  })
})

describe('hoyos a medio jugar (varios grupos)', () => {
  it('sin todos los scores: en disputa con el mejor hasta ahora, y lo que sigue es provisional', () => {
    const r = calcularSkins(entrada({
      a: [4, 3, 4, ...llenar(15, 4)],
      b: [4, 4, 4, ...llenar(15, 4)],
      c: [4],
    }))
    expect(r.hoyos[0]).toMatchObject({ estado: 'arrastre', valorProvisional: false })
    expect(r.hoyos[1]).toMatchObject({ estado: 'en_disputa', valor: 2, mejorNeto: 3, lideres: ['a'] })
    expect(r.hoyos[2]).toMatchObject({ estado: 'en_disputa', valorProvisional: true })
    expect(r.definitivo).toBe(false)
  })

  it('nadie anotó: por jugar', () => {
    const r = calcularSkins(entrada({ a: [], b: [] }))
    expect(r.hoyos.every(h => h.estado === 'por_jugar')).toBe(true)
    expect(r.definitivo).toBe(false)
  })

  it('valor provisional: un hoyo posterior ya completo no arrastra lo que no se resolvió', () => {
    const r = calcularSkins(entrada({
      a: [4, undefined, 3, ...llenar(15, 4)],
      b: [4, 4, 4, ...llenar(15, 4)],
    }))
    expect(r.hoyos[1].estado).toBe('en_disputa')
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 1, valorProvisional: true })
  })
})

describe('retiros (spec «Retiros»)', () => {
  it('el retirado conserva lo cobrado y desde su retiro no bloquea el cierre', () => {
    const r = calcularSkins(entrada(
      { a: [3, 5, ...llenar(16, 4)], b: [4, 4, ...llenar(16, 4)], c: [4, 4] },
      {},
      { jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0, retiradoDesdeHoyo: 3 }] },
    ))
    expect(r.hoyos[0]).toMatchObject({ estado: 'ganado', ganador: 'a' })
    expect(r.hoyos[2].estado).toBe('arrastre')
    expect(r.hoyos[2].netos.c).toBeNull()
    expect(r.definitivo).toBe(true)
  })
})

describe('validación (spec «Validación»: solo con arrastre, par neto o mejor en el siguiente)', () => {
  const op = { validacion: true }

  it('un skin simple (valor 1) se cobra directo, sin validar', () => {
    const r = calcularSkins(entrada({ a: [3, 7, ...llenar(16, 4)], b: [4, 4, ...llenar(16, 4)] }, op))
    expect(r.hoyos[0]).toMatchObject({ estado: 'ganado', ganador: 'a' })
  })

  it('con arrastre y par en el siguiente: valida', () => {
    const r = calcularSkins(entrada({ a: [4, 3, 4, ...llenar(15, 5)], b: [4, 4, 5, ...llenar(15, 5)] }, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 2 })
  })

  it('con arrastre y bogey en el siguiente: no valida y el valor se suma al hoyo de la validación', () => {
    const r = calcularSkins(entrada({ a: [4, 3, 5, ...llenar(15, 5)], b: [4, 4, 4, 4, ...llenar(14, 5)] }, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'arrastre', noValidado: true, valor: 2 })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'b', valor: 3 })
  })

  it('X en el hoyo siguiente: no valida', () => {
    const r = calcularSkins(entrada({ a: [4, 3, X, ...llenar(15, 5)], b: [4, 4, 6, 4, ...llenar(14, 5)] }, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'arrastre', noValidado: true })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'b', valor: 3 })
  })

  it('el ganador todavía no anota el siguiente: por validar y lo que sigue es provisional', () => {
    const r = calcularSkins(entrada({ a: [4, 3], b: [4, 4, 4] }, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'por_validar', lideres: ['a'] })
    expect(r.hoyos[2].valorProvisional).toBe(true)
  })

  it('el ganador se retira en el hoyo de la validación: no valida', () => {
    const r = calcularSkins(entrada(
      { a: [4, 3], b: [4, 4, 4, 4, ...llenar(14, 5)], c: [4, 4, 5, ...llenar(15, 5)] },
      op,
      { jugadores: [{ id: 'a', handicapDeJuego: 0, retiradoDesdeHoyo: 3 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0 }] },
    ))
    expect(r.hoyos[1]).toMatchObject({ estado: 'arrastre', noValidado: true })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'b', valor: 3 })
  })

  it('en el último hoyo no hay validación', () => {
    const r = calcularSkins(entrada({ a: [...llenar(17, 4), 3], b: [...llenar(17, 4), 4] }, op))
    expect(r.hoyos[17]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 18 })
  })

  it('par neto: el golpe de ventaja cuenta para validar', () => {
    const r = calcularSkins(entrada(
      { a: [4, 3, 5, ...llenar(15, 6)], b: [4, 4, 4, ...llenar(15, 6)] },
      { ...op, modo: 'neto' },
      { jugadores: [{ id: 'a', handicapDeJuego: 3 }, { id: 'b', handicapDeJuego: 0 }] },
    ))
    // a recibe golpe en SI 1-3: hoyo 1 neto 3 (gana solo, valor 1 → directo).
    expect(r.hoyos[0]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 1 })
  })
})

describe('último hoyo empatado (spec «Último hoyo empatado»)', () => {
  const todosEmpatan = { a: llenar(18, 4), b: llenar(18, 4), c: [...llenar(17, 4), 5] }

  it('repartir: el valor completo se divide entre los empatados del MEJOR score', () => {
    const r = calcularSkins(entrada(todosEmpatan, { pozoPorJugador: 10000 }))
    expect(r.hoyos[17]).toMatchObject({ estado: 'repartido', valor: 18, repartidoEntre: ['a', 'b'] })
    expect(r.jugadores.map(j => j.skins)).toEqual([9, 9, 0])
    expect(r.jugadores.map(j => j.cobra)).toEqual([15000, 15000, 0])
    expect(r.definitivo).toBe(true)
  })

  it('se pierde: nadie cobra y, sin otros skins, se devuelve el pozo', () => {
    const r = calcularSkins(entrada(todosEmpatan, { empateUltimoHoyo: 'se_pierde', pozoPorJugador: 10000 }))
    expect(r.hoyos[17].estado).toBe('perdido')
    expect(r.devolucion).toBe(true)
    expect(r.jugadores.map(j => j.cobra)).toEqual([10000, 10000, 10000])
    expect(r.jugadores.every(j => j.neto === 0)).toBe(true)
  })

  it('último hoyo con todos X: se pierde aunque la regla sea repartir', () => {
    const r = calcularSkins(entrada({ a: [3, ...llenar(16, 4), X], b: [4, ...llenar(16, 4), X] }))
    expect(r.hoyos[17].estado).toBe('perdido')
    expect(r.jugadores[0].skins).toBe(1)
  })

  it('reparto con fracción: 3 skins entre 2 = 1,5 c/u y la plata cuadra exacta', () => {
    const r = calcularSkins(entrada(
      { a: [3, ...llenar(15, 4), 4, 4], b: [4, ...llenar(15, 4), 4, 4], c: [5, ...llenar(15, 4), 4, 5] },
      { pozoPorJugador: 10000 },
    ))
    // hoyo 1 a; hoyos 2-18 empatan → hoyo 18 vale 17, a y b empatan → 8,5 c/u
    expect(r.jugadores.map(j => j.skins)).toEqual([9.5, 8.5, 0])
    expect(r.jugadores.reduce((s, j) => s + j.cobra, 0)).toBe(30000)
  })
})

describe('pozo y liquidación (spec «Pozo y liquidación»)', () => {
  it('el pozo se divide por skins cobrados y cada uno ve su neto', () => {
    const r = calcularSkins(entrada(
      { a: [3, 3, 3, ...llenar(15, 5)], b: [4, 4, 4, 4, ...llenar(14, 5)], c: [5, 5, 5, 5, ...llenar(14, 4)] },
      { pozoPorJugador: 30000 },
    ))
    // a: hoyos 1-3; b: hoyo 4; c: hoyos 5-18 → 3 + 1 + 14 = 18 skins, pozo 90.000 → 5.000 c/u
    expect(r.skinsCobrados).toBe(18)
    expect(r.valorSkin).toBe(5000)
    expect(r.jugadores.map(j => [j.skins, j.cobra, j.neto])).toEqual([[3, 15000, -15000], [1, 5000, -25000], [14, 70000, 40000]])
  })

  it('resto mayor: la suma da exactamente el pozo', () => {
    expect(repartirPorRestoMayor(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(repartirPorRestoMayor(100, [2, 1])).toEqual([67, 33])
    expect(repartirPorRestoMayor(0, [1, 2])).toEqual([0, 0])
    expect(repartirPorRestoMayor(50, [0, 0])).toEqual([0, 0])
  })

  it('los retirados también pusieron', () => {
    const r = calcularSkins(entrada(
      { a: [3, ...llenar(17, 4)], b: [4, ...llenar(16, 4), 5], c: [4] },
      { pozoPorJugador: 20000 },
      { jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0, retiradoDesdeHoyo: 2 }] },
    ))
    expect(r.pozoTotal).toBe(60000)
    expect(r.jugadores.find(j => j.id === 'c')!.cobra).toBe(0)
  })

  it('durante la ronda la liquidación no es definitiva', () => {
    const r = calcularSkins(entrada({ a: [3], b: [4] }, { pozoPorJugador: 10000 }))
    expect(r.definitivo).toBe(false)
    expect(r.jugadores[0].cobra).toBe(20000)
    expect(r.devolucion).toBe(false)
  })

  it('sin pozo: solo skins, sin plata', () => {
    const r = calcularSkins(entrada({ a: [3, ...llenar(17, 4)], b: [4, ...llenar(17, 5)] }))
    expect(r.valorSkin).toBeNull()
    expect(r.jugadores.every(j => j.cobra === 0 && j.neto === 0)).toBe(true)
  })

  it('cada punto especial válido vale 1 skin y entra al reparto', () => {
    const r = calcularSkins(entrada(
      { a: [3, ...llenar(17, 4)], b: [4, ...llenar(16, 4), 5] },
      { pozoPorJugador: 10000 },
      { especialesValidos: [{ jugadorId: 'b', hoyo: 5 }] },
    ))
    // a: hoyo 1 (1) + hoyo 18 (17 acumulados) = 18; b: 1 especial → 19 skins
    expect(r.jugadores.map(j => j.skins)).toEqual([18, 1])
    expect(r.jugadores.reduce((s, j) => s + j.cobra, 0)).toBe(20000)
  })
})
