import { describe, it, expect, beforeEach } from 'vitest'
import {
  barrerRespaldosDeRondaCerrada, barrerRespaldosViejos, borrarRespaldosDeRonda, codigosConRespaldoDeRondaCerrada,
  codigosConRespaldoPendiente, contarHoyosPendientes, desmarcarRespaldosDeRondaCerrada, leerRespaldoPendiente,
  marcarRespaldoRechazado, marcarRespaldoSincronizado, marcarRespaldosDeRondaCerrada,
  DIAS_RETENCION_RECHAZADO_EN_FIRME, DIAS_RETENCION_RESPALDO_RONDA_CERRADA, DIAS_RETENCION_RESPALDO_SINCRONIZADO,
  relojPlausible,
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

describe('respaldo-local — tarjeta rechazada en firme con la ronda abierta (revisión 3, PR #763)', () => {
  it('sale del banner y del reenvío sin borrarse; un golpe nuevo la reescribe y vuelve a contar', () => {
    respaldo('ABC123', 'p1', { 1: 4, 2: 5 })
    marcarRespaldoRechazado('ABC123', 'p1', { 1: 4, 2: 5 }, 50)
    expect(contarHoyosPendientes()).toBe(0)
    expect(leerRespaldoPendiente('ABC123', 'p1')).toBeNull()
    expect(codigosConRespaldoPendiente()).toEqual([])
    expect(JSON.parse(localStorage.getItem('golfers_score_ABC123_p1')!).rechazadaEn).toBe(50)
    respaldo('ABC123', 'p1', { 1: 4, 2: 5, 3: 3 })
    expect(contarHoyosPendientes()).toBe(3)
  })

  it('con una tarjeta más nueva en el respaldo no la marca (esa todavía no se intentó)', () => {
    respaldo('ABC123', 'p1', { 1: 4, 2: 5 })
    marcarRespaldoRechazado('ABC123', 'p1', { 1: 4 })
    expect(contarHoyosPendientes()).toBe(2)
  })
})

describe('barrerRespaldosViejos', () => {
  const ahora = Date.UTC(2026, 10, 1)
  const conFecha = (codigo: string, extra: object) => localStorage.setItem(`golfers_score_${codigo}_p1`,
    JSON.stringify({ scores: { 1: 4 }, timestamp: ahora, sincronizado: false, codigoRonda: codigo, jugadorId: 'p1', ...extra }))

  it('barre lo sincronizado y lo rechazado viejos; nunca lo sin enviar, ni de una ronda vista cerrada hace mucho', () => {
    conFecha('SYNVIE', { sincronizado: true, timestamp: ahora - (DIAS_RETENCION_RESPALDO_SINCRONIZADO + 1) * DIA })
    conFecha('SYNNUE', { sincronizado: true, timestamp: ahora - 1 * DIA })
    conFecha('RECVIE', { rechazadaEn: ahora - (DIAS_RETENCION_RECHAZADO_EN_FIRME + 1) * DIA })
    conFecha('RECNUE', { rechazadaEn: ahora - 1 * DIA })
    // Vista cerrada hace más de 30 días: pudo reabrirse. Sin preguntarle al servidor no se toca (revisión 3).
    conFecha('CERVIE', { rondaCerradaEn: ahora - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 1) * DIA })
    conFecha('ABIVIE', { timestamp: ahora - 365 * DIA })
    barrerRespaldosViejos(ahora)
    const quedan = Object.keys(localStorage).sort()
    expect(quedan).toEqual(['golfers_score_ABIVIE_p1', 'golfers_score_CERVIE_p1', 'golfers_score_RECNUE_p1', 'golfers_score_SYNNUE_p1'])
  })

  it('una tarjeta rechazada con fecha de un reloj en 2010 no se borra: el plazo parte de nuevo', () => {
    conFecha('RECANT', { rechazadaEn: Date.UTC(2010, 0, 1) })
    barrerRespaldosViejos(ahora)
    expect(JSON.parse(localStorage.getItem('golfers_score_RECANT_p1')!)).toMatchObject({ rechazadaEn: ahora, scores: { 1: 4 } })
    barrerRespaldosViejos(ahora + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA)
    expect(Object.keys(localStorage)).toHaveLength(1)
    barrerRespaldosViejos(ahora + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA + 1)
    expect(Object.keys(localStorage)).toEqual([])
  })

  it('una tarjeta rechazada con fecha futura se deja como está y vence cuando la hora real la alcanza más el plazo', () => {
    const futura = ahora + 365 * DIA
    conFecha('RECFUT', { rechazadaEn: futura })
    barrerRespaldosViejos(ahora)
    expect(JSON.parse(localStorage.getItem('golfers_score_RECFUT_p1')!).rechazadaEn).toBe(futura)
    barrerRespaldosViejos(futura + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA)
    expect(Object.keys(localStorage)).toHaveLength(1)
    barrerRespaldosViejos(futura + DIAS_RETENCION_RECHAZADO_EN_FIRME * DIA + 1)
    expect(Object.keys(localStorage)).toEqual([])
  })

  it('reloj atrasado pero plausible al barrer (Android sin red en la fecha de compilación): al volver la hora real la tarjeta sigue', () => {
    conFecha('RECREAL', { rechazadaEn: ahora })
    // Precondición: el reloj atrasado tiene que pasar el piso, si no el test pasa en vacío por el guard de arriba.
    expect(relojPlausible(ahora - 120 * DIA)).toBe(true)
    barrerRespaldosViejos(ahora - 120 * DIA)
    barrerRespaldosViejos(ahora + DIA)
    expect(JSON.parse(localStorage.getItem('golfers_score_RECREAL_p1')!).rechazadaEn).toBe(ahora)
  })

  it('con el reloj del teléfono en 2010 (se reinició sin red) no barre ni reescribe nada', () => {
    conFecha('RECVIE', { rechazadaEn: ahora - (DIAS_RETENCION_RECHAZADO_EN_FIRME + 1) * DIA })
    conFecha('SYNVIE', { sincronizado: true, timestamp: ahora - (DIAS_RETENCION_RESPALDO_SINCRONIZADO + 1) * DIA })
    conFecha('CERVIE', { rondaCerradaEn: ahora - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 1) * DIA })
    const antes = { ...localStorage }
    barrerRespaldosViejos(Date.UTC(2010, 0, 1))
    barrerRespaldosDeRondaCerrada('CERVIE', Date.UTC(2010, 0, 1))
    expect({ ...localStorage }).toEqual(antes)
  })

  it('barrerRespaldosDeRondaCerrada: una marca de cierre con fecha que no sirve reinicia el plazo en vez de borrar', () => {
    conFecha('CERANT', { rondaCerradaEn: Date.UTC(2010, 0, 1) })
    barrerRespaldosDeRondaCerrada('CERANT', ahora)
    expect(JSON.parse(localStorage.getItem('golfers_score_CERANT_p1')!).rondaCerradaEn).toBe(ahora)
  })

  it('barrerRespaldosDeRondaCerrada: reloj atrasado pero plausible no reescribe la marca; al volver la hora real sigue', () => {
    conFecha('CERREAL', { rondaCerradaEn: ahora })
    expect(relojPlausible(ahora - 120 * DIA)).toBe(true)
    barrerRespaldosDeRondaCerrada('CERREAL', ahora - 120 * DIA)
    barrerRespaldosDeRondaCerrada('CERREAL', ahora + DIA)
    expect(leer('CERREAL', 'p1')).toMatchObject({ rondaCerradaEn: ahora, scores: { 1: 4 } })
  })

  it('barrerRespaldosDeRondaCerrada: sólo esa ronda, sólo lo marcado pasado su plazo', () => {
    conFecha('CERVIE', { rondaCerradaEn: ahora - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 1) * DIA })
    conFecha('CERVIEX', { rondaCerradaEn: ahora - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 1) * DIA })
    localStorage.setItem('golfers_score_CERVIE_p2', JSON.stringify({ scores: { 1: 4 }, timestamp: ahora, sincronizado: false, codigoRonda: 'CERVIE', jugadorId: 'p2', rondaCerradaEn: ahora - 1 * DIA }))
    barrerRespaldosDeRondaCerrada('CERVIE', ahora)
    expect(Object.keys(localStorage).sort()).toEqual(['golfers_score_CERVIEX_p1', 'golfers_score_CERVIE_p2'])
  })

  it('borra todas las viejas aunque estén seguidas (antes, borrar mientras se recorría se saltaba claves)', () => {
    for (const c of ['VIEJA1', 'VIEJA2', 'VIEJA3', 'VIEJA4']) {
      conFecha(c, { sincronizado: true, timestamp: ahora - 30 * DIA })
    }
    barrerRespaldosViejos(ahora)
    expect(Object.keys(localStorage)).toEqual([])
  })
})
