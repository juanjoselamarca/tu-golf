import { describe, it, expect, beforeEach } from 'vitest'
import {
  barrerRespaldosViejos, borrarRespaldosDeRonda, codigosConRespaldoDeRondaCerrada, codigosConRespaldoPendiente, contarHoyosPendientes,
  desmarcarRespaldosDeRondaCerrada, leerRespaldoPendiente, marcarRespaldoSincronizado, marcarRespaldosDeRondaCerrada,
  DIAS_RETENCION_RESPALDO_RONDA_CERRADA, DIAS_RETENCION_RESPALDO_SINCRONIZADO,
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

const DIA = 24 * 60 * 60 * 1000
const leer = (codigo: string, jugador: string) => JSON.parse(localStorage.getItem(`golfers_score_${codigo}_${jugador}`) ?? 'null')

describe('respaldo-local — ronda cerrada (se puede reabrir, PR #763)', () => {
  it('marcar: sale del banner y de los pendientes, pero el scorer la sigue leyendo y no se borra', () => {
    respaldo('FIN999', 'p1', { 1: 4, 2: 5 }); respaldo('FIN999', 'p2', { 1: 4 }, true)
    expect(marcarRespaldosDeRondaCerrada('FIN999', 1000)).toBe(true)
    expect(contarHoyosPendientes()).toBe(0)
    expect(codigosConRespaldoPendiente()).toEqual([])
    expect(codigosConRespaldoDeRondaCerrada()).toEqual(['FIN999'])
    expect(leerRespaldoPendiente('FIN999', 'p1')).toEqual({ 1: 4, 2: 5 })
    expect(leer('FIN999', 'p2').rondaCerradaEn).toBeUndefined() // lo ya sincronizado no se marca
    expect(marcarRespaldosDeRondaCerrada('FIN999', 2000)).toBe(false) // ya marcada: conserva la fecha
    expect(leer('FIN999', 'p1').rondaCerradaEn).toBe(1000)
  })

  it('desmarcar al reabrir: vuelve al banner con sus hoyos', () => {
    respaldo('FIN999', 'p1', { 1: 4, 2: 5 })
    marcarRespaldosDeRondaCerrada('FIN999')
    expect(desmarcarRespaldosDeRondaCerrada('FIN999')).toBe(true)
    expect(contarHoyosPendientes()).toBe(2)
    expect(codigosConRespaldoDeRondaCerrada()).toEqual([])
    expect(desmarcarRespaldosDeRondaCerrada('FIN999')).toBe(false)
  })

  it('reenviada tras reabrir: marcarRespaldoSincronizado la cierra y quita la marca', () => {
    respaldo('FIN999', 'p1', { 1: 4 })
    marcarRespaldosDeRondaCerrada('FIN999')
    marcarRespaldoSincronizado('FIN999', 'p1', { 1: 4 })
    expect(leer('FIN999', 'p1')).toMatchObject({ sincronizado: true })
    expect(leer('FIN999', 'p1').rondaCerradaEn).toBeUndefined()
  })
})

describe('barrerRespaldosViejos', () => {
  const ahora = 100 * DIA
  const conFecha = (codigo: string, extra: object) => localStorage.setItem(`golfers_score_${codigo}_p1`,
    JSON.stringify({ scores: { 1: 4 }, timestamp: ahora, sincronizado: false, codigoRonda: codigo, jugadorId: 'p1', ...extra }))

  it('barre lo sincronizado viejo y lo de rondas cerradas pasado su plazo; nunca lo sin enviar de una ronda abierta', () => {
    conFecha('SYNVIE', { sincronizado: true, timestamp: ahora - (DIAS_RETENCION_RESPALDO_SINCRONIZADO + 1) * DIA })
    conFecha('SYNNUE', { sincronizado: true, timestamp: ahora - 1 * DIA })
    conFecha('CERVIE', { rondaCerradaEn: ahora - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 1) * DIA })
    conFecha('CERNUE', { rondaCerradaEn: ahora - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA - 1) * DIA })
    conFecha('ABIVIE', { timestamp: ahora - 365 * DIA })
    barrerRespaldosViejos(ahora)
    const quedan = Object.keys(localStorage).sort()
    expect(quedan).toEqual(['golfers_score_ABIVIE_p1', 'golfers_score_CERNUE_p1', 'golfers_score_SYNNUE_p1'])
  })

  it('borra todas las viejas aunque estén seguidas (antes, borrar mientras se recorría se saltaba claves)', () => {
    for (const c of ['VIEJA1', 'VIEJA2', 'VIEJA3', 'VIEJA4']) {
      conFecha(c, { sincronizado: true, timestamp: ahora - 30 * DIA })
    }
    barrerRespaldosViejos(ahora)
    expect(Object.keys(localStorage)).toEqual([])
  })
})
