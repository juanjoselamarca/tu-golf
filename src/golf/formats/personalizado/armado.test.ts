import { describe, it, expect } from 'vitest'
import {
  alternarPuntito, cambiarDestinoPuntitos, cambiarDueloPareja, cambiarExtremosPorPuesto, cambiarPerdedorResta, cambiarRepartoPareja,
  cambiarUnidad, extremosPorPuesto,
} from './armado'
import { crearConfigDePlantilla } from './plantillas'
import { configJuegoSchema } from './config'

const fijo = () => 0.3

describe('armado de la Timba', () => {
  it('cambiarUnidad: a parejas parte de los duelos de La Colombiana y borra parejas/sorteo; a individual, del 2-0-2', () => {
    const total = crearConfigDePlantilla('personalizado_total', fijo)
    const parejas = cambiarUnidad(total, 'parejas_rotativas')
    expect(parejas.duelos.map(d => d.tipo)).toEqual(['mejor_bola', 'peor_bola', 'suma'])
    expect(parejas.sorteo).toBeUndefined()
    const fijas = cambiarUnidad(parejas, 'parejas_fijas')
    expect(fijas.duelos).toEqual(parejas.duelos)
    expect(cambiarUnidad(fijas, 'individual').duelos).toEqual(crearConfigDePlantilla('dos_cero_dos').duelos)
    expect(cambiarUnidad(crearConfigDePlantilla('colombiana', fijo), 'parejas_rotativas').sorteo).toBeUndefined()
    for (const c of [parejas, fijas]) expect(configJuegoSchema.safeParse(c).success).toBe(true)
  })

  it('extremos por puesto: lee y escribe las tablas de 3 y 4 sin −0', () => {
    const subterror = crearConfigDePlantilla('subterror')
    expect(extremosPorPuesto(subterror)).toEqual({ mejor: 0, peor: 1 })
    expect(extremosPorPuesto(crearConfigDePlantilla('dos_cero_dos'))).toEqual({ mejor: 2, peor: 2 })
    const c = cambiarExtremosPorPuesto(subterror, { mejor: 3, peor: 0 })
    expect(c.duelos[0]).toEqual({ tipo: 'por_puesto', tablas: { '3': [3, 0, 0], '4': [3, 0, 0, 0] } })
    const tabla = (c.duelos[0] as { tablas: { '3': number[] } }).tablas['3']
    expect(Object.is(tabla[2], -0)).toBe(false)
    expect(extremosPorPuesto(crearConfigDePlantilla('colombiana', fijo))).toBeNull()
  })

  it('duelos de pareja: valor, tipo y perdedor resta', () => {
    const c = crearConfigDePlantilla('subterranea', fijo)
    expect(cambiarDueloPareja(c, 0, { valor: 3 }).duelos[0]).toMatchObject({ tipo: 'peor_bola', valor: 3 })
    expect(cambiarDueloPareja(c, 0, { tipo: 'mejor_bola' }).duelos[0]).toMatchObject({ tipo: 'mejor_bola', valor: 1 })
    expect(cambiarPerdedorResta(c, true).duelos[0]).toMatchObject({ perdedorResta: true })
  })

  it('puntos especiales: prender/apagar con id estable, destino para todos', () => {
    let c = crearConfigDePlantilla('colombiana', fijo)
    c = alternarPuntito(alternarPuntito(c, 'birdie'), 'greenie')
    expect(c.puntitos).toEqual([
      { id: 'birdie', tipo: 'birdie', valor: 1, destino: 'individual', activo: true },
      { id: 'greenie', tipo: 'greenie', valor: 1, destino: 'individual', activo: true },
    ])
    c = cambiarDestinoPuntitos(c, 'pareja')
    expect(alternarPuntito(c, 'sandy').puntitos.map(p => p.destino)).toEqual(['pareja', 'pareja', 'pareja'])
    expect(alternarPuntito(c, 'birdie').puntitos.map(p => p.id)).toEqual(['greenie'])
  })

  it('reparto "dividir": los duelos impares suben al par siguiente y el validador lo acepta', () => {
    const c = cambiarRepartoPareja(crearConfigDePlantilla('colombiana', fijo), 'dividir')
    expect(c.duelos.map(d => (d.tipo === 'por_puesto' ? null : d.valor))).toEqual([2, 2, 2])
    expect(cambiarRepartoPareja(c, 'total_a_cada_uno').repartoPareja).toBe('total_a_cada_uno')
  })
})
