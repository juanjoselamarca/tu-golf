import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMiniRanking } from './useMiniRanking'
import type { RondaLibre } from '@/types/ronda'

const ronda = {
  hoyo_inicio: 1,
  holes: 9,
  ronda_libre_jugadores: [
    { id: 'm', nombre: 'María' },
    { id: 'c', nombre: 'Carlos' },
    { id: 'd', nombre: 'Diego' },
    { id: 'p', nombre: 'Pedro' },
    { id: 's', nombre: 'Sin hoyos' },
  ],
} as unknown as RondaLibre
const parMap = { 1: 4, 2: 4 }

describe('useMiniRanking — empates estilo golf', () => {
  it('mismo vs par = T2 y T2, el siguiente 4; quien no anotó no aparece', () => {
    const scores = {
      m: { 1: 5, 2: 4 }, // +1
      c: { 1: 3, 2: 4 }, // -1
      d: { 1: 4, 2: 5 }, // +1
      p: { 1: 6, 2: 6 }, // +4
    }
    const { result } = renderHook(() => useMiniRanking(ronda, scores, parMap))
    expect(result.current.map(r => `${r.posicion} ${r.nombre}`)).toEqual(['1 Carlos', 'T2 María', 'T2 Diego', '4 Pedro'])
  })
})
