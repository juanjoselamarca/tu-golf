import { describe, it, expect } from 'vitest'
import { chipDeFormato, esClasificacionBruta, publicaPuntos, scoreDeLaFila } from './feed-en-vivo'
import { COPY_CHIP_BRUTO, COPY_CLASIFICACION_BRUTA, COPY_SCORE_BRUTO } from '@/lib/vista-publica-copy'

const strokeGross = { formato_juego: 'stroke_play', muestra_puntos: false, clasificacion_bruta: false }
const strokeNeto = { formato_juego: 'stroke_play', muestra_puntos: false, clasificacion_bruta: true }
const stabGross = { formato_juego: 'stableford', muestra_puntos: true, clasificacion_bruta: false }
const stabNeto = { formato_juego: 'stableford', muestra_puntos: false, clasificacion_bruta: true }
const scrambleNeto = { formato_juego: 'scramble', muestra_puntos: false, clasificacion_bruta: true }

describe('feed /en-vivo — chip de formato', () => {
  it('ronda gross: el formato a secas', () => {
    expect(chipDeFormato(strokeGross)).toBe('Stroke Play')
    expect(chipDeFormato(stabGross)).toBe('Stableford')
  })

  it('ronda neto: el formato REAL más "· bruto", porque lo que viaja es la clasificación bruta', () => {
    expect(chipDeFormato(strokeNeto)).toBe('Stroke Play · bruto')
    expect(chipDeFormato(stabNeto)).toBe('Stableford · bruto')
    expect(chipDeFormato(scrambleNeto)).toBe('Scramble · bruto')
  })

  it('el chip usa el copy canónico de la vista pública, no un literal suelto', () => {
    expect(chipDeFormato(strokeNeto)).toBe(`Stroke Play · ${COPY_CHIP_BRUTO}`)
    // Misma idea que la cabecera del board ("Clasificación bruta"), en la forma corta que cabe en el chip.
    expect(COPY_CLASIFICACION_BRUTA).toBe('Clasificación bruta')
  })
})

describe('feed /en-vivo — score de la fila', () => {
  it('stroke play gross: el vs par sin etiqueta', () => {
    expect(scoreDeLaFila(strokeGross, { vsPar: 7, stablefordPts: null })).toEqual({ etiqueta: null, valor: '+7' })
    expect(scoreDeLaFila(strokeGross, { vsPar: 0, stablefordPts: null })).toEqual({ etiqueta: null, valor: 'E' })
  })

  it('stroke play NETO: el vs par es bruto y lo dice ("Gross +7"); el par también ("Gross E")', () => {
    expect(scoreDeLaFila(strokeNeto, { vsPar: 7, stablefordPts: null })).toEqual({ etiqueta: COPY_SCORE_BRUTO, valor: '+7' })
    expect(scoreDeLaFila(strokeNeto, { vsPar: 0, stablefordPts: null })).toEqual({ etiqueta: 'Gross', valor: 'E' })
    expect(scoreDeLaFila(strokeNeto, { vsPar: -2, stablefordPts: null })).toEqual({ etiqueta: 'Gross', valor: '-2' })
  })

  it('Stableford gross: puntos con unidad, sin etiqueta (no dependen del handicap)', () => {
    expect(scoreDeLaFila(stabGross, { vsPar: 4, stablefordPts: 19 })).toEqual({ etiqueta: null, valor: '19 pts' })
    expect(scoreDeLaFila(stabGross, { vsPar: 4, stablefordPts: 0 })).toEqual({ etiqueta: null, valor: '0 pts' })
  })

  it('Stableford gross sin puntos en la fila (no debería pasar): cae al vs par, nunca a "null pts"', () => {
    expect(scoreDeLaFila(stabGross, { vsPar: 4, stablefordPts: null })).toEqual({ etiqueta: null, valor: '+4' })
  })

  it('Stableford NETO llega sin puntos: golpes brutos y lo dice ("Gross +4")', () => {
    expect(scoreDeLaFila(stabNeto, { vsPar: 4, stablefordPts: null })).toEqual({ etiqueta: 'Gross', valor: '+4' })
    expect(publicaPuntos(stabNeto)).toBe(false)
  })

  it('scramble neto (fila por equipo): "Gross" delante del vs par del equipo', () => {
    expect(scoreDeLaFila(scrambleNeto, { vsPar: -3, stablefordPts: null })).toEqual({ etiqueta: 'Gross', valor: '-3' })
  })
})

describe('feed /en-vivo — respuesta cacheada de antes de `clasificacion_bruta`', () => {
  it('Stableford sin puntos se sigue sabiendo bruto; stroke play sin el campo, no (no hay cómo saberlo)', () => {
    expect(esClasificacionBruta({ formato_juego: 'stableford', muestra_puntos: false })).toBe(true)
    expect(esClasificacionBruta({ formato_juego: 'stableford', muestra_puntos: true })).toBe(false)
    expect(esClasificacionBruta({ formato_juego: 'stroke_play', muestra_puntos: false })).toBe(false)
    expect(chipDeFormato({ formato_juego: 'stableford', muestra_puntos: false })).toBe('Stableford · bruto')
  })

  it('el campo del servidor manda sobre la deducción', () => {
    expect(esClasificacionBruta({ formato_juego: 'stableford', muestra_puntos: false, clasificacion_bruta: false })).toBe(false)
    expect(esClasificacionBruta({ formato_juego: 'stroke_play', clasificacion_bruta: true })).toBe(true)
  })
})
