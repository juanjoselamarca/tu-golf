import { describe, it, expect } from 'vitest'
import { crearConfigDePlantilla, hoyosPorTramoParejo, type ConfigJuego } from '@/golf/formats/personalizado'
import { fraseDelJuego, type TrozoDeFrase } from './frase-del-juego'
import { ejemploDelHoyo } from './ejemplo-del-hoyo'
import { PLANTILLAS_DEL_CATALOGO, bajadaDePlantilla } from './catalogo'

const fijo = () => 0.3
const leer = (t: TrozoDeFrase[]) => t.map(x => x.texto).join('')
const valores = (t: TrozoDeFrase[]) => t.filter((x): x is Extract<TrozoDeFrase, { tipo: 'valor' }> => x.tipo === 'valor')
const elegir = (c: ConfigJuego, holes: number, nValor: number, etiqueta: string) =>
  valores(fraseDelJuego(c, holes))[nValor].opciones.find(o => o.etiqueta === etiqueta)!.config

describe('frase del juego', () => {
  it('cada plantilla se lee como en la maqueta', () => {
    expect(leer(fraseDelJuego(crearConfigDePlantilla('colombiana', fijo), 18)))
      .toBe('Parejas que rotan cada 6 hoyos. Mejor bola vale 2, peor bola 1 y la suma 1.')
    expect(leer(fraseDelJuego(crearConfigDePlantilla('colombiana', fijo), 9))).toContain('cada 3 hoyos')
    expect(leer(fraseDelJuego(crearConfigDePlantilla('dos_cero_dos'), 18)))
      .toBe('El mejor del hoyo suma 2 y el peor resta 2. Los del medio quedan en 0.')
    expect(leer(fraseDelJuego(crearConfigDePlantilla('subterranea', fijo), 18)))
      .toBe('Parejas fijas. Solo cuenta la peor bola, que vale 1.')
    expect(leer(fraseDelJuego(crearConfigDePlantilla('subterror'), 18))).toBe('Nadie suma: el peor del hoyo resta 1.')
    expect(leer(fraseDelJuego(crearConfigDePlantilla('personalizado_total'), 18)))
      .toBe('Juegan individual. El mejor del hoyo suma 2 y el peor resta 2. Los del medio quedan en 0.')
  })

  it('cada valor destacado ofrece de 2 a 4 alternativas, una activa', () => {
    for (const p of ['colombiana', 'dos_cero_dos', 'subterranea', 'subterror', 'personalizado_total'] as const) {
      for (const v of valores(fraseDelJuego(crearConfigDePlantilla(p, fijo), 18))) {
        expect(v.opciones.length).toBeGreaterThanOrEqual(2)
        expect(v.opciones.length).toBeLessThanOrEqual(4)
        expect(v.opciones.filter(o => o.activa)).toHaveLength(1)
      }
    }
  })

  it('elegir una alternativa cambia la config (y la frase)', () => {
    const c = elegir(crearConfigDePlantilla('colombiana', fijo), 18, 0, '3 puntos')
    expect(leer(fraseDelJuego(c, 18))).toContain('Mejor bola vale 3')
    const total = elegir(crearConfigDePlantilla('personalizado_total'), 18, 0, 'en parejas que rotan')
    expect(leer(fraseDelJuego(total, 18))).toBe('Juegan en parejas que rotan cada 6 hoyos. Mejor bola vale 2, peor bola 1 y la suma 1.')
    const sub = elegir(crearConfigDePlantilla('subterranea', fijo), 18, 0, 'suma')
    expect(leer(fraseDelJuego(sub, 18))).toBe('Parejas fijas. Solo cuenta la suma, que vale 1.')
    const subterror = elegir(crearConfigDePlantilla('subterror'), 18, 0, 'Suma 1')
    expect(leer(fraseDelJuego(subterror, 18))).toBe('El mejor del hoyo suma 1 y el peor resta 1. Los del medio quedan en 0.')
  })

  it('con "dividir" solo ofrece valores pares', () => {
    const c = { ...crearConfigDePlantilla('colombiana', fijo), repartoPareja: 'dividir' as const }
    expect(valores(fraseDelJuego(c, 18))[0].opciones.map(o => o.etiqueta)).toEqual(['2 puntos', '4 puntos', '6 puntos'])
  })
})

describe('ejemplo en vivo (motor real)', () => {
  it('2-0-2 y Subterror de 4 (casos dorados 3 y 9)', () => {
    expect(ejemploDelHoyo(crearConfigDePlantilla('dos_cero_dos')).puntos).toBe('Juan +2 · Pedro 0 · Diego 0 · Tomás −2')
    expect(ejemploDelHoyo(crearConfigDePlantilla('subterror')).puntos).toBe('Juan 0 · Pedro 0 · Diego 0 · Tomás −1')
  })

  it('Colombiana (caso dorado 6): mejor JP 2, peor DT 1, suma empata', () => {
    const e = ejemploDelHoyo(crearConfigDePlantilla('colombiana', fijo))
    expect(e.golpes).toBe('Par 4 · Juan 4 y Pedro 6 contra Diego 5 y Tomás 5')
    expect(e.duelos).toEqual([
      'Mejor bola: Juan y Pedro +2 · Diego y Tomás 0',
      'Peor bola: Juan y Pedro 0 · Diego y Tomás +1',
      'Suma: Juan y Pedro 0 · Diego y Tomás 0',
    ])
    expect(e.puntos).toBe('Juan +2 · Pedro +2 · Diego +1 · Tomás +1')
  })

  it('se recalcula al cambiar un valor y con "el perdedor resta"', () => {
    const c = crearConfigDePlantilla('subterranea', fijo)
    expect(ejemploDelHoyo(c).puntos).toBe('Juan 0 · Pedro 0 · Diego +1 · Tomás +1')
    const resta = { ...c, duelos: [{ tipo: 'peor_bola' as const, valor: 2, perdedorResta: true }] }
    expect(ejemploDelHoyo(resta).puntos).toBe('Juan −2 · Pedro −2 · Diego +2 · Tomás +2')
  })
})

describe('catálogo y frase: una sola fuente', () => {
  it('PLANTILLAS_DEL_CATALOGO sale de NOMBRE_PLANTILLA, sin la que se arma a mano', () => {
    expect(PLANTILLAS_DEL_CATALOGO).toEqual(['colombiana', 'dos_cero_dos', 'subterranea', 'subterror'])
  })
  it('la Colombiana dice el mismo largo de tramo que el motor (hoyosPorTramoParejo)', () => {
    for (const holes of [9, 18, 27]) {
      expect(bajadaDePlantilla('colombiana', holes)).toBe(`Parejas que rotan cada ${hoyosPorTramoParejo(holes)} hoyos`)
    }
  })
})
