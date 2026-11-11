/**
 * El banner "Sincronizando N hoyos…" quedaba para siempre cuando la ronda se borró (o se cerró)
 * sin que el jugador estuviera en su scorer: nadie limpiaba el respaldo (PR #763, revisión 1).
 * El conciliador pregunta al servidor por cada ronda con respaldo pendiente y limpia SOLO con
 * respuesta firme: no existe (PGRST116) o finalizada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

type Resp = { data: unknown; error: unknown }
const { respuestas, consultas } = vi.hoisted(() => ({
  respuestas: new Map<string, Resp | 'lanza' | 'tarda15s'>(),
  consultas: [] as string[],
}))
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, codigo: string) => ({
          single: async () => {
            consultas.push(codigo)
            const r = respuestas.get(codigo)
            if (r === 'lanza') throw new TypeError('Failed to fetch')
            if (r === 'tarda15s') return new Promise<Resp>(res => setTimeout(() => res({ data: null, error: { code: 'PGRST116', message: '0 rows' } }), 15_000))
            return r ?? { data: { estado: 'en_curso' }, error: null }
          },
        }),
      }),
    }),
  }),
}))

import { conciliarRespaldos, useConciliarRespaldos } from './useConciliarRespaldos'
import {
  barrerRespaldosViejos, contarHoyosPendientes, leerRespaldoPendiente, DIAS_RETENCION_RESPALDO_RONDA_CERRADA,
  DIA_MS, DIAS_RETENCION_RECHAZADO_EN_FIRME,
} from '@/lib/ronda/respaldo-local'

const respaldo = (codigo: string, jugador: string, sincronizado = false) => localStorage.setItem(
  `golfers_score_${codigo}_${jugador}`,
  JSON.stringify({ scores: { 1: 4 }, timestamp: Date.now(), sincronizado, codigoRonda: codigo, jugadorId: jugador }),
)
const hay = (k: string) => localStorage.getItem(k) != null

let online = true
beforeEach(() => {
  localStorage.clear(); respuestas.clear(); consultas.length = 0; online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => vi.restoreAllMocks())

describe('conciliarRespaldos', () => {
  it('ronda borrada (PGRST116): limpia TODA su copia local, de los dos scorers', async () => {
    respaldo('ABC123', 'p1'); respaldo('ABC123', 'p2')
    localStorage.setItem('ronda_ABC123_p1', '{"1":4}')
    localStorage.setItem('ronda_grupo_ABC123', '{}')
    localStorage.setItem('ronda_grupo_pendientes_ABC123', '{}')
    respuestas.set('ABC123', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    expect(await conciliarRespaldos()).toEqual(['ABC123'])
    for (const k of ['golfers_score_ABC123_p1', 'golfers_score_ABC123_p2', 'ronda_ABC123_p1', 'ronda_grupo_ABC123', 'ronda_grupo_pendientes_ABC123']) {
      expect(hay(k)).toBe(false)
    }
  })

  it('ronda finalizada (se puede reabrir: cerrar un torneo cierra sus rondas): NO borra; el banner deja de contarla', async () => {
    respaldo('FIN999', 'p1')
    localStorage.setItem('ronda_FIN999_p1', '{"1":4}')
    respuestas.set('FIN999', { data: { estado: 'finalizada' }, error: null })
    expect(await conciliarRespaldos()).toEqual(['FIN999'])
    expect(contarHoyosPendientes()).toBe(0)
    expect(hay('golfers_score_FIN999_p1')).toBe(true)
    expect(hay('ronda_FIN999_p1')).toBe(true)
    // El scorer sigue viendo la tarjeta sin enviar (la mezcla y la reenvía si la ronda se reabre).
    expect(leerRespaldoPendiente('FIN999', 'p1')).toEqual({ 1: 4 })
  })

  it('la ronda se reabre (vuelve a en_curso): quita la marca y el banner vuelve a contarla', async () => {
    respaldo('FIN999', 'p1')
    respuestas.set('FIN999', { data: { estado: 'finalizada' }, error: null })
    await conciliarRespaldos()
    expect(contarHoyosPendientes()).toBe(0)
    respuestas.set('FIN999', { data: { estado: 'en_curso' }, error: null })
    expect(await conciliarRespaldos()).toEqual(['FIN999'])
    expect(contarHoyosPendientes()).toBe(1)
    expect(leerRespaldoPendiente('FIN999', 'p1')).toEqual({ 1: 4 })
  })

  it('vista cerrada hace más de 30 días y REABIERTA: abrir un scorer (barrido) y conciliar no la pierden', async () => {
    const viejo = Date.now() - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 5) * 24 * 60 * 60 * 1000
    localStorage.setItem('golfers_score_FIN999_p1', JSON.stringify({
      scores: { 1: 4 }, timestamp: viejo, sincronizado: false, codigoRonda: 'FIN999', jugadorId: 'p1', rondaCerradaEn: viejo,
    }))
    // El scorer barre al montar, ANTES de que el conciliador sepa que se reabrió.
    barrerRespaldosViejos()
    expect(hay('golfers_score_FIN999_p1')).toBe(true)
    respuestas.set('FIN999', { data: { estado: 'en_curso' }, error: null })
    await conciliarRespaldos()
    expect(leerRespaldoPendiente('FIN999', 'p1')).toEqual({ 1: 4 })
    expect(contarHoyosPendientes()).toBe(1)
  })

  it('vista cerrada hace más de 30 días y el servidor confirma que SIGUE cerrada: ahí se barre', async () => {
    const viejo = Date.now() - (DIAS_RETENCION_RESPALDO_RONDA_CERRADA + 5) * 24 * 60 * 60 * 1000
    localStorage.setItem('golfers_score_FIN999_p1', JSON.stringify({
      scores: { 1: 4 }, timestamp: viejo, sincronizado: false, codigoRonda: 'FIN999', jugadorId: 'p1', rondaCerradaEn: viejo,
    }))
    respaldo('FIN999', 'p2') // recién vista cerrada: se marca y se queda
    respuestas.set('FIN999', { data: { estado: 'finalizada' }, error: null })
    await conciliarRespaldos()
    expect(hay('golfers_score_FIN999_p1')).toBe(false)
    expect(hay('golfers_score_FIN999_p2')).toBe(true)
  })

  it('una ronda cerrada que después se borra: ahí sí limpia', async () => {
    respaldo('FIN999', 'p1')
    respuestas.set('FIN999', { data: { estado: 'finalizada' }, error: null })
    await conciliarRespaldos()
    respuestas.set('FIN999', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    expect(await conciliarRespaldos()).toEqual(['FIN999'])
    expect(hay('golfers_score_FIN999_p1')).toBe(false)
  })

  it('consulta que no responde: a los 10 s se rinde sin tocar nada, y la respuesta tardía tampoco borra', async () => {
    vi.useFakeTimers()
    try {
      respaldo('LENTA1', 'p1')
      respuestas.set('LENTA1', 'tarda15s')
      const p = conciliarRespaldos()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await p).toEqual([])
      expect(hay('golfers_score_LENTA1_p1')).toBe(true)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(hay('golfers_score_LENTA1_p1')).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('una sola consulta por código aunque tenga varios jugadores', async () => {
    respaldo('ABC123', 'p1'); respaldo('ABC123', 'p2'); respaldo('XYZ789', 'p1')
    await conciliarRespaldos()
    expect(consultas.sort()).toEqual(['ABC123', 'XYZ789'])
  })

  it('inverso: ronda en curso, error de red, error distinto de PGRST116 o sesión vencida: no toca nada', async () => {
    respaldo('VIVA01', 'p1'); respaldo('REDCAE', 'p1'); respaldo('ERR500', 'p1'); respaldo('JWTVEN', 'p1'); respaldo('PERMIS', 'p1')
    respuestas.set('REDCAE', 'lanza')
    respuestas.set('ERR500', { data: null, error: { code: '', message: 'Failed to fetch' } })
    respuestas.set('JWTVEN', { data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
    respuestas.set('PERMIS', { data: null, error: { code: '42501', message: 'permission denied' } })
    expect(await conciliarRespaldos()).toEqual([])
    for (const c of ['VIVA01', 'REDCAE', 'ERR500', 'JWTVEN', 'PERMIS']) expect(hay(`golfers_score_${c}_p1`)).toBe(true)
  })

  it('inverso: sin conexión no consulta ni limpia', async () => {
    online = false
    respaldo('ABC123', 'p1')
    respuestas.set('ABC123', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    expect(await conciliarRespaldos()).toEqual([])
    expect(consultas).toEqual([])
    expect(hay('golfers_score_ABC123_p1')).toBe(true)
  })

  it('no consulta respaldos ya sincronizados ni los de torneo (slug en minúsculas)', async () => {
    respaldo('ABC123', 'p1', true)
    respaldo('copa-leones-2026-k3j', 'round-1')
    expect(await conciliarRespaldos()).toEqual([])
    expect(consultas).toEqual([])
    expect(hay('golfers_score_copa-leones-2026-k3j_round-1')).toBe(true)
  })

  it('barre los golpes apartados del scorer de grupo de hace más de 30 días, aun sin conexión (P3-3 del #763)', async () => {
    online = false
    const hace31Dias = Date.now() - (DIAS_RETENCION_RECHAZADO_EN_FIRME + 1) * DIA_MS
    localStorage.setItem('ronda_grupo_rechazados_ABC123', JSON.stringify({ p2: { 10: 5 } }))
    localStorage.setItem('ronda_grupo_rechazo_en_ABC123', String(hace31Dias))
    localStorage.setItem('ronda_grupo_rechazados_XYZ789', JSON.stringify({ p2: { 10: 5 } }))
    localStorage.setItem('ronda_grupo_rechazo_en_XYZ789', String(Date.now()))
    await conciliarRespaldos()
    expect(hay('ronda_grupo_rechazados_ABC123')).toBe(false)
    expect(hay('ronda_grupo_rechazo_en_ABC123')).toBe(false)
    expect(hay('ronda_grupo_rechazados_XYZ789')).toBe(true)
  })
})

describe('useConciliarRespaldos', () => {
  it('concilia al montar y al volver la conexión; no en cada render', async () => {
    respaldo('ABC123', 'p1')
    const onLimpio = vi.fn()
    const { rerender } = renderHook(() => useConciliarRespaldos(onLimpio))
    await waitFor(() => expect(consultas).toEqual(['ABC123']))
    rerender(); rerender()
    expect(consultas).toEqual(['ABC123'])
    respuestas.set('ABC123', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(onLimpio).toHaveBeenCalledTimes(1))
    expect(consultas).toEqual(['ABC123', 'ABC123'])
    expect(hay('golfers_score_ABC123_p1')).toBe(false)
  })
})
