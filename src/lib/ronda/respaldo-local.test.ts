import { describe, it, expect, beforeEach } from 'vitest'
import {
  borrarRespaldosDeRonda, codigosConRespaldoPendiente, contarHoyosPendientes, leerRespaldoPendiente, marcarRespaldoSincronizado,
} from './respaldo-local'

const respaldo = (codigo: string, jugador: string, scores: Record<number, number>, sincronizado = false) =>
  localStorage.setItem(`golfers_score_${codigo}_${jugador}`, JSON.stringify({ scores, timestamp: 1, sincronizado, codigoRonda: codigo, jugadorId: jugador }))
const sincronizado = (codigo: string, jugador: string) => JSON.parse(localStorage.getItem(`golfers_score_${codigo}_${jugador}`)!).sincronizado

beforeEach(() => localStorage.clear())

describe('respaldo-local', () => {
  it('contarHoyosPendientes suma sólo lo no sincronizado (rondas libres y torneos) e ignora lo corrupto', () => {
    respaldo('ABC123', 'p1', { 1: 4, 2: 5 })
    respaldo('copa-2026', 'round-1', { 1: 4 })
    respaldo('ABC123', 'p2', { 1: 4 }, true)
    localStorage.setItem('golfers_score_ROTO_p1', '{no es json')
    expect(contarHoyosPendientes()).toBe(3)
  })

  it('codigosConRespaldoPendiente: un código por ronda libre, sin torneos ni sincronizados', () => {
    respaldo('ABC123', 'p1', { 1: 4 }); respaldo('ABC123', 'p2', { 1: 5 })
    respaldo('B4F5Y2X', 'p1', { 1: 4 })
    respaldo('SYNC01', 'p1', { 1: 4 }, true)
    respaldo('VACIA1', 'p1', {})
    respaldo('copa-leones-2026-k3j', 'round-1', { 1: 4 })
    expect(codigosConRespaldoPendiente().sort()).toEqual(['ABC123', 'B4F5Y2X'])
  })

  it('marcarRespaldoSincronizado con la tarjeta enviada: marca; con una más nueva en el respaldo: no', () => {
    respaldo('ABC123', 'p1', { 1: 4 })
    marcarRespaldoSincronizado('ABC123', 'p1', { 1: 4 })
    expect(sincronizado('ABC123', 'p1')).toBe(true)
    respaldo('ABC123', 'p2', { 1: 4, 2: 6 })
    marcarRespaldoSincronizado('ABC123', 'p2', { 1: 4 })
    expect(sincronizado('ABC123', 'p2')).toBe(false)
    expect(leerRespaldoPendiente('ABC123', 'p2')).toEqual({ 1: 4, 2: 6 })
  })

  it('borrarRespaldosDeRonda borra los de esa ronda y no los de otra cuyo código empieza igual', () => {
    respaldo('ABC', 'p1', { 1: 4 }); respaldo('ABC', 'p2', { 1: 4 }); respaldo('ABCD', 'p1', { 1: 4 })
    borrarRespaldosDeRonda('ABC')
    expect(leerRespaldoPendiente('ABC', 'p1')).toBeNull()
    expect(leerRespaldoPendiente('ABC', 'p2')).toBeNull()
    expect(leerRespaldoPendiente('ABCD', 'p1')).toEqual({ 1: 4 })
  })
})
