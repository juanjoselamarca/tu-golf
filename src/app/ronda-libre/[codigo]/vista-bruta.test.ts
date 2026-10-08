import { describe, it, expect } from 'vitest'
import { vistaBruta } from './vista-bruta'
import type { RondaLibre } from '@/types/ronda'

const r = (formato_juego: string) => ({ modo_juego: 'neto', formato_juego, ronda_libre_jugadores: [] }) as unknown as RondaLibre

describe('vistaBruta', () => {
  it('neto → gross; stableford y match play → stroke play (su versión bruta sería otro juego)', () => {
    expect(vistaBruta(r('stroke_play'))).toMatchObject({ modo_juego: 'gross', formato_juego: 'stroke_play' })
    expect(vistaBruta(r('stableford'))).toMatchObject({ modo_juego: 'gross', formato_juego: 'stroke_play' })
    expect(vistaBruta(r('match_play'))).toMatchObject({ modo_juego: 'gross', formato_juego: 'stroke_play' })
  })
  it('equipos siguen siendo equipos, en gross', () => {
    expect(vistaBruta(r('best_ball'))).toMatchObject({ modo_juego: 'gross', formato_juego: 'best_ball' })
    expect(vistaBruta(r('scramble'))).toMatchObject({ modo_juego: 'gross', formato_juego: 'scramble' })
  })
})
