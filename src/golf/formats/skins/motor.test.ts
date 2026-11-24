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
/** Hoyos que no juega quien se retira antes del hoyo `n` (ronda que sale por el 1, 18 hoyos). */
const desde = (n: number) => Array.from({ length: 19 - n }, (_, i) => n + i)

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
    expect(r.bloqueos.sinHandicap).toEqual(['b'])
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
      { jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0, hoyosQueNoJuega: desde(3) }] },
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
      { jugadores: [{ id: 'a', handicapDeJuego: 0, hoyosQueNoJuega: desde(3) }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0 }] },
    ))
    expect(r.hoyos[1]).toMatchObject({ estado: 'arrastre', noValidado: true })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'b', valor: 3 })
  })

  it('en el último hoyo no hay validación', () => {
    const r = calcularSkins(entrada({ a: [...llenar(17, 4), 3], b: [...llenar(17, 4), 4] }, op))
    expect(r.hoyos[17]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 18 })
  })

  it('par neto: el golpe de ventaja cuenta para validar', () => {
    // a recibe golpe en SI 1-3. Hoyo 1: 5-1=4 vs 4, empate. Hoyo 2: 4-1=3 gana con arrastre (vale 2).
    // Hoyo 3: a hace bogey gross (5) pero par neto (4): valida.
    const r = calcularSkins(entrada(
      { a: [5, 4, 5, ...llenar(15, 6)], b: [4, 4, 4, ...llenar(15, 6)] },
      { ...op, modo: 'neto' },
      { jugadores: [{ id: 'a', handicapDeJuego: 3 }, { id: 'b', handicapDeJuego: 0 }] },
    ))
    expect(r.hoyos[0]).toMatchObject({ estado: 'arrastre' })
    expect(r.hoyos[1]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 2 })
  })

  it('cadena: no valida, el mismo jugador gana el hoyo de la validación y tiene que revalidar', () => {
    // h1 empate; h2 a gana (vale 2) y hace 5 en h3 → no valida; h3 vale 3 y lo gana a solo (5 vs 6), revalida en h4 con par.
    const r = calcularSkins(entrada({ a: [4, 3, 5, 4, ...llenar(14, 5)], b: [4, 4, 6, 5, ...llenar(14, 5)] }, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'arrastre', noValidado: true, valor: 2 })
    expect(r.hoyos[2]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 3 })
  })

  it('no valida en el penúltimo y el último termina repartido: el reparto incluye lo arrastrado', () => {
    const a = [...llenar(16, 4), 3, 5]
    const b = [...llenar(16, 4), 4, 5]
    const r = calcularSkins(entrada({ a, b }, op))
    expect(r.hoyos[16]).toMatchObject({ estado: 'arrastre', noValidado: true, valor: 17 })
    expect(r.hoyos[17]).toMatchObject({ estado: 'repartido', valor: 18, repartidoEntre: ['a', 'b'] })
    expect(r.jugadores.map(j => j.skins)).toEqual([9, 9])
  })

  it('con un hoyo anterior abierto, el ganado sin validar queda por validar y no se acredita (shotgun)', () => {
    // h1 en disputa (c no anotó). h2: a gana solo (vale «1» provisional) y hace bogey en h3.
    const parcial = { a: [4, 3, 5, ...llenar(15, 4)], b: [4, 4, 4, ...llenar(15, 4)], c: [undefined, 4, 4, ...llenar(15, 4)] }
    const r = calcularSkins(entrada(parcial, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'por_validar', valorProvisional: true, ganador: null })
    // h1 cierra empatado: h2 vale 2, a no validó → arrastre. Nunca mostró un ganado que después se retiró.
    const cerrado = calcularSkins(entrada({ ...parcial, c: [4, 4, 4, ...llenar(15, 4)] }, op))
    expect(cerrado.hoyos[1]).toMatchObject({ estado: 'arrastre', noValidado: true, valor: 2 })
    // h1 cierra con ganador: h2 vale 1, sin validación → ganado.
    const otro = calcularSkins(entrada({ ...parcial, c: [3, 4, 4, ...llenar(15, 4)] }, op))
    expect(otro.hoyos[1]).toMatchObject({ estado: 'ganado', ganador: 'a', valor: 1 })
  })

  it('con un hoyo anterior abierto, el que valida queda ganado firme', () => {
    const r = calcularSkins(entrada({ a: [4, 3, 4, ...llenar(15, 4)], b: [4, 4, 5, ...llenar(15, 4)], c: [undefined, 4, 5, ...llenar(15, 4)] }, op))
    expect(r.hoyos[1]).toMatchObject({ estado: 'ganado', ganador: 'a', valorProvisional: true })
    expect(r.hoyos[2].valorProvisional).toBe(false)
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
      { jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0, hoyosQueNoJuega: desde(2) }] },
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
      { especialesValidos: [{ jugadorId: 'b', hoyo: 5, puntitoId: 's' }] },
    ))
    // a: hoyo 1 (1) + hoyo 18 (17 acumulados) = 18; b: 1 especial → 19 skins
    expect(r.jugadores.map(j => j.skins)).toEqual([18, 1])
    expect(r.jugadores.reduce((s, j) => s + j.cobra, 0)).toBe(20000)
  })
})

describe('orden de juego y retiros por conjunto de hoyos (revisión Fable P1-1)', () => {
  const porNumero = (n: number) => HOYOS_18[n - 1]
  const desde10 = [...Array.from({ length: 9 }, (_, i) => porNumero(10 + i)), ...Array.from({ length: 9 }, (_, i) => porNumero(1 + i))]

  it('Timba que sale por el 10: el arrastre sigue el orden de juego y el último es el 9', () => {
    const r = calcularSkins({
      opciones: BASE,
      jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }],
      hoyos: desde10,
      scores: {
        a: Object.fromEntries(HOYOS_18.map(h => [h.numero, h.numero === 9 ? 3 : 4])),
        b: Object.fromEntries(HOYOS_18.map(h => [h.numero, 4])),
      },
    })
    expect(r.hoyos.map(h => h.numero)).toEqual(desde10.map(h => h.numero))
    expect(r.hoyos[17]).toMatchObject({ numero: 9, estado: 'ganado', ganador: 'a', valor: 18 })
  })

  it('Timba que sale por el 10 y uno se retira después del 2: conserva lo que ganó en el 10-18', () => {
    const a: Record<number, ScoreSkins> = {}
    for (const n of [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2]) a[n] = n === 10 ? 3 : 5
    const r = calcularSkins({
      opciones: BASE,
      jugadores: [{ id: 'a', handicapDeJuego: 0, hoyosQueNoJuega: [3, 4, 5, 6, 7, 8, 9] }, { id: 'b', handicapDeJuego: 0 }],
      hoyos: desde10,
      scores: { a, b: Object.fromEntries(HOYOS_18.map(h => [h.numero, 4])) },
    })
    expect(r.hoyos[0]).toMatchObject({ numero: 10, estado: 'ganado', ganador: 'a' })
    expect(r.jugadores[0].skins).toBe(1)
    expect(r.definitivo).toBe(true)
  })

  it('shotgun: un grupo que salió del 10 y se retira después del 14 no deja hoyos en disputa para siempre', () => {
    const noJuega = [15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const c: Record<number, ScoreSkins> = { 10: 4, 11: 4, 12: 4, 13: 4, 14: 4 }
    const r = calcularSkins({
      opciones: BASE,
      jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0, hoyosQueNoJuega: noJuega }],
      hoyos: HOYOS_18,
      scores: { a: Object.fromEntries(HOYOS_18.map(h => [h.numero, 3])), b: Object.fromEntries(HOYOS_18.map(h => [h.numero, 4])), c },
    })
    expect(r.definitivo).toBe(true)
    expect(r.jugadores[0].skins).toBe(18)
  })

  it('no se presentó (no juega ningún hoyo): igual puso al pozo y no bloquea', () => {
    const r = calcularSkins(entrada(
      { a: [3, ...llenar(17, 4)], b: [4, ...llenar(17, 5)], c: [] },
      { pozoPorJugador: 10000 },
      { jugadores: [{ id: 'a', handicapDeJuego: 0 }, { id: 'b', handicapDeJuego: 0 }, { id: 'c', handicapDeJuego: 0, hoyosQueNoJuega: desde(1) }] },
    ))
    expect(r.definitivo).toBe(true)
    expect(r.jugadores.map(j => j.cobra)).toEqual([30000, 0, 0])
  })

  it('todos se retiran a mitad de ronda: los hoyos sin nadie se pierden y lo ganado se cobra', () => {
    const r = calcularSkins(entrada(
      { a: [3, 4], b: [4, 4] },
      { pozoPorJugador: 10000 },
      { jugadores: [{ id: 'a', handicapDeJuego: 0, hoyosQueNoJuega: desde(3) }, { id: 'b', handicapDeJuego: 0, hoyosQueNoJuega: desde(3) }] },
    ))
    expect(r.hoyos.slice(2).every(h => h.estado === 'perdido')).toBe(true)
    expect(r.definitivo).toBe(true)
    expect(r.jugadores.map(j => j.cobra)).toEqual([20000, 0])
  })
})

describe('bloqueos: sin datos confiables no hay plata (revisión Fable P2-2/3/4)', () => {
  it('neto con un hándicap desconocido: no liquida ni es definitivo', () => {
    const r = calcularSkins(entrada(
      { a: [3, ...llenar(17, 4)], b: [4, ...llenar(17, 5)] },
      { modo: 'neto', pozoPorJugador: 10000 },
      { jugadores: [{ id: 'a', handicapDeJuego: 5 }, { id: 'b', handicapDeJuego: null }] },
    ))
    expect(r.liquidable).toBe(false)
    expect(r.definitivo).toBe(false)
    expect(r.jugadores.every(j => j.cobra === 0 && j.neto === 0)).toBe(true)
  })

  it('SI que no es permutación 1..N (SI de 18 en una ronda de 9): bloquea en neto', () => {
    const hoyos9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, si: 2 * i + 1 }))
    const r = calcularSkins(entrada({ a: llenar(9, 4), b: llenar(9, 4) }, { modo: 'neto' }, { hoyos: hoyos9, jugadores: [{ id: 'a', handicapDeJuego: 5 }, { id: 'b', handicapDeJuego: 0 }] }))
    expect(r.bloqueos.indiceDificultadInvalido).toBe(true)
    expect(r.liquidable).toBe(false)
    // En gross el SI no importa.
    expect(calcularSkins(entrada({ a: llenar(9, 4), b: llenar(9, 4) }, {}, { hoyos: hoyos9 })).liquidable).toBe(true)
  })

  it('diferencia de golpes sobre 3 por hoyo (9 hoyos, plus contra 28): bloquea en vez de perder golpes en silencio', () => {
    const hoyos9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
    const r = calcularSkins(entrada({ a: llenar(9, 4), b: llenar(9, 4) }, { modo: 'neto' }, { hoyos: hoyos9, jugadores: [{ id: 'a', handicapDeJuego: -2 }, { id: 'b', handicapDeJuego: 28 }] }))
    expect(r.bloqueos.golpesSobreElTope).toEqual(['b'])
    expect(r.liquidable).toBe(false)
  })

  it('pozo NaN: se juega sin plata en vez de devolver NaN', () => {
    const r = calcularSkins(entrada({ a: [3, ...llenar(17, 4)], b: [4, ...llenar(17, 5)] }, { pozoPorJugador: Number.NaN }))
    expect(r.pozoTotal).toBe(0)
    expect(r.jugadores.every(j => j.cobra === 0 && j.neto === 0)).toBe(true)
  })

  it('con pozo y nadie cobró aún: neto 0 (no «todos pierden lo que pusieron»)', () => {
    const r = calcularSkins(entrada({ a: [4], b: [4] }, { pozoPorJugador: 10000 }))
    expect(r.valorSkin).toBeNull()
    expect(r.jugadores.every(j => j.cobra === 0 && j.neto === 0)).toBe(true)
  })
})

describe('puntos especiales en el reparto', () => {
  it('repetidos o de alguien que no está en la ronda no suman', () => {
    const r = calcularSkins(entrada(
      { a: [3, ...llenar(17, 4)], b: [4, ...llenar(16, 4), 5] },
      {},
      { especialesValidos: [
        { jugadorId: 'b', hoyo: 5, puntitoId: 's' }, { jugadorId: 'b', hoyo: 5, puntitoId: 's' },
        { jugadorId: 'b', hoyo: 5, puntitoId: 'c' }, { jugadorId: 'zz', hoyo: 5, puntitoId: 's' },
      ] },
    ))
    expect(r.jugadores.map(j => j.skins)).toEqual([18, 2])
  })

  it('reparto del último entre 3 con especiales: fracciones exactas y la plata cuadra con resto', () => {
    const r = calcularSkins(entrada(
      { a: llenar(18, 4), b: llenar(18, 4), c: llenar(18, 4), d: llenar(18, 5) },
      { pozoPorJugador: 10000 },
      { especialesValidos: [{ jugadorId: 'd', hoyo: 3, puntitoId: 'g' }] },
    ))
    // 18 skins entre a, b, c = 6 c/u; d 1 especial → 19 skins, 40.000 / 19 no es entero.
    expect(r.jugadores.map(j => j.skins)).toEqual([6, 6, 6, 1])
    expect(r.jugadores.reduce((s, j) => s + j.cobra, 0)).toBe(40000)
    expect(r.jugadores.map(j => j.cobra)).toEqual([12632, 12632, 12631, 2105])
  })
})
