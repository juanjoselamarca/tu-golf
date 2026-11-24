import { describe, it, expect } from 'vitest'
import { crearConfigDePlantilla, type ConfigJuego, type ResultadoHoyoDelJuego } from '@/golf/formats/personalizado'
import { marcasDelHoyo, marcasVigentes, puntitosMarcables } from './marcas-de-la-timba'

const GREENIE = { id: 'g', tipo: 'greenie', valor: 1, destino: 'individual', activo: true } as const
const SANDY = { id: 's', tipo: 'sandy', valor: 1, destino: 'individual', activo: true } as const
const BIRDIE = { id: 'b', tipo: 'birdie', valor: 1, destino: 'individual', activo: true } as const
const CHIPINGO_OFF = { id: 'c', tipo: 'chipingo', valor: 1, destino: 'individual', activo: false } as const
const PROPIO = { id: 'x', tipo: 'propio', nombre: 'Árbol', valor: 2, destino: 'individual', activo: true } as const
const config: ConfigJuego = { ...crearConfigDePlantilla('dos_cero_dos'), puntitos: [BIRDIE, SANDY, GREENIE, CHIPINGO_OFF, PROPIO] }
const esGreenie = (id: string) => id === 'g'

describe('puntitosMarcables', () => {
  it('solo los manuales activos; el birdie es automático y el greenie solo en par 3', () => {
    expect(puntitosMarcables(config, 4).map(p => p.id)).toEqual(['s', 'x'])
    expect(puntitosMarcables(config, 3).map(p => p.id)).toEqual(['s', 'g', 'x'])
  })
})

describe('marcasVigentes — lo guardado más lo que espera envío en el teléfono', () => {
  const servidor = [{ jugadorId: 'a', hoyo: 3, puntitoId: 'g' }, { jugadorId: 'b', hoyo: 4, puntitoId: 's' }]
  it('sin pendientes, las del servidor', () => {
    expect(marcasVigentes(servidor, [], esGreenie)).toEqual(servidor)
  })
  it('una pendiente de quitar la saca; una de marcar la agrega sin duplicar', () => {
    const r = marcasVigentes(servidor, [
      { jugadorId: 'b', hoyo: 4, puntitoId: 's', marcar: false },
      { jugadorId: 'c', hoyo: 4, puntitoId: 's', marcar: true },
      { jugadorId: 'c', hoyo: 4, puntitoId: 's', marcar: true },
    ], esGreenie)
    expect(r).toEqual([{ jugadorId: 'a', hoyo: 3, puntitoId: 'g' }, { jugadorId: 'c', hoyo: 4, puntitoId: 's' }])
  })
  it('greenie: uno por hoyo; marcar a otro reemplaza al guardado', () => {
    const r = marcasVigentes(servidor, [{ jugadorId: 'c', hoyo: 3, puntitoId: 'g', marcar: true }], esGreenie)
    expect(r.filter(m => m.puntitoId === 'g')).toEqual([{ jugadorId: 'c', hoyo: 3, puntitoId: 'g' }])
  })
  it('greenie: quitarlo los borra todos (la marca anterior no revive)', () => {
    const r = marcasVigentes(servidor, [{ jugadorId: 'a', hoyo: 3, puntitoId: 'g', marcar: false }], esGreenie)
    expect(r.filter(m => m.puntitoId === 'g')).toEqual([])
  })
})

describe('marcasDelHoyo — qué ve el scorer en cada botón', () => {
  const hoyo = (especiales: ResultadoHoyoDelJuego['especiales'], estado: 'puntuado' | 'pendiente' = 'puntuado') =>
    ({ numero: 4, estado, especiales }) as unknown as ResultadoHoyoDelJuego
  const marcas = [{ jugadorId: 'a', hoyo: 4, puntitoId: 's' }, { jugadorId: 'b', hoyo: 4, puntitoId: 's' }]
  it('marca que cuenta, marca que no cuenta con su razón, y sin marcar', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 4), jugadorIds: ['a', 'b', 'c'], hoyo: 4, marcas, enEspera: [{ jugadorId: 'b', hoyo: 4, puntitoId: 's' }],
      golpes: { a: 4, b: 5, c: 3 }, par: 4, retirados: new Set(),
      resultadoDelHoyo: hoyo([
        { jugadorId: 'a', puntitoId: 's', tipo: 'sandy', puntos: 1, cuenta: true },
        { jugadorId: 'b', puntitoId: 's', tipo: 'sandy', puntos: 0, cuenta: false, razon: 'El sandy cuenta solo con par o mejor' },
      ]),
    })
    expect(r[0].nombre).toBe('Sandy')
    expect(r[0].jugadores).toEqual([
      { jugadorId: 'a', visible: true, marcado: true, enEspera: false, noCuenta: null },
      { jugadorId: 'b', visible: true, marcado: true, enEspera: true, noCuenta: 'El sandy cuenta solo con par o mejor' },
      { jugadorId: 'c', visible: true, marcado: false, enEspera: false, noCuenta: null },
    ])
    expect(r[1].nombre).toBe('Árbol')
  })
  it('hoyo pendiente sin score: la marca se ve marcada, todavía sin juicio', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 4), jugadorIds: ['a'], hoyo: 4, marcas, enEspera: [], resultadoDelHoyo: hoyo([], 'pendiente'),
      golpes: {}, par: 4, retirados: new Set(),
    })
    expect(r[0].jugadores[0]).toEqual({ jugadorId: 'a', visible: true, marcado: true, enEspera: false, noCuenta: null })
  })
  it('marcado con score sobre par y el motor todavía sin juzgar (hoyo incompleto o sin señal): avisa igual', () => {
    for (const resultadoDelHoyo of [hoyo([], 'pendiente'), null]) {
      const r = marcasDelHoyo({
        puntitos: puntitosMarcables(config, 4), jugadorIds: ['a'], hoyo: 4, marcas, enEspera: [], resultadoDelHoyo,
        golpes: { a: 5 }, par: 4, retirados: new Set(),
      })
      expect(r[0].jugadores[0].noCuenta).toBe('El sandy cuenta solo con par o mejor')
    }
  })
  it('score corregido a par con el motor atrasado (todavía dice que no): el teléfono manda, ya cuenta', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 4), jugadorIds: ['a'], hoyo: 4, marcas, enEspera: [], golpes: { a: 4 }, par: 4, retirados: new Set(),
      resultadoDelHoyo: hoyo([{ jugadorId: 'a', puntitoId: 's', tipo: 'sandy', puntos: 0, cuenta: false, razon: 'El sandy cuenta solo con par o mejor' }]),
    })
    expect(r[0].jugadores[0].noCuenta).toBeNull()
  })
  it('sin score anotado manda el motor', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 4), jugadorIds: ['a'], hoyo: 4, marcas, enEspera: [], golpes: {}, par: 4, retirados: new Set(),
      resultadoDelHoyo: hoyo([{ jugadorId: 'a', puntitoId: 's', tipo: 'sandy', puntos: 0, cuenta: false, razon: 'No jugó el hoyo' }]),
    })
    expect(r[0].jugadores[0].noCuenta).toBe('No jugó el hoyo')
  })
  it('par desconocido: no se juzga en el teléfono (un greenie no pasa a «solo en par 3» por no saber el par)', () => {
    const r = marcasDelHoyo({
      puntitos: [GREENIE], jugadorIds: ['a'], hoyo: 4, marcas: [{ jugadorId: 'a', hoyo: 4, puntitoId: 'g' }], enEspera: [],
      golpes: { a: 3 }, par: undefined, retirados: new Set(), resultadoDelHoyo: null,
    })
    expect(r[0].jugadores[0].noCuenta).toBeNull()
  })
  it('chipingo marcado antes de anotar el score: no se avisa nada (es legítimo)', () => {
    const chip = { id: 'c', tipo: 'chipingo', valor: 1, destino: 'individual', activo: true } as const
    const r = marcasDelHoyo({
      puntitos: [chip], jugadorIds: ['a'], hoyo: 4, marcas: [{ jugadorId: 'a', hoyo: 4, puntitoId: 'c' }], enEspera: [],
      resultadoDelHoyo: null, golpes: {}, par: 4, retirados: new Set(),
    })
    expect(r[0].jugadores[0].noCuenta).toBeNull()
  })
  it('greenie: nota "uno por hoyo"; los demás sin nota', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 3), jugadorIds: ['a'], hoyo: 4, marcas: [], enEspera: [], resultadoDelHoyo: null,
      golpes: {}, par: 3, retirados: new Set(),
    })
    expect(Object.fromEntries(r.map(g => [g.puntito.id, g.nota]))).toEqual({ s: null, g: 'uno por hoyo', x: null })
  })
})

describe('marcasDelHoyo — solo se ofrece lo que puede contar', () => {
  const SIN_MARCAS: never[] = []
  const grupos = (input: { par: number; golpes: Record<string, number | undefined>; marcas?: { jugadorId: string; hoyo: number; puntitoId: string }[]; retirados?: string[] }) => {
    const c: ConfigJuego = { ...config, puntitos: [SANDY, GREENIE, { ...CHIPINGO_OFF, activo: true }, PROPIO] }
    return marcasDelHoyo({
      puntitos: puntitosMarcables(c, input.par), jugadorIds: ['a', 'b', 'c', 'd'], hoyo: 4,
      marcas: input.marcas ?? SIN_MARCAS, enEspera: [], resultadoDelHoyo: null,
      golpes: input.golpes, par: input.par, retirados: new Set(input.retirados ?? []),
    })
  }
  const visibles = (input: Parameters<typeof grupos>[0]) =>
    Object.fromEntries(grupos(input).map(g => [g.puntito.id, g.jugadores.filter(j => j.visible).map(j => j.jugadorId)]))
  it('sandy: sin score se ofrece (el par se rellena al pasar de hoyo); bogey no; par y birdie sí', () => {
    expect(visibles({ par: 4, golpes: { a: undefined, b: 5, c: 4, d: 3 } }).s).toEqual(['a', 'c', 'd'])
  })
  it('los botones mantienen su lugar: el oculto queda como hueco, en el orden de los jugadores', () => {
    const g = grupos({ par: 4, golpes: { a: undefined, b: 5, c: 4, d: 3 } })[0]
    expect(g.jugadores.map(j => [j.jugadorId, j.visible])).toEqual([['a', true], ['b', false], ['c', true], ['d', true]])
  })
  it('chipingo y propios: a todos, aunque no tengan score todavía', () => {
    const r = visibles({ par: 4, golpes: { a: undefined, b: 7 } })
    expect(r.c).toEqual(['a', 'b', 'c', 'd'])
    expect(r.x).toEqual(['a', 'b', 'c', 'd'])
  })
  it('todos anotaron sobre par: el sandy viene sin botones y con la pista', () => {
    const s = grupos({ par: 4, golpes: { a: 5, b: 6, c: 5, d: 7 } })[0]
    expect(s.jugadores.some(j => j.visible)).toBe(false)
    expect(s.pista).toBe('Nadie en par o mejor')
  })
  it('con alguien sin anotar todavía no hay pista: puede haber hecho par', () => {
    expect(grupos({ par: 4, golpes: { a: 5, b: 6, c: 5 } })[0].pista).toBeNull()
  })
  it('greenie en par 4: no se ofrece a nadie, ni con birdie', () => {
    expect(visibles({ par: 4, golpes: { a: 3, b: 3, c: 3, d: 3 } }).g).toBeUndefined()
  })
  it('greenie en par 3: con par o mejor o sin score; bogey no', () => {
    expect(visibles({ par: 3, golpes: { a: 2, b: 3, c: 4 } }).g).toEqual(['a', 'b', 'd'])
  })
  it('retirado: no se le ofrece nada', () => {
    const r = visibles({ par: 4, golpes: { a: 4, b: 4 }, retirados: ['a'] })
    expect(r.s).toEqual(['b', 'c', 'd'])
    expect(r.c).toEqual(['b', 'c', 'd'])
  })
  it('todos retirados: el chipingo no tiene botones ni pista', () => {
    const c = grupos({ par: 4, golpes: {}, retirados: ['a', 'b', 'c', 'd'] })[1]
    expect(c.jugadores.some(j => j.visible)).toBe(false)
    expect(c.pista).toBeNull()
  })
  it('marcado que pasa a bogey: su botón sigue, marcado y con el "no cuenta" (la marca nunca se esconde)', () => {
    const resultado = { numero: 4, estado: 'puntuado', especiales: [
      { jugadorId: 'a', puntitoId: 's', tipo: 'sandy', puntos: 0, cuenta: false, razon: 'El sandy cuenta solo con par o mejor' },
    ] } as unknown as ResultadoHoyoDelJuego
    const c: ConfigJuego = { ...config, puntitos: [SANDY] }
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(c, 4), jugadorIds: ['a', 'b'], hoyo: 4,
      marcas: [{ jugadorId: 'a', hoyo: 4, puntitoId: 's' }], enEspera: [], resultadoDelHoyo: resultado,
      golpes: { a: 5, b: 6 }, par: 4, retirados: new Set(),
    })
    expect(r[0].jugadores).toEqual([
      { jugadorId: 'a', visible: true, marcado: true, enEspera: false, noCuenta: 'El sandy cuenta solo con par o mejor' },
      { jugadorId: 'b', visible: false, marcado: false, enEspera: false, noCuenta: null },
    ])
    expect(r[0].pista).toBeNull()
  })
  it('retirado con una marca puesta: se sigue viendo, con «no jugó», para poder quitarla', () => {
    const marcas = [{ jugadorId: 'a', hoyo: 4, puntitoId: 's' }, { jugadorId: 'a', hoyo: 4, puntitoId: 'c' }]
    const r = grupos({ par: 4, golpes: { a: 4 }, retirados: ['a'], marcas })
    expect(r[0].jugadores[0]).toEqual({ jugadorId: 'a', visible: true, marcado: true, enEspera: false, noCuenta: 'No jugó el hoyo' })
    expect(r[1].jugadores[0].noCuenta).toBe('No jugó el hoyo')
  })
})
