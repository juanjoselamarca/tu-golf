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
  it('marca que cuenta, marca que no cuenta con la razón del motor, y sin marcar', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 4), jugadorIds: ['a', 'b', 'c'], hoyo: 4, marcas, enEspera: [{ jugadorId: 'b', hoyo: 4, puntitoId: 's' }],
      resultadoDelHoyo: hoyo([
        { jugadorId: 'a', puntitoId: 's', tipo: 'sandy', puntos: 1, cuenta: true },
        { jugadorId: 'b', puntitoId: 's', tipo: 'sandy', puntos: 0, cuenta: false, razon: 'El sandy cuenta solo con par o mejor' },
      ]),
    })
    expect(r[0].nombre).toBe('Sandy')
    expect(r[0].jugadores).toEqual([
      { jugadorId: 'a', marcado: true, enEspera: false, noCuenta: null },
      { jugadorId: 'b', marcado: true, enEspera: true, noCuenta: 'El sandy cuenta solo con par o mejor' },
      { jugadorId: 'c', marcado: false, enEspera: false, noCuenta: null },
    ])
    expect(r[1].nombre).toBe('Árbol')
  })
  it('hoyo pendiente: la marca se ve marcada, todavía sin juicio del motor', () => {
    const r = marcasDelHoyo({
      puntitos: puntitosMarcables(config, 4), jugadorIds: ['a'], hoyo: 4, marcas, enEspera: [], resultadoDelHoyo: hoyo([], 'pendiente'),
    })
    expect(r[0].jugadores[0]).toEqual({ jugadorId: 'a', marcado: true, enEspera: false, noCuenta: null })
  })
})
