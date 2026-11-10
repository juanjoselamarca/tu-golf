import { describe, it, expect } from 'vitest'
import { avisoDeIndicesAlFinalizar } from './aviso-indices-ronda'

const i = (federacion: number | null, golfers: number | null) => ({ federacion, golfers })

describe('avisoDeIndicesAlFinalizar: los dos índices, cada uno con su etiqueta', () => {
  it('Golfers+ bajó: se celebra y dice de dónde venía, con el de la Federación al lado', () => {
    expect(avisoDeIndicesAlFinalizar(i(18, 17.4), i(18, 17.2), true)).toEqual({
      type: 'success', title: 'Bajaste tu índice Golfers+ a 17.2', message: 'Venías de 17.4 · Federación 18.0',
    })
  })

  it('Golfers+ subió: tono neutro', () => {
    expect(avisoDeIndicesAlFinalizar(i(18, 17.2), i(18, 17.5), true)).toEqual({
      type: 'info', title: 'Tu índice Golfers+ subió a 17.5', message: 'Venías de 17.2 · Federación 18.0',
    })
  })

  it('sin cambio (o por debajo de la décima): los dos números, sin delta', () => {
    expect(avisoDeIndicesAlFinalizar(i(18, 17.2), i(18, 17.2), true).message).toBe('Golfers+ 17.2 · Federación 18.0')
    expect(avisoDeIndicesAlFinalizar(i(18, 17.21), i(18, 17.24), true).title).toBe('Ronda guardada')
  })

  it('primera vez con índice Golfers+ (no había antes): sin delta', () => {
    expect(avisoDeIndicesAlFinalizar(i(18, null), i(18, 16.9), true)).toEqual({
      type: 'success', title: 'Ronda guardada', message: 'Golfers+ 16.9 · Federación 18.0',
    })
  })

  it('menos de 3 rondas: dice cuándo se activa el Golfers+, nunca muestra el de la Federación como si se hubiera movido', () => {
    const a = avisoDeIndicesAlFinalizar(i(18, null), i(18, null), true)
    expect(a.title).toBe('Ronda guardada')
    expect(a.message).toBe('Federación 18.0 · Golfers+ se activa con 3 rondas válidas')
  })

  it('sin índice de la Federación: solo el Golfers+', () => {
    expect(avisoDeIndicesAlFinalizar(i(null, 20), i(null, 19.5), true).message).toBe('Venías de 20.0')
    expect(avisoDeIndicesAlFinalizar(i(null, null), i(null, null), true).message).toBe('Golfers+ se activa con 3 rondas válidas')
  })

  it('el recálculo falló o la lectura venció: avisa que se actualizará, con el de la Federación si se conoce', () => {
    expect(avisoDeIndicesAlFinalizar(i(18, 17.2), null, false)).toEqual({
      type: 'info', title: 'Ronda guardada', message: 'Tu índice Golfers+ se actualizará pronto · Federación 18.0',
    })
    expect(avisoDeIndicesAlFinalizar(null, null, true).message).toBe('Tu índice Golfers+ se actualizará pronto')
  })

  it('índices plus se muestran con "+", nunca en negativo; bajar a un plus es mejorar', () => {
    expect(avisoDeIndicesAlFinalizar(i(-0.5, 0.4), i(-0.5, -1), true)).toEqual({
      type: 'success', title: 'Bajaste tu índice Golfers+ a +1.0', message: 'Venías de 0.4 · Federación +0.5',
    })
  })

  it('el de la Federación nunca se narra como cambio aunque difiera entre lecturas', () => {
    const a = avisoDeIndicesAlFinalizar(i(18, 17.2), i(17, 17.2), true)
    expect(a.title).toBe('Ronda guardada')
    expect(a.message).toBe('Golfers+ 17.2 · Federación 17.0')
  })
})
